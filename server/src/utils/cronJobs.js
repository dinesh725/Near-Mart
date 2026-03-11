const cron = require("node-cron");
const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("./logger");
const mongoose = require("mongoose");

const startCronJobs = (app) => {
    // ── Every 1 Minute: Rider Timeout, Radius Expansion, Auto-Offline, Escalation ──
    cron.schedule("* * * * *", async () => {
        try {
            const io = app.get("io");
            const now = new Date();

            // ── 1. Unassign Dead Assignments (assigned but no pickup in 15 min) ────
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
                // Add driver to exclude list
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

                logger.info(`[Auto-Timeout] Stuck Order ${order._id} unassigned from ${riderId}. Rider excluded from route.`);
                // Trigger Dispatch Engine to reassign!
                const { triggerDispatch } = require("./dispatchEngine");
                setImmediate(() => triggerDispatch(app));
            }

            // ── 2. Dead Order Escalation (unassigned > 20 mins) ──────────
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
                
                logger.warn(`[ESCALATION] Order ${order._id} is starving for 20 mins — Admin dispatch required`);
                const { notify } = require("../services/notificationService");
                await notify("admin", `🚨 Starving Order: ${order._id} has sat for 20 mins with no riders.`, "alert");
            }

            // ── 3. Stuck "On the Way" Recovery (Rider picked up but didn't drop off > 60 mins) ──
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

                logger.error(`[CRITICAL] Order ${order._id} stranded with Rider ${order.acceptedByPartnerId} for >1HR. Support flagged.`);
                const { notify } = require("../services/notificationService");
                await notify("admin", `🚨 STRANDED ORDER ${order._id}: Ghost rider timeout > 60m`, "alert");
            }

            // ── 4. Auto-Offline: ghost rider detection (inactive > 15 min) ───────
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

                logger.info(`[Auto-Offline] Rider ${rider._id} (${rider.name}) set offline due to inactivity`);
                if (io) io.to(`delivery_${rider._id}`).emit("forceOffline", { reason: "Inactivity timeout (15 min)" });
            }

            // ── 5. Clean up Abandoned PENDING_PAYMENT Checkouts ───────────────
            const abandonedOrders = await Order.find({
                status: "PENDING_PAYMENT",
                createdAt: { $lt: fifteenMinsAgo }
            });

            if (abandonedOrders.length > 0) {
                logger.info(`[Auto-Cleanup] Found ${abandonedOrders.length} abandoned orders. Releasing stock...`);
                for (const order of abandonedOrders) {
                    const Product = mongoose.model("Product");
                    for (const item of order.items) {
                        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
                    }
                    order.status = "CANCELLED";
                    order.paymentStatus = "failed";
                    order.cancelReason = "Payment timeout (abandoned cart)";
                    order.events.push({ status: "CANCELLED", note: "Payment abandoned after 15 minutes, reserved stock released" });
                    await order.save();
                }
            }
        } catch (error) {
            logger.error("[Cron Error] Background job failed: " + (error.stack || error.message || JSON.stringify(error)));
        }
    });
};

module.exports = { startCronJobs };
