const express = require("express");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const { authenticate, authorize } = require("../middleware/auth");
const validateJoi = require("../middleware/validateJoi");
const orderValidation = require("../validations/order.validation");
const { BadRequest, NotFound, Forbidden } = require("../utils/errors");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");
const { haversineKm: haversineDistance, haversineStrict } = require("../utils/geo");
const { notify } = require("../services/notificationService");
const { generateRoute, calcDeliveryFee, reverseGeocode } = require("../services/geocoding");
const { processTransaction } = require("../services/ledgerService");

const router = express.Router();

// ── Available Orders (delivery partner) ──────────────────────────────────────
// Must be before /:id routes to avoid conflict
router.get("/available", authenticate, authorize("delivery"), async (req, res, next) => {
    try {
        const { lat, lng } = req.query;

        // Ensure rider is online and has no active delivery
        if (!req.user.isOnline || req.user.activeOrderId) {
            return res.json({ ok: true, orders: [] }); // Hide all orders
        }

        let filter = {
            status: "READY_FOR_PICKUP",
            acceptedByPartnerId: null,
        };

        // Geo-filter to 3000m (3km) if location provided
        if (lat && lng) {
            filter["pickupLocation.coordinates"] = {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                    $maxDistance: 3000,
                }
            };
        }

        // In advanced batching mode, group results by batchId on the client side, or just send raw
        const orders = await Order.find(filter).sort({ createdAt: 1 }).limit(20);

        res.json({ ok: true, count: orders.length, orders });
    } catch (err) { next(err); }
});

// ── [PHASE-7] Legacy POST /orders — DISABLED ─────────────────────────────────
// This route previously created orders WITHOUT payment processing, allowing
// sellers to receive and act on unpaid orders. All order creation MUST now go
// through POST /payments/checkout which enforces payment-before-notification.
router.post("/",
    authenticate, authorize("customer"),
    async (req, res, next) => {
        try {
            // Phase-7: All order creation must go through /payments/checkout
            return res.status(410).json({
                ok: false,
                error: "This endpoint is deprecated. Use POST /api/payments/checkout instead.",
                redirect: "/api/payments/checkout"
            });
        } catch (err) { next(err); }
    }
);

// ── Get Orders (role-filtered, searchable, filterable) ────────────────────────
router.get("/", authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        let filter = {};
        switch (req.user.role) {
            case "customer": filter.customerId = req.user._id; break;
            case "seller":
                // Phase-8: Seller data isolation — enforce ownership
                filter.sellerId = req.user._id;
                filter.status = { $nin: ["PENDING_PAYMENT"] };
                break;
            case "delivery": filter.$or = [
                { deliveryPartnerId: req.user._id },
                { acceptedByPartnerId: req.user._id },
            ]; break;
            case "admin":
            case "support": break;
            default: filter.customerId = req.user._id;
        }

        // Multi-status filter (comma-separated, e.g. ?status=CONFIRMED,PREPARING)
        if (req.query.status) {
            const statuses = req.query.status.split(",").map(s => s.trim()).filter(Boolean);
            if (statuses.length === 1) filter.status = statuses[0];
            else if (statuses.length > 1) filter.status = { $in: statuses };
        }

        // Time-period filter
        if (req.query.period) {
            const now = new Date();
            let startDate;
            switch (req.query.period) {
                case "today":
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case "yesterday": {
                    const y = new Date(now); y.setDate(y.getDate() - 1);
                    startDate = new Date(y.getFullYear(), y.getMonth(), y.getDate());
                    filter.createdAt = {
                        $gte: startDate,
                        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate())
                    };
                    break;
                }
                case "week":
                    startDate = new Date(now); startDate.setDate(startDate.getDate() - 7);
                    break;
                case "month":
                    startDate = new Date(now); startDate.setDate(startDate.getDate() - 30);
                    break;
            }
            if (startDate && !filter.createdAt) {
                filter.createdAt = { $gte: startDate };
            }
        }

        // Search (by orderId fragment, product name, or store name)
        if (req.query.search) {
            const q = req.query.search.trim();
            if (q.length > 0) {
                const searchRegex = new RegExp(q, "i");
                const searchConditions = [
                    { storeName: searchRegex },
                    { customerName: searchRegex },
                    { "items.name": searchRegex },
                    { address: searchRegex },
                ];
                // Check if search term could be a Mongo ObjectId fragment (hex string)
                if (/^[a-f0-9]{4,24}$/i.test(q)) {
                    searchConditions.push({ _id: searchRegex });
                }
                // Merge with existing filters using $and
                if (filter.$or) {
                    // Already has $or from delivery role filter
                    filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
                    delete filter.$or;
                } else {
                    filter.$or = searchConditions;
                }
            }
        }

        const [orders, total] = await Promise.all([
            Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Order.countDocuments(filter),
        ]);

        res.json({
            ok: true, orders,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
});

// ── My Active Order(s) — For App Lifecycle Restoration ───────────────────────
router.get("/my-active",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const orders = await Order.find({
                acceptedByPartnerId: req.user._id,
                status: { $in: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"] },
            }).sort({ updatedAt: -1 });
            res.json({ ok: true, orders });
        } catch (err) { next(err); }
    }
);

// ── Order Stats (counts per status — for filter badges) ───────────────────────
// MUST be above /:id to prevent Express treating 'stats' as an order ID
router.get("/stats/counts", authenticate, async (req, res, next) => {
    try {
        let matchFilter = {};
        if (req.user.role === "customer") matchFilter.customerId = req.user._id;
        if (req.user.role === "seller") matchFilter.sellerId = req.user._id;

        const pipeline = [
            { $match: matchFilter },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ];
        const results = await Order.aggregate(pipeline);
        const counts = {};
        let total = 0;
        for (const r of results) {
            counts[r._id] = r.count;
            total += r.count;
        }
        counts.ALL = total;
        res.json({ ok: true, counts });
    } catch (err) { next(err); }
});

// ── Get Single Order ──────────────────────────────────────────────────────────
router.get("/:id", authenticate, async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) throw new NotFound("Order not found");
        res.json({ ok: true, order });
    } catch (err) { next(err); }
});

// ── Confirm Order (seller: PENDING → CONFIRMED) ───────────────────────────────
router.patch("/:id/confirm",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("CONFIRMED"))
                throw new BadRequest(`Cannot confirm from status: ${order.status}`);

            // Phase-8: Seller ownership guard
            if (req.user.role === "seller" && order.sellerId?.toString() !== req.user._id.toString()) {
                throw new Forbidden("This order belongs to a different seller");
            }

            // Phase-7: Payment gate — block seller action on unpaid orders
            if (!order.isCOD() && !order.isPaymentConfirmed()) {
                throw new BadRequest(`Cannot confirm order — payment not yet received (status: ${order.paymentStatus})`);
            }

            order.status = "CONFIRMED";
            order.sellerId = req.user._id;
            order.storeName = req.user.storeName || req.user.name;
            order.confirmedAt = new Date();
            await order.save();

            const io = req.app.get("io");
            if (io) {
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "CONFIRMED", storeName: order.storeName });
                io.to(`seller_${req.user._id}`).emit("orderConfirmed", { orderId: order._id });
                io.emit("orderStatusChanged", { orderId: order._id, status: "CONFIRMED", customerId: order.customerId });
            }
            await notify("customer", `✅ Order confirmed by ${order.storeName}!`, "update", order.customerId);
            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Prepare Order (seller: CONFIRMED → PREPARING) ────────────────────────────
router.patch("/:id/prepare",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("PREPARING"))
                throw new BadRequest(`Cannot prepare from status: ${order.status}`);

            // Phase-8: Seller ownership guard
            if (req.user.role === "seller" && order.sellerId?.toString() !== req.user._id.toString()) {
                throw new Forbidden("This order belongs to a different seller");
            }

            // Phase-7: Payment gate
            if (!order.isCOD() && !order.isPaymentConfirmed()) {
                throw new BadRequest(`Cannot prepare order — payment not confirmed (status: ${order.paymentStatus})`);
            }

            const prepTime = parseInt(req.body.prepTime) || 15;
            order.status = "PREPARING";
            order.prepTime = prepTime;
            order.prepStartedAt = new Date();
            if (req.body.sellerNote) order.sellerNote = req.body.sellerNote;
            await order.save();

            const io = req.app.get("io");
            if (io) {
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", {
                    orderId: order._id, status: "PREPARING",
                    prepTime, prepStartedAt: order.prepStartedAt
                });
                io.emit("orderStatusChanged", { orderId: order._id, status: "PREPARING", customerId: order.customerId });
            }
            await notify("customer", `👨‍🍳 Preparing your order! Ready in ~${prepTime} min`, "update", order.customerId);
            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Accept Order (legacy alias → same as confirm) ─────────────────────────────
router.patch("/:id/accept",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("CONFIRMED"))
                throw new BadRequest(`Cannot confirm from status: ${order.status}`);

            // Phase-8: Seller ownership guard
            if (req.user.role === "seller" && order.sellerId?.toString() !== req.user._id.toString()) {
                throw new Forbidden("This order belongs to a different seller");
            }

            // Phase-7: Payment gate
            if (!order.isCOD() && !order.isPaymentConfirmed()) {
                throw new BadRequest(`Cannot accept order — payment not confirmed (status: ${order.paymentStatus})`);
            }

            order.status = "CONFIRMED";
            order.sellerId = req.user._id;
            order.storeName = req.user.storeName || req.user.name;
            order.confirmedAt = new Date();
            await order.save();
            const io = req.app.get("io");
            if (io) io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "CONFIRMED" });
            await notify("customer", `✅ Order confirmed by the store!`, "update", order.customerId);
            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Reject Order & Partial Refund (Seller) ────────────────────────────────────
router.patch("/:id/reject",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");

            // Allow rejection early on before it's shipped
            if (["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REJECTED"].includes(order.status)) {
                throw new BadRequest(`Cannot reject order from status: ${order.status}`);
            }

            // Phase-8: Seller ownership guard
            if (req.user.role === "seller" && order.sellerId?.toString() !== req.user._id.toString()) {
                throw new Forbidden("This order belongs to a different seller");
            }

            // ── Phase-6B: Background Gateway Refund Pipeline ──
            if (order.paymentStatus === "CAPTURED" && order.gatewayPaymentId) {
                const { addRefundJob } = require("../services/queueService");
                
                // Enqueue refund background job
                await addRefundJob({ orderId: order._id, amountInPaise: Math.round(order.total * 100) });
                
                order.paymentStatus = "PARTIALLY_REFUNDED"; // Intermediate state until Gateway webhook confirms
                order.events.push({ status: "REJECTED", note: "Refund Job Enqueued to Gateway network" });
            } else if (order.paymentStatus === "paid" && order.paymentId && order.paymentId.startsWith("wallet_")) {
                // Wallet refund
                const User = require("../models/User");
                const WalletTransaction = require("../models/WalletTransaction");
                const user = await User.findById(order.customerId);
                const updatedUser = await User.findByIdAndUpdate(order.customerId, { $inc: { walletBalance: order.total } }, { new: true });
                await WalletTransaction.create({
                    userId: order.customerId, type: "credit", amount: order.total,
                    category: "refund", balanceBefore: user.walletBalance, balanceAfter: updatedUser.walletBalance,
                    note: `Refund for Rejected Order ${order._id}`
                });
                order.paymentStatus = "refunded";
                order.events.push({ status: "REJECTED", note: "Wallet refunded successfully" });
            }

            // Release inventory
            const Product = require("../models/Product");
            for (const item of order.items) {
                let updateQuery = { $inc: { stock: item.qty } };
                if (item.selectedVariant && item.selectedVariant.variantId) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId },
                        updateQuery,
                        { arrayFilters: [{ "v.variantId": item.selectedVariant.variantId }] }
                    );
                } else if (item.selectedVariant && item.selectedVariant.name) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId },
                        updateQuery,
                        { arrayFilters: [{ "v.name": item.selectedVariant.name }] }
                    );
                } else {
                    await Product.findByIdAndUpdate(item.productId, updateQuery);
                }
            }

            order.status = "REJECTED";
            order.cancelReason = req.body.reason || "Seller rejected the order (items unavailable).";
            order.events.push({ status: "REJECTED", note: order.cancelReason });
            await order.save();

            const io = req.app.get("io");
            if (io) io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "REJECTED" });

            const { notify } = require("../services/notificationService");
            await notify("customer", `Order issue: Store rejected some items. Refund initiated!`, "alert", order.customerId);

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Ready for Pickup (seller) ─────────────────────────────────────────────────
router.patch("/:id/ready",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();
            if (!order.canTransitionTo("READY_FOR_PICKUP"))
                throw new BadRequest(`Cannot mark ready from status: ${order.status}`);

            // Phase-8: Seller ownership guard
            if (req.user.role === "seller" && order.sellerId?.toString() !== req.user._id.toString()) {
                throw new Forbidden("This order belongs to a different seller");
            }

            // Phase-7: Payment gate — final check before dispatch pipeline starts
            if (!order.isCOD() && !order.isPaymentConfirmed()) {
                throw new BadRequest(`Cannot dispatch order — payment not confirmed (status: ${order.paymentStatus})`);
            }

            order.status = "READY_FOR_PICKUP";
            order.dispatchStartTime = new Date(); // Phase-8: Dispatch monitoring
            await order.save();

            const io = req.app.get("io");
            if (io) {
                io.emit("orderReadyForPickup", { orderId: order._id });
                io.emit("orderNearbyAvailable", { orderId: order._id, location: order.pickupLocation });
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "READY_FOR_PICKUP" });
                io.emit("orderStatusChanged", { orderId: order._id, status: "READY_FOR_PICKUP", customerId: order.customerId });
            }

            await notify("delivery", `Order ${order._id} ready for pickup`, "order");
            await notify("customer", `Your order is being packed!`, "update", order.customerId);

            // ── Phase-5: Real-time Dispatch (Queue + Trigger) ──
            try {
                await redisClient.lpush("orders:pending", order._id.toString());
                const { triggerDispatch } = require("../utils/dispatchEngine");
                setImmediate(() => triggerDispatch(req.app));
            } catch (e) {
                logger.error(`Redis queue push failed: ${e.message}`);
            }

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Delivery Partner Accepts/Claims Order ────────────────────────────────────
router.patch("/:id/accept-delivery",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const io = req.app.get("io");
            const riderId = req.user._id;
            const now = new Date();

            // ── Strict Ownership Validation (Order-Sniping Security Fix) ────────
            // Step 1: Read-only pre-flight check to return a precise error message
            const preCheck = await Order.findById(id).select("status acceptedByPartnerId offeredToPartnerId");
            if (!preCheck) {
                return res.status(404).json({ ok: false, msg: "Order not found" });
            }
            if (preCheck.status !== ORDER_STATUS.READY_FOR_PICKUP) {
                return res.status(400).json({ ok: false, msg: `Order is not available (status: ${preCheck.status})` });
            }
            if (preCheck.acceptedByPartnerId) {
                return res.status(409).json({ ok: false, msg: "Order has already been claimed by another rider" });
            }
            if (!preCheck.offeredToPartnerId || preCheck.offeredToPartnerId.toString() !== riderId.toString()) {
                logger.warn(`[SECURITY] Order sniping attempt by rider ${riderId} on order ${id} (offered to: ${preCheck.offeredToPartnerId})`);
                return res.status(403).json({ ok: false, msg: "This order was not assigned to you by the dispatch engine" });
            }

            // Step 2: Atomic update — ONLY succeeds if dispatch engine assigned this exact rider
            // The strict filter ensures no two simultaneous requests can both succeed
            const order = await Order.findOneAndUpdate(
                {
                    _id: id,
                    status: ORDER_STATUS.READY_FOR_PICKUP,
                    acceptedByPartnerId: null,
                    offeredToPartnerId: riderId           // Strict: must match exactly
                },
                {
                    $set: { acceptedByPartnerId: riderId, acceptedAt: now },
                    $push: { dispatchLog: { riderId, action: "assigned", timestamp: now } },
                },
                { new: true }
            );
            // If null here, a simultaneous request won the race — not a snipe
            if (!order) return res.status(409).json({ ok: false, msg: "Order was claimed simultaneously by another process. Please retry." });

            // Compute acceptance latency
            if (order.updatedAt) {
                order.riderAcceptanceMs = now.getTime() - new Date(order.updatedAt).getTime();
                await order.save();
            }

            const rider = await User.findById(riderId);

            // Fast track bounds validation
            const activeCount = rider.activeOrderIds?.length || 0;
            const max = rider.maxActiveOrders || 3;

            // Build atomic batch target array
            let targetOrderIds = [order._id];

            if (order.batchId) {
                const batch = await Order.find({ batchId: order.batchId, status: ORDER_STATUS.READY_FOR_PICKUP, acceptedByPartnerId: null });
                const batchIds = batch.map(b => b._id);
                if (batchIds.length > 0) {
                    await Order.updateMany(
                        { _id: { $in: batchIds } },
                        {
                            $set: { acceptedByPartnerId: riderId, acceptedAt: now },
                            $push: { dispatchLog: { riderId, action: "assigned", timestamp: now } },
                        }
                    );
                    targetOrderIds = [order._id, ...batchIds];
                }
            }

            if (activeCount + targetOrderIds.length > max) {
                // Rollback the atomic lock
                await Order.updateMany(
                    { _id: { $in: targetOrderIds } },
                    { $set: { acceptedByPartnerId: null, acceptedAt: null } }
                );
                return res.status(400).json({ ok: false, msg: `Load limit exceeded. You can only hold ${max} orders.` });
            }

            // Fetch locked to return to socket
            const lockedOrders = await Order.find({ _id: { $in: targetOrderIds } });

            // Apply to rider atomically
            rider.activeOrderIds = rider.activeOrderIds ? [...rider.activeOrderIds, ...targetOrderIds] : targetOrderIds;
            // Legacy sync
            rider.activeOrderId = rider.activeOrderIds[0];
            await rider.save();

            // ── Phase-5: Redis Rider Grouping (Busy) ──
            try {
                await redisClient.srem("riders:available", riderId.toString());
                await redisClient.sadd("riders:busy", riderId.toString());
            } catch (e) {
                logger.warn(`Redis grouping update failed for rider ${riderId}`);
            }

            // Emit instant sync payloads
            for (let o of lockedOrders) {
                // Instantly remove from all other riders' screens natively
                io.emit("orderRemovedFromQueue", { orderId: o._id });

                // Conflicting assignment sync sent directly to THIS rider socket
                io.to(req.headers["x-socket-id"]).emit("orderAssigned", o);
                io.emit("orderLocked", { orderId: o._id, lockedBy: riderId });

                // Phase-9: Notify customer that a rider has been assigned
                // This enables the Order Command Center to activate the mini-map
                io.to(`order_${o._id}`).emit("deliveryStatusUpdate", {
                    orderId: o._id,
                    status: "RIDER_ASSIGNED",
                    riderName: req.user.name,
                    riderId: riderId,
                });
            }

            await notify("customer", `${req.user.name} is heading to pick up your order!`, "update", order.customerId);

            res.json({ ok: true, msg: `Batch accepted (${lockedOrders.length} orders)`, orders: lockedOrders });

        } catch (err) { next(err); }
    }
);

// ── Pickup (delivery actually starts) ─────────────────────────────────────────
router.patch("/:id/pickup",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();
            if (!order.canTransitionTo("OUT_FOR_DELIVERY"))
                throw new BadRequest(`Cannot pickup from status: ${order.status}`);

            // Must be the rider who claimed it (or any if unclaimed)
            if (order.acceptedByPartnerId &&
                order.acceptedByPartnerId.toString() !== req.user._id.toString())
                throw new Forbidden("This order is claimed by another delivery partner");

            const now = new Date();
            order.status = "OUT_FOR_DELIVERY";
            order.deliveryPartnerId = req.user._id;
            order.riderName = req.user.name;
            order.pickedUpAt = now;
            // Calculate pickup delay (time from READY_FOR_PICKUP to actual pickup)
            if (order.confirmedAt) {
                order.pickupDelayMs = now.getTime() - new Date(order.confirmedAt).getTime();
            }
            await order.save();

            // Update rider activity
            await User.findByIdAndUpdate(req.user._id, { $set: { lastActivityAt: now } });

            const io = req.app.get("io");
            if (io) {
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "OUT_FOR_DELIVERY", riderName: req.user.name });
                io.emit("orderStatusChanged", { orderId: order._id, status: "OUT_FOR_DELIVERY", customerId: order.customerId });
            }

            await notify("customer", `Your order is out for delivery! 🛵`, "update", order.customerId);

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Deliver ───────────────────────────────────────────────────────────────────
router.patch("/:id/deliver",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();
            if (!order.canTransitionTo("DELIVERED"))
                throw new BadRequest(`Cannot deliver from status: ${order.status}`);

            // ── Phase-6: Delivery Synchronization Lock ──
            const isCashOnDelivery = order.paymentMethod === "Cash";
            if (!isCashOnDelivery && order.paymentStatus !== "CAPTURED") {
                // To support legacy Phase-5 testing orders, we can also permit "paid" temporarily, but CAPTURED is required
                if (order.paymentStatus !== "paid") {
                    throw new BadRequest(`Cannot deliver unpaid order. Payment Status: ${order.paymentStatus}`);
                }
            }

            const deliverNow = new Date();
            order.status = "DELIVERED";
            order.deliveredAt = deliverNow;
            // Calculate delivery duration (pickup to delivery)
            if (order.pickedUpAt) {
                order.deliveryDurationMs = deliverNow.getTime() - new Date(order.pickedUpAt).getTime();
            }
            await order.save();

            // ── Phase-8: Escrow Wallet Settlement via Queue ──
            if (!isCashOnDelivery && order.paymentStatus !== "REFUNDED" && order.paymentStatus !== "DISPUTED") {
                const { addSettlementJob } = require("../services/queueService");
                await addSettlementJob({
                    orderId: order._id.toString(),
                    riderId: req.user._id.toString(),
                    sellerId: order.sellerId?.toString(),
                    deliveryFee: order.deliveryFee || 0,
                    subtotal: order.subtotal || 0,
                    platformFee: order.platformFee || 0,
                });
                logger.info(`[Ledger] Escrow Settlement enqueued for Order ${order._id}`);
            }

            // Unlock rider
            const riderId = req.user._id || req.user.id;
            const rider = await User.findById(riderId);
            if (rider) {
                if (rider.activeOrderIds) {
                    rider.activeOrderIds = rider.activeOrderIds.filter(id => id.toString() !== order._id.toString());
                    rider.activeOrderId = rider.activeOrderIds.length > 0 ? rider.activeOrderIds[0] : null;
                    rider.resolvedToday = (rider.resolvedToday || 0) + 1;
                    await rider.save();

                    // ── Phase-5: Redis Rider Grouping (Available) ──
                    if (rider.activeOrderIds.length === 0) {
                        try {
                            await redisClient.srem("riders:busy", req.user._id.toString());
                            await redisClient.sadd("riders:available", req.user._id.toString());
                        } catch (e) {
                            logger.warn(`Redis grouping update failed for rider ${req.user._id}`);
                        }
                    }
                } else {
                    rider.activeOrderId = null;
                    await rider.save(); // Save if activeOrderIds was null but rider exists
                }
            }

            const io = req.app.get("io");
            if (io) {
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "DELIVERED" });
                io.emit("orderStatusChanged", { orderId: order._id, status: "DELIVERED", customerId: order.customerId });
            }

            await notify("customer", `Order delivered! Thank you 🎉`, "success", order.customerId);
            await notify("seller", `Order ${order._id} delivered successfully`, "success");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Cancel Order ──────────────────────────────────────────────────────────────
router.patch("/:id/cancel",
    authenticate,
    validateJoi(orderValidation.cancelOrder),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();
            if (!order.canTransitionTo("CANCELLED"))
                throw new BadRequest(`Cannot cancel from status: ${order.status}`);

            const isOwner = order.customerId.toString() === req.user._id.toString();
            const canCancel = isOwner || ["seller", "admin"].includes(req.user.role);
            if (!canCancel) throw new Forbidden("Cannot cancel this order");

            // ── Phase-7: Automatic Refund on Cancellation ──────────────────
            const WalletTransaction = require("../models/WalletTransaction");
            const Transaction = require("../models/Transaction");

            if (order.isPaymentConfirmed()) {
                // Check if wallet payment
                if (order.paymentId && order.paymentId.startsWith("wallet_")) {
                    // Instant wallet refund
                    const customer = await User.findById(order.customerId);
                    const updatedCustomer = await User.findByIdAndUpdate(
                        order.customerId,
                        { $inc: { walletBalance: order.total } },
                        { new: true }
                    );
                    await WalletTransaction.create({
                        userId: order.customerId, type: "credit", amount: order.total,
                        category: "refund",
                        balanceBefore: customer.walletBalance,
                        balanceAfter: updatedCustomer.walletBalance,
                        note: `Refund for cancelled order ${order._id}`,
                    });
                    order.paymentStatus = "refunded";
                    order.refundStatus = "completed";
                    order.refundAmount = order.total;
                    order.refundedAt = new Date();
                    order.events.push({ status: "CANCELLED", note: "Wallet refund completed" });
                    logger.info(`[Cancel] Wallet refund ₹${order.total} for order ${order._id}`);

                } else if (order.paymentId && !order.paymentId.startsWith("wallet_")) {
                    // Razorpay gateway refund — async via queue
                    const { addRefundJob } = require("../services/queueService");
                    await addRefundJob({
                        orderId: order._id,
                        paymentId: order.paymentId,
                        amountInPaise: Math.round(order.total * 100),
                        reason: req.body.reason,
                    });
                    order.refundStatus = "processing";
                    order.refundAmount = order.total;
                    order.events.push({ status: "CANCELLED", note: "Gateway refund job enqueued" });
                    logger.info(`[Cancel] Razorpay refund enqueued for order ${order._id}`);
                }

                // Handle hybrid: also refund wallet portion from Transaction record
                const txn = await Transaction.findOne({ paymentId: order.paymentGroupId, status: "completed" });
                if (txn && txn.method === "hybrid" && txn.walletAmount > 0) {
                    const customer = await User.findById(order.customerId);
                    // Calculate this sub-order's wallet share proportionally
                    const walletShare = Math.round((order.total / txn.amount) * txn.walletAmount * 100) / 100;
                    if (walletShare > 0) {
                        const updatedCustomer = await User.findByIdAndUpdate(
                            order.customerId,
                            { $inc: { walletBalance: walletShare } },
                            { new: true }
                        );
                        await WalletTransaction.create({
                            userId: order.customerId, type: "credit", amount: walletShare,
                            category: "refund",
                            balanceBefore: customer.walletBalance,
                            balanceAfter: updatedCustomer.walletBalance,
                            note: `Hybrid wallet refund for cancelled order ${order._id}`,
                        });
                        order.events.push({ status: "CANCELLED", note: `Hybrid wallet portion ₹${walletShare} refunded` });
                    }
                }
            }

            order.status = "CANCELLED";
            order.cancelReason = req.body.reason;
            await order.save();

            // Unlock rider if active
            if (order.acceptedByPartnerId) {
                const rider = await User.findById(order.acceptedByPartnerId);
                if (rider) {
                    if (rider.activeOrderIds) {
                        rider.activeOrderIds = rider.activeOrderIds.filter(id => id.toString() !== order._id.toString());
                        rider.activeOrderId = rider.activeOrderIds.length > 0 ? rider.activeOrderIds[0] : null;
                    } else {
                        rider.activeOrderId = null;
                    }
                    await rider.save();
                }
                const io = req.app.get("io");
                if (io) io.to(`delivery_${order.acceptedByPartnerId}`).emit("orderCancelled", { orderId: order._id });
            }

            // Restore stock
            for (const item of order.items) {
                let updateQuery = { $inc: { stock: item.qty } };
                if (item.selectedVariant && item.selectedVariant.variantId) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId },
                        updateQuery,
                        { arrayFilters: [{ "v.variantId": item.selectedVariant.variantId }] }
                    );
                } else if (item.selectedVariant && item.selectedVariant.name) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId },
                        updateQuery,
                        { arrayFilters: [{ "v.name": item.selectedVariant.name }] }
                    );
                } else {
                    await Product.findByIdAndUpdate(item.productId, updateQuery);
                }
            }

            const io = req.app.get("io");
            if (io) {
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "CANCELLED" });
                io.emit("orderStatusChanged", { orderId: order._id, status: "CANCELLED", customerId: order.customerId });
            }

            await notify("customer", `Order cancelled. Reason: ${req.body.reason}`, "alert", order.customerId);
            await notify("seller", `Order ${order._id} was cancelled`, "alert");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Flag Order ────────────────────────────────────────────────────────────────
router.patch("/:id/flag",
    authenticate,
    require("../middleware/validateJoi")(require("joi").object({
        issue: require("joi").string().trim().required().messages({ "any.required": "Issue description required", "string.empty": "Issue description required" })
    }).unknown(true)),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();

            order.flagged = true;
            await order.save();

            const Ticket = require("../models/Ticket");
            await Ticket.create({
                userId: order.customerId,
                customerName: order.customerName,
                orderId: order._id,
                issue: req.body.issue,
                priority: "high",
            });

            await notify("support", `🚩 Flagged order: ${order._id} — "${req.body.issue}"`, "ticket");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Rider Shift Management ────────────────────────────────────────────────────
router.patch("/shift/start",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const now = new Date();
            await User.findByIdAndUpdate(req.user._id, {
                $set: {
                    isOnline: true,
                    shiftStartedAt: now,
                    lastActivityAt: now,
                    shiftEndedAt: null,
                },
            });

            // ── Phase-5: Redis Rider Grouping (Online/Available) ──
            try {
                await redisClient.sadd("riders:available", req.user._id.toString());
                await redisClient.srem("riders:offline", req.user._id.toString());
            } catch (e) {
                logger.warn(`Redis state update failed for rider ${req.user._id}`);
            }

            res.json({ ok: true, msg: "Shift started", shiftStartedAt: now });
        } catch (err) { next(err); }
    }
);

router.patch("/shift/end",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const now = new Date();
            const rider = await User.findById(req.user._id);
            if (rider.activeOrderIds?.length > 0) {
                return res.status(400).json({ ok: false, msg: "Cannot end shift with active orders. Complete or reassign them first." });
            }
            await User.findByIdAndUpdate(req.user._id, {
                $set: {
                    isOnline: false,
                    shiftEndedAt: now,
                    lastActivityAt: now,
                },
            });

            // ── Remove from Redis Routing (Security Fix & Grouping) ──
            try {
                await redisClient.srem("riders:available", req.user._id.toString());
                await redisClient.srem("riders:busy", req.user._id.toString());
                await redisClient.sadd("riders:offline", req.user._id.toString());
                await redisClient.zrem("riders:locations", req.user._id.toString());
                await redisClient.hdel(`rider:${req.user._id}:meta`, "data");
            } catch (e) {
                logger.warn(`Redis cleanup failed for rider ${req.user._id}`);
            }

            res.json({ ok: true, msg: "Shift ended", shiftEndedAt: now });
        } catch (err) { next(err); }
    }
);



// ── Multi-Drop Route Optimization (Nearest Next greedy TSP) ─────────────────
router.get("/batch/:batchId/optimized-route",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const orders = await Order.find({
                batchId: req.params.batchId,
                acceptedByPartnerId: req.user._id,
            });
            if (orders.length === 0) return res.json({ ok: true, waypoints: [], orders: [] });

            // Greedy nearest-next algorithm
            // Greedy nearest-next algorithm using shared haversine
            const haversineDist = haversineStrict;

            // Start from rider's current position or first pickup
            let current = orders[0].pickupLocation || { lat: 0, lng: 0 };
            const remaining = [...orders];
            const optimized = [];

            while (remaining.length > 0) {
                let nearest = 0;
                let nearestDist = Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const drop = remaining[i].dropLocation;
                    if (!drop) continue;
                    const d = haversineDist(current, drop);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearest = i;
                    }
                }
                const picked = remaining.splice(nearest, 1)[0];
                optimized.push(picked);
                current = picked.dropLocation || current;
            }

            const waypoints = optimized.map(o => ({
                orderId: o._id,
                drop: o.dropLocation,
                address: o.address,
                customerName: o.customerName,
            }));

            res.json({ ok: true, waypoints, orders: optimized });
        } catch (err) { next(err); }
    }
);

// ── Rate Order ────────────────────────────────────────────────────────────────
router.post("/:id/rate",
    authenticate, authorize("customer"),
    require("../middleware/validateJoi")(require("joi").object({
        rating: require("joi").number().integer().min(1).max(5).required().messages({ "number.min": "Rating must be 1-5", "number.max": "Rating must be 1-5" }),
        review: require("joi").string().max(1000).optional()
    }).unknown(true)),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (order.customerId.toString() !== req.user._id.toString())
                throw new Forbidden("Cannot rate this order");
            if (order.status !== "DELIVERED")
                throw new BadRequest("Can only rate delivered orders");
            if (order.customerRating)
                throw new BadRequest("Order already rated");

            order.customerRating = req.body.rating;
            order.customerReview = req.body.review || "";
            order.ratedAt = new Date();
            order.events.push({ status: "DELIVERED", note: `Customer rated ${req.body.rating}★` });
            await order.save();

            await notify("seller", `⭐ Order #${order._id.toString().slice(-6)} rated ${req.body.rating}/5`, "info");
            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Reorder (recreate cart from a previous order) ─────────────────────────────
// Applies the SAME filters as product search: seller must be open + within delivery radius
router.post("/:id/reorder",
    authenticate, authorize("customer"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (order.customerId.toString() !== req.user._id.toString())
                throw new Forbidden("Cannot reorder from this order");

            // Customer GPS — sent from frontend, fallback to saved profile location
            const customerLat = parseFloat(req.body.lat) || req.user.location?.coordinates?.[1] || null;
            const customerLng = parseFloat(req.body.lng) || req.user.location?.coordinates?.[0] || null;

            // Haversine distance helper (same as product search route)
            const calcDistance = (sellerLat, sellerLng) => {
                if (!customerLat || !customerLng || !sellerLat || !sellerLng) return null;
                const R = 6371;
                const toRad = d => d * Math.PI / 180;
                const dLat = toRad(sellerLat - customerLat);
                const dLng = toRad(sellerLng - customerLng);
                const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(toRad(customerLat)) * Math.cos(toRad(sellerLat)) * Math.sin(dLng / 2) ** 2;
                return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
            };

            const cartItems = [];
            const unavailable = [];
            const unavailableReasons = {};

            for (const item of order.items) {
                // Helper to validate a specific product document
                const validateProduct = (prod) => {
                    if (!prod || prod.status !== "active") return "Product no longer available";
                    if (prod.stock < 1) return "Out of stock";
                    
                    const seller = prod.sellerId;
                    
                    // If no seller is attached, it's a valid platform/Dark Store product
                    if (!seller) return null; 
                    
                    if (seller.isOpen === false) return "Seller is currently closed";
                    
                    const sellerLat = seller.location?.coordinates?.[1] || seller.location?.lat;
                    const sellerLng = seller.location?.coordinates?.[0] || seller.location?.lng;
                    const distanceKm = calcDistance(sellerLat, sellerLng);
                    
                    if (distanceKm !== null) {
                        const maxRadius = seller.deliveryRadius || 5;
                        if (distanceKm > maxRadius) return `Seller is ${distanceKm}km away (max ${maxRadius}km)`;
                    } else if (distanceKm !== null && distanceKm > 15) {
                        return "Seller too far away";
                    }
                    return null; // OK
                };

                let bestProduct = null;
                let failureReason = null;

                // 1. First try the EXACT original product ID (seller-specific)
                const originalProduct = await Product.findById(item.productId)
                    .populate("sellerId", "name storeName location isOpen deliveryRadius");
                
                failureReason = validateProduct(originalProduct);
                
                if (!failureReason) {
                    bestProduct = originalProduct;
                } else {
                    // 2. Original fails. Try to find an ALTERNATIVE product with the EXACT same name 
                    // from ANY other seller that passes validation!
                    const alternatives = await Product.find({ 
                        name: item.name, 
                        status: "active", 
                        stock: { $gt: 0 } 
                    }).populate("sellerId", "name storeName location isOpen deliveryRadius");

                    for (const alt of alternatives) {
                        const altError = validateProduct(alt);
                        if (!altError) {
                            bestProduct = alt;
                            failureReason = null;
                            // Optionally, pick the closest one, but for now first available is fine.
                            break; 
                        }
                    }
                    // If we STILL don't have a bestProduct, keep the original failureReason
                }

                if (!bestProduct) {
                    unavailable.push(item.name);
                    unavailableReasons[item.name] = failureReason || "Not available";
                    continue;
                }

                // ✅ Add the matched product (original or alternative) to cart
                cartItems.push({
                    productId: bestProduct._id.toString(),
                    name: bestProduct.name,
                    emoji: bestProduct.emoji || "📦",
                    imageUrl: bestProduct.imageUrl || item.imageUrl || "",
                    qty: Math.min(item.qty, bestProduct.stock),
                    price: bestProduct.sellingPrice,
                    stock: bestProduct.stock,
                });
            }

            res.json({
                ok: true,
                cartItems,
                unavailable,
                unavailableReasons,
                originalOrderId: order._id,
                message: unavailable.length > 0
                    ? `${unavailable.length} item(s) unavailable: ${unavailable.join(", ")}`
                    : "All items available",
            });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── PHASE-7: Return & Exchange Lifecycle ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Request Return (customer only, within 7 days of delivery) ─────────────────
router.patch("/:id/request-return",
    authenticate, authorize("customer"),
    require("../middleware/validateJoi")(require("joi").object({
        reason: require("joi").string().trim().required().messages({ "any.required": "Return reason is required", "string.empty": "Return reason is required" })
    }).unknown(true)),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (order.customerId.toString() !== req.user._id.toString())
                throw new Forbidden("Cannot request return for this order");
            if (!order.canTransitionTo("RETURN_REQUESTED"))
                throw new BadRequest(`Cannot request return from status: ${order.status}`);

            // 7-day return window
            const deliveryDate = order.deliveredAt || order.updatedAt;
            const daysSinceDelivery = (Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceDelivery > 7) {
                throw new BadRequest("Return window expired. Returns are allowed within 7 days of delivery.");
            }

            order.status = "RETURN_REQUESTED";
            order.returnStatus = "requested";
            order.returnReason = req.body.reason;
            order.returnRequestedAt = new Date();
            order.events.push({ status: "RETURN_REQUESTED", note: `Customer requested return: ${req.body.reason}` });
            await order.save();

            await notify("seller", `↩ Return requested for Order #${order._id.toString().slice(-6)}: ${req.body.reason}`, "alert", order.sellerId);
            await notify("admin", `Return requested: Order ${order._id}`, "alert");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Approve Return (seller/admin) ─────────────────────────────────────────────
router.patch("/:id/approve-return",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("RETURN_APPROVED"))
                throw new BadRequest(`Cannot approve return from status: ${order.status}`);

            order.status = "RETURN_APPROVED";
            order.returnStatus = "approved";
            order.returnApprovedAt = new Date();
            order.events.push({ status: "RETURN_APPROVED", note: "Seller approved return" });
            await order.save();

            await notify("customer", `Your return request for Order #${order._id.toString().slice(-6)} has been approved! A rider will pick up the items.`, "update", order.customerId);
            await notify("delivery", `Return pickup needed for Order ${order._id}`, "order");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Pickup Return (delivery partner) ──────────────────────────────────────────
router.patch("/:id/pickup-return",
    authenticate, authorize("delivery"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("RETURN_PICKED"))
                throw new BadRequest(`Cannot pickup return from status: ${order.status}`);

            order.status = "RETURN_PICKED";
            order.returnStatus = "picked";
            order.returnPickedAt = new Date();
            order.events.push({ status: "RETURN_PICKED", note: "Rider picked up returned items" });

            // ── Auto-trigger refund on return pickup ──
            const WalletTransaction = require("../models/WalletTransaction");
            if (order.paymentId && order.paymentId.startsWith("wallet_")) {
                const customer = await User.findById(order.customerId);
                const updatedCustomer = await User.findByIdAndUpdate(
                    order.customerId,
                    { $inc: { walletBalance: order.total } },
                    { new: true }
                );
                await WalletTransaction.create({
                    userId: order.customerId, type: "credit", amount: order.total,
                    category: "refund",
                    balanceBefore: customer.walletBalance,
                    balanceAfter: updatedCustomer.walletBalance,
                    note: `Return refund for order ${order._id}`,
                });
                order.paymentStatus = "refunded";
                order.refundStatus = "completed";
                order.refundAmount = order.total;
                order.refundedAt = new Date();
            } else if (order.paymentId) {
                const { addRefundJob } = require("../services/queueService");
                await addRefundJob({
                    orderId: order._id,
                    paymentId: order.paymentId,
                    amountInPaise: Math.round(order.total * 100),
                    reason: `Return: ${order.returnReason}`,
                });
                order.refundStatus = "processing";
                order.refundAmount = order.total;
            }

            // Restore stock
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
            }

            // Transition to RETURN_COMPLETED
            order.status = "RETURN_COMPLETED";
            order.returnStatus = "completed";
            order.returnCompletedAt = new Date();
            order.events.push({ status: "RETURN_COMPLETED", note: "Return completed — refund initiated" });
            await order.save();

            await notify("customer", `Return completed! Refund of ₹${order.total} is being processed.`, "success", order.customerId);
            await notify("seller", `Return completed for Order #${order._id.toString().slice(-6)}`, "alert", order.sellerId);

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

module.exports = router;
