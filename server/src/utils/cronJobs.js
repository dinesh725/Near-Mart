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

            // ── 1. Unassign passive riders (accepted but no pickup in 10 min) ────
            const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);

            const stalledOrders = await Order.find({
                status: "READY_FOR_PICKUP",
                acceptedByPartnerId: { $ne: null },
                updatedAt: { $lt: tenMinsAgo },
            });

            for (const order of stalledOrders) {
                const riderId = order.acceptedByPartnerId;

                order.acceptedByPartnerId = null;
                order.riderName = null;
                order.failedAssignmentCount = (order.failedAssignmentCount || 0) + 1;
                order.assignedRadius = Math.min((order.assignedRadius || 3000) + 2000, 7000);
                order.updatedAt = new Date();
                order.dispatchLog.push({ riderId, action: "timeout", timestamp: now });
                await order.save();

                const rider = await User.findById(riderId);
                if (rider && rider.activeOrderIds) {
                    rider.activeOrderIds = rider.activeOrderIds.filter(id => id.toString() !== order._id.toString());
                    rider.activeOrderId = rider.activeOrderIds.length > 0 ? rider.activeOrderIds[0] : null;
                    await rider.save();

                    if (io) io.to(`delivery_${riderId}`).emit("orderCancelled", { orderId: order._id, reason: "Timeout: Delivery acceptance expired." });
                    await notify("delivery", `Order ${order._id} was unassigned due to timeout.`, "alert", riderId);
                }

                logger.info(`[Auto-Timeout] Order ${order._id} unassigned from ${riderId}. Radius expanded to ${order.assignedRadius}m`);
                if (io) io.emit("orderNearbyAvailable", { orderId: order._id, location: order.pickupLocation, radius: order.assignedRadius });
            }

            // ── 2. Expand search radius for unaccepted orders (> 5 min) ──────────
            const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
            const ignoredOrders = await Order.find({
                status: "READY_FOR_PICKUP",
                acceptedByPartnerId: null,
                updatedAt: { $lt: fiveMinsAgo },
                assignedRadius: { $lt: 7000 },
            });

            for (const order of ignoredOrders) {
                order.assignedRadius = Math.min((order.assignedRadius || 3000) + 2000, 7000);
                order.failedAssignmentCount = (order.failedAssignmentCount || 0) + 1;
                order.updatedAt = new Date();
                await order.save();

                logger.info(`[Auto-Expand] Order ${order._id} radius expanded to ${order.assignedRadius}m`);
                if (io) io.emit("orderNearbyAvailable", { orderId: order._id, location: order.pickupLocation, radius: order.assignedRadius });
            }

            // ── 3. Emergency Escalation (max radius reached, still no rider) ─────
            const escalationOrders = await Order.find({
                status: "READY_FOR_PICKUP",
                acceptedByPartnerId: null,
                assignedRadius: { $gte: 7000 },
                escalationRequired: { $ne: true },
                updatedAt: { $lt: fiveMinsAgo },
            });

            for (const order of escalationOrders) {
                order.escalationRequired = true;
                await order.save();

                logger.warn(`[ESCALATION] Order ${order._id} requires admin dispatch — max radius reached with no rider`);
                await notify("admin", `🚨 Order ${order._id} needs manual dispatch — no riders available within 7km`, "alert");
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
