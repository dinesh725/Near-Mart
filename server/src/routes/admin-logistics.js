const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const { authenticate, authorize } = require("../middleware/auth");
const { NotFound, BadRequest } = require("../utils/errors");
const { notify } = require("../services/notificationService");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

// ── Stuck Orders (in READY_FOR_PICKUP > 15 min without rider) ────────────────
router.get("/stuck-orders", authenticate, authorize("admin", "super_admin"), async (req, res, next) => {
    try {
        const threshold = new Date(Date.now() - 15 * 60 * 1000);
        const orders = await Order.find({
            status: "READY_FOR_PICKUP",
            updatedAt: { $lt: threshold },
        }).sort({ updatedAt: 1 }).limit(50);

        res.json({ ok: true, count: orders.length, orders });
    } catch (err) { next(err); }
});

// ── Rejected Orders (rejected by multiple riders) ────────────────────────────
router.get("/rejected-orders", authenticate, authorize("admin", "super_admin"), async (req, res, next) => {
    try {
        const orders = await Order.find({
            rejectionCount: { $gte: 3 },
            status: { $nin: ["DELIVERED", "CANCELLED"] },
        }).sort({ rejectionCount: -1 }).limit(50);

        res.json({ ok: true, count: orders.length, orders });
    } catch (err) { next(err); }
});

// ── Escalation Required ──────────────────────────────────────────────────────
router.get("/escalated-orders", authenticate, authorize("admin", "super_admin"), async (req, res, next) => {
    try {
        const orders = await Order.find({
            escalationRequired: true,
            status: { $nin: ["DELIVERED", "CANCELLED"] },
        }).sort({ updatedAt: 1 }).limit(50);

        res.json({ ok: true, count: orders.length, orders });
    } catch (err) { next(err); }
});

// ── Idle Riders (accepted order but stale activity) ──────────────────────────
router.get("/idle-riders", authenticate, authorize("admin", "super_admin"), async (req, res, next) => {
    try {
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const riders = await User.find({
            role: "delivery",
            isOnline: true,
            activeOrderIds: { $exists: true, $ne: [] },
            $or: [
                { lastActivityAt: { $lt: tenMinsAgo } },
                { lastActivityAt: null },
            ],
        }).select("name email phone isOnline lastActivityAt activeOrderIds shiftStartedAt").limit(50);

        res.json({ ok: true, count: riders.length, riders });
    } catch (err) { next(err); }
});

// ── Manual Dispatch Override ─────────────────────────────────────────────────
router.post("/manual-dispatch", authenticate, authorize("admin", "super_admin"), async (req, res, next) => {
    try {
        const { orderId, riderId } = req.body;
        if (!orderId || !riderId) throw new BadRequest("orderId and riderId required");

        const order = await Order.findById(orderId);
        if (!order) throw new NotFound("Order not found");
        if (order.status !== "READY_FOR_PICKUP") throw new BadRequest(`Order status is ${order.status}, must be READY_FOR_PICKUP`);

        const rider = await User.findById(riderId);
        if (!rider || rider.role !== "delivery") throw new NotFound("Delivery partner not found");

        // Atomic assignment
        order.acceptedByPartnerId = riderId;
        order.acceptedAt = new Date();
        order.escalationRequired = false;
        order.dispatchLog.push({ riderId, action: "manual_dispatch", timestamp: new Date() });
        await order.save();

        // Update rider load
        if (rider.activeOrderIds) {
            rider.activeOrderIds.push(order._id);
        } else {
            rider.activeOrderIds = [order._id];
        }
        rider.activeOrderId = rider.activeOrderIds[0];
        rider.lastActivityAt = new Date();
        await rider.save();

        // Notify rider
        const io = req.app.get("io");
        if (io) {
            io.to(`delivery_${riderId}`).emit("orderAssigned", order);
            io.emit("orderRemovedFromQueue", { orderId: order._id });
        }
        await notify("delivery", `Admin assigned order ${order._id} to you`, "alert", riderId);

        // Audit trail
        await AuditLog.create({
            action: "manual_dispatch", actorId: req.user._id,
            actorName: req.user.name, actorRole: req.user.role,
            targetId: order._id.toString(), targetType: "order",
            details: { riderId, riderName: rider.name },
            ipAddress: req.ip || "unknown",
        }).catch(() => {});

        res.json({ ok: true, msg: "Order manually dispatched", order });
    } catch (err) { next(err); }
});

// ── Online Riders Overview ───────────────────────────────────────────────────
router.get("/online-riders", authenticate, authorize("admin", "super_admin"), async (req, res, next) => {
    try {
        const riders = await User.find({
            role: "delivery",
            isOnline: true,
        }).select("name phone isOnline lastActivityAt activeOrderIds shiftStartedAt location rating").limit(100);

        res.json({ ok: true, count: riders.length, riders });
    } catch (err) { next(err); }
});

module.exports = router;
