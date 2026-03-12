const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const { notify } = require("../services/notificationService");

const setupCronWorkers = (app) => {
    const io = app.get("io");

    const cronWorker = new Worker("cronJobs", async (job) => {
        const now = new Date();
        const { type } = job.data;
        
        try {
            if (type === "cleanupAbandonedCarts") {
                const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
                const abandonedOrders = await Order.find({
                    status: "PENDING_PAYMENT",
                    createdAt: { $lt: fifteenMinsAgo }
                });

                if (abandonedOrders.length > 0) {
                    logger.info(`[Queue Worker] Found ${abandonedOrders.length} abandoned orders. Releasing stock...`);
                    for (const order of abandonedOrders) {
                        const Product = mongoose.model("Product");
                        for (const item of order.items) {
                            let updateQuery = { $inc: { stock: item.qty } };
                            if (item.selectedVariant && item.selectedVariant.variantId) {
                                await Product.findOneAndUpdate(
                                    { _id: item.productId },
                                    { $inc: { "variants.$[v].stock": item.qty } },
                                    { arrayFilters: [{ "v.variantId": item.selectedVariant.variantId }] }
                                );
                            } else if (item.selectedVariant && item.selectedVariant.name) {
                                await Product.findOneAndUpdate(
                                    { _id: item.productId },
                                    { $inc: { "variants.$[v].stock": item.qty } },
                                    { arrayFilters: [{ "v.name": item.selectedVariant.name }] }
                                );
                            } else {
                                await Product.findByIdAndUpdate(item.productId, updateQuery);
                            }
                        }
                        order.status = "CANCELLED";
                        order.paymentStatus = "failed";
                        order.cancelReason = "Payment timeout (abandoned cart)";
                        order.events.push({ status: "CANCELLED", note: "Queue: Payment abandoned after 15 minutes, stock released" });
                        await order.save();
                    }
                }
            } else if (type === "unassignDeadAssignments") {
                const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
                const stalledOrders = await Order.find({
                    status: { $in: ["RIDER_ASSIGNED", "ARRIVED_AT_STORE"] },
                    acceptedByPartnerId: { $ne: null },
                    updatedAt: { $lt: fifteenMinsAgo },
                });

                for (const order of stalledOrders) {
                    const riderId = order.acceptedByPartnerId;
                    order.status = "READY_FOR_PICKUP";
                    order.acceptedByPartnerId = null;
                    order.riderName = null;
                    order.failedAssignmentCount = (order.failedAssignmentCount || 0) + 1;
                    if (!order.rejectedByPartnerIds) order.rejectedByPartnerIds = [];
                    order.rejectedByPartnerIds.push(riderId);
                    
                    order.updatedAt = new Date();
                    order.dispatchLog.push({ riderId, action: "stuck_timeout", timestamp: now });
                    await order.save();

                    const rider = await User.findById(riderId);
                    if (rider && rider.activeOrderIds) {
                        rider.activeOrderIds = rider.activeOrderIds.filter(id => id.toString() !== order._id.toString());
                        rider.activeOrderId = rider.activeOrderIds.length > 0 ? rider.activeOrderIds[0] : null;
                        await rider.save();

                        if (io) io.to(`delivery_${riderId}`).emit("orderCancelled", { orderId: order._id, reason: "Timeout: You did not move to the store within 15 minutes." });
                    }

                    logger.info(`[Queue] Stuck Order ${order._id} unassigned from ${riderId}. Rider excluded from route.`);
                    // Fire dispatch engine
                    const { triggerDispatch } = require("../utils/dispatchEngine");
                    setImmediate(() => triggerDispatch(app));
                }
            } else if (type === "escalateStarvingOrders") {
                const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000);
                const deadOrders = await Order.find({
                    status: "READY_FOR_PICKUP",
                    acceptedByPartnerId: null,
                    escalationRequired: { $ne: true },
                    updatedAt: { $lt: twentyMinsAgo },
                });

                for (const order of deadOrders) {
                    order.escalationRequired = true;
                    await order.save();
                    logger.warn(`[Queue: ESCALATION] Order ${order._id} is starving for 20 mins`);
                    await notify("admin", `🚨 Starving Order: ${order._id} has sat for 20 mins with no riders.`, "alert");
                }

                // Check lost/stranded
                const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                const lostDeliveries = await Order.find({
                    status: { $in: ["PICKED_UP", "ON_THE_WAY", "ARRIVED_AT_CUSTOMER", "OUT_FOR_DELIVERY"] },
                    updatedAt: { $lt: oneHourAgo },
                    flagged: { $ne: true }
                });

                for (const order of lostDeliveries) {
                    order.flagged = true;
                    order.deliveryIssue = "Apparent Rider Abandonment / App crash > 1 hr";
                    await order.save();
                    logger.error(`[Queue: CRITICAL] Order ${order._id} stranded with Rider ${order.acceptedByPartnerId} for >1HR.`);
                    await notify("admin", `🚨 STRANDED ORDER ${order._id}: Ghost rider timeout > 60m`, "alert");
                }
            } else if (type === "offlineGhostRiders") {
                const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
                const ghostRiders = await User.find({
                    role: "delivery",
                    isOnline: true,
                    activeOrderIds: { $size: 0 },
                    $or: [
                        { lastActivityAt: { $lt: fifteenMinsAgo } },
                        { lastActivityAt: null, shiftStartedAt: { $lt: fifteenMinsAgo } },
                    ],
                });

                for (const rider of ghostRiders) {
                    rider.isOnline = false;
                    rider.shiftEndedAt = now;
                    await rider.save();
                    
                    // Remove from Redis (Security Fix)
                    try {
                        await redisClient.zrem("riders:locations", rider._id.toString());
                        await redisClient.hdel(`rider:${rider._id}:meta`, "data");
                    } catch (e) {
                        logger.warn(`Redis ghost cleanup failed for rider ${rider._id}`);
                    }

                    logger.info(`[Queue] Rider ${rider._id} (${rider.name}) set offline due to inactivity`);
                    if (io) io.to(`delivery_${rider._id}`).emit("forceOffline", { reason: "Inactivity timeout (15 min)" });
                }
            }

        } catch (error) {
            logger.error(`[Queue] Worker error on task ${type}: ${error.message}`);
        }
    }, { connection: redisClient });

    cronWorker.on("completed", (job) => logger.debug(`[Queue] Job ${job.name} (${job.id}) completed successfully`));
    cronWorker.on("failed", (job, err) => logger.error(`[Queue] Job ${job.name} (${job.id}) failed with error: ${err.message}`));
    
    return cronWorker;
};

module.exports = { setupCronWorkers };
