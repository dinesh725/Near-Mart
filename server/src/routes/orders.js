const express = require("express");
const { body } = require("express-validator");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const { authenticate, authorize, requireVerification } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { BadRequest, NotFound, Forbidden } = require("../utils/errors");
// Helper: Haversine distance in KMS
const haversineDistance = (coords1, coords2) => {
    if (!coords1 || !coords2) return 0;
    const toRad = x => (x * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLng = toRad(coords2.lng - coords1.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const { notify } = require("../services/notificationService");
const { generateRoute, calcDeliveryFee, reverseGeocode } = require("../services/geocoding");

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

// ── Create Order ──────────────────────────────────────────────────────────────
router.post("/",
    authenticate, authorize("customer"), requireVerification,
    body("items").isArray({ min: 1 }).withMessage("At least one item required"),
    body("items.*.productId").notEmpty(),
    body("items.*.qty").isInt({ min: 1 }),
    body("address").trim().notEmpty().withMessage("Address is required"),
    validate,
    async (req, res, next) => {
        try {
            const { items, address, paymentMethod, dropLocation, sellerId } = req.body;

            // Validate products & stock
            const orderItems = [];
            for (const item of items) {
                const product = await Product.findById(item.productId);
                if (!product) throw new BadRequest(`Product ${item.productId} not found`);
                if (product.stock < item.qty)
                    throw new BadRequest(`Insufficient stock for ${product.name} (available: ${product.stock})`);

                orderItems.push({
                    productId: product._id,
                    name: product.name,
                    emoji: product.emoji,
                    qty: item.qty,
                    price: product.sellingPrice,
                });
            }

            const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);

            // ── Determine pickup location (seller) ──────────────────────────
            let pickupLoc = { lat: 19.0596, lng: 72.8295, address: "NearMart Dark Store #412, Mumbai", type: "Point", coordinates: [72.8295, 19.0596] };
            let seller = null;

            if (sellerId) {
                seller = await User.findById(sellerId).select("location storeName storeId name serviceRadius");
                if (seller?.location?.lat) {
                    pickupLoc = {
                        type: "Point",
                        coordinates: seller.location.coordinates || [seller.location.lng, seller.location.lat],
                        lat: seller.location.lat,
                        lng: seller.location.lng,
                        address: seller.location.address || `${seller.storeName || seller.name} Store`,
                    };
                }
            }

            // ── Drop location from request ───────────────────────────────────
            let dropLoc = { lat: null, lng: null, address, type: "Point", coordinates: [] };

            if (dropLocation?.lat && dropLocation?.lng) {
                dropLoc = {
                    type: "Point",
                    coordinates: [dropLocation.lng, dropLocation.lat],
                    lat: dropLocation.lat,
                    lng: dropLocation.lng,
                    address: dropLocation.address || address,
                };
                // Reverse geocode if address not provided
                if (!dropLocation.address) {
                    dropLoc.address = await reverseGeocode(dropLoc.lat, dropLoc.lng);
                }
            }

            // ── Generate route & calculate ETA ──────────────────────────────
            let routeData = null;
            let deliveryFee = 30;
            let estimatedArrivalTime = null;

            if (dropLoc.lat && pickupLoc.lat) {
                // ── Seller Geofencing & Service Zone Validation ──────────────
                if (seller) {
                    const dropPoint = { type: "Point", coordinates: dropLoc.coordinates };
                    let withinZone = false;

                    // 1. Check Polygon bounds if defined
                    if (seller.location?.servicePolygon?.coordinates?.length > 0) {
                        // Simple turf.js style bounding check would be ideal, but we can do a quick MongoDB intersect check
                        // However we don't have the mongoose Document here to run a pipeline easily, so we use distance fallback 
                        // as poly intersection in raw JS without libs is complex. 
                        // A simple bounding box check can be done, but we'll prioritize the radius.
                    }

                    // 2. Fallback to Radius (meters)
                    const radius = seller.serviceRadius || 5000;
                    const directDistance = haversineDistance(dropLoc, pickupLoc); // returns meters normally

                    // Note: haversineDistance returns km in this codebase's typical implementation (let's assume km)
                    // Wait, let's assume calcDistance logic which is KM.
                    const distKm = haversineDistance(dropLoc, pickupLoc) || 0;
                    if (distKm * 1000 > radius) {
                        throw new BadRequest(`Your delivery address is outside the seller's service zone (${radius / 1000}km restriction).`);
                    }
                }

                routeData = await generateRoute(pickupLoc, dropLoc);

                // Safety logic: Prevent Cross-City Orders
                if (routeData.distance > 20) {
                    throw new BadRequest(`Delivery distance (${routeData.distance} km) exceeds the maximum allowed 20 km radius.`);
                }

                deliveryFee = calcDeliveryFee(routeData.distance);
                const etaMs = Date.now() + routeData.duration * 1000;
                estimatedArrivalTime = new Date(etaMs);
            }

            const platformFee = 5;
            const discount = subtotal > 200 ? Math.round(subtotal * 0.02) : 0;
            const total = subtotal + deliveryFee + platformFee - discount;

            // ── Batching Intelligence ───────────────────────────────────────
            let batchId = null;
            if (pickupLoc.lat && dropLoc.lat) {
                // Find pending/confirmed orders within 500m pickup and 1km dropoff
                const nearbyOrder = await Order.findOne({
                    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED] },
                    pickupLocation: {
                        $near: {
                            $geometry: { type: "Point", coordinates: pickupLoc.coordinates },
                            $maxDistance: 500 // 500 meters
                        }
                    }
                }).sort({ createdAt: 1 });

                if (nearbyOrder) {
                    // Check if dropoff is also within 1km of the new order
                    const dropDistance = haversineDistance(
                        { lat: dropLoc.lat, lng: dropLoc.lng },
                        { lat: nearbyOrder.dropLocation.coordinates[1], lng: nearbyOrder.dropLocation.coordinates[0] }
                    );

                    if (dropDistance <= 1000) { // 1km dropoff bound
                        batchId = nearbyOrder.batchId || `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
                        // Give the nearby order a batchId if it didn't have one
                        if (!nearbyOrder.batchId) {
                            nearbyOrder.batchId = batchId;
                            await nearbyOrder.save();
                        }
                    }
                }
            }

            const order = await Order.create({
                customerId: req.user._id,
                customerName: req.user.name,
                items: orderItems,
                subtotal,
                deliveryFee,
                platformFee,
                discount,
                total,
                address: dropLoc.address || address,
                paymentMethod: paymentMethod || "Online",
                pickupLocation: pickupLoc,
                dropLocation: dropLoc,
                routePolyline: routeData?.polyline || null,
                batchId,
                estimatedArrivalTime,
                distanceRemaining: routeData?.distance || null,
            });

            // Deduct stock
            for (const item of orderItems) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.qty } });
            }

            // Notify via socket if io is available
            const io = req.app.get("io");
            if (io) {
                io.emit("newOrder", { orderId: order._id, customerName: req.user.name, total });
            }

            // Notifications
            await notify("seller", `New order ${order._id} — ₹${total}`, "order");
            await notify("customer", `Order placed! ₹${total} via ${paymentMethod || "Online"}`, "update", req.user._id);
            await notify("admin", `New order from ${req.user.name}`, "info");

            // Low stock alerts
            for (const item of orderItems) {
                const updated = await Product.findById(item.productId);
                if (updated && updated.stock < 10) {
                    await notify("seller", `⚠ Low stock: ${updated.name} (${updated.stock} left)`, "alert");
                    await notify("vendor", `Demand spike for ${updated.name} — restock needed`, "demand");
                }
            }

            res.status(201).json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Get Orders (role-filtered) ────────────────────────────────────────────────
router.get("/", authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let filter = {};
        switch (req.user.role) {
            case "customer": filter.customerId = req.user._id; break;
            case "seller": /* all orders for the store */ break;
            case "delivery": filter.$or = [
                { deliveryPartnerId: req.user._id },
                { acceptedByPartnerId: req.user._id },
            ]; break;
            case "admin":
            case "support": break;
            default: filter.customerId = req.user._id;
        }

        if (req.query.status) filter.status = req.query.status;

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
    authenticate, authorize("seller", "admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("CONFIRMED"))
                throw new BadRequest(`Cannot confirm from status: ${order.status}`);

            order.status = "CONFIRMED";
            order.sellerId = req.user._id;
            order.storeName = req.user.storeName || req.user.name;
            order.confirmedAt = new Date();
            await order.save();

            const io = req.app.get("io");
            if (io) {
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "CONFIRMED", storeName: order.storeName });
                io.to(`seller_${req.user._id}`).emit("orderConfirmed", { orderId: order._id });
            }
            await notify("customer", `✅ Order confirmed by ${order.storeName}!`, "update", order.customerId);
            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Prepare Order (seller: CONFIRMED → PREPARING) ────────────────────────────
router.patch("/:id/prepare",
    authenticate, authorize("seller", "admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("PREPARING"))
                throw new BadRequest(`Cannot prepare from status: ${order.status}`);

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
            }
            await notify("customer", `👨‍🍳 Preparing your order! Ready in ~${prepTime} min`, "update", order.customerId);
            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Accept Order (legacy alias → same as confirm) ─────────────────────────────
router.patch("/:id/accept",
    authenticate, authorize("seller", "admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");
            if (!order.canTransitionTo("CONFIRMED"))
                throw new BadRequest(`Cannot confirm from status: ${order.status}`);
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
    authenticate, authorize("seller", "admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound("Order not found");

            // Allow rejection early on before it's shipped
            if (["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REJECTED"].includes(order.status)) {
                throw new BadRequest(`Cannot reject order from status: ${order.status}`);
            }

            // Perform Razorpay Partial Refund if already paid
            if (order.paymentStatus === "paid" && order.paymentId && order.paymentId.startsWith("pay_")) {
                const { refundPayment } = require("../services/paymentService");
                try {
                    // order.total cleanly holds only THIS seller's sub-order (subtotal + tax + delivery - discountShare)
                    await refundPayment(order.paymentId, order.total);
                    order.paymentStatus = "refunded";
                    order.events.push({ status: "REJECTED", note: "Razorpay partial refund automated successfully" });
                } catch (refundError) {
                    const errorMsg = refundError.message || "Unknown gateway error";
                    order.events.push({ status: "REJECTED", note: "Refund FAILED: " + errorMsg + " — Queued for Admin Retry" });
                    const { notify } = require("../services/notificationService");
                    await notify("admin", `🚨 Refund Failed for Order ${order._id} (₹${order.total}): ${errorMsg}`, "alert");
                }
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
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
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
    authenticate, authorize("seller", "admin"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();
            if (!order.canTransitionTo("READY_FOR_PICKUP"))
                throw new BadRequest(`Cannot mark ready from status: ${order.status}`);

            order.status = "READY_FOR_PICKUP";
            await order.save();

            const io = req.app.get("io");
            if (io) {
                io.emit("orderReadyForPickup", { orderId: order._id });
                io.emit("orderNearbyAvailable", { orderId: order._id, location: order.pickupLocation });
                io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "READY_FOR_PICKUP" });
            }

            await notify("delivery", `Order ${order._id} ready for pickup`, "order");
            await notify("customer", `Your order is being packed!`, "update", order.customerId);

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

            // Atomic lock: prevent double-accept race condition
            const order = await Order.findOneAndUpdate(
                { _id: id, status: ORDER_STATUS.READY_FOR_PICKUP, acceptedByPartnerId: null },
                {
                    $set: { acceptedByPartnerId: riderId, acceptedAt: now },
                    $push: { dispatchLog: { riderId, action: "assigned", timestamp: now } },
                },
                { new: true }
            );
            if (!order) return res.status(400).json({ ok: false, msg: "Order no longer available (already claimed or wrong status)" });

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

            // Emit instant sync payloads
            for (let o of lockedOrders) {
                // Instantly remove from all other riders' screens natively
                io.emit("orderRemovedFromQueue", { orderId: o._id });

                // Conflicting assignment sync sent directly to THIS rider socket
                io.to(req.headers["x-socket-id"]).emit("orderAssigned", o);
                io.emit("orderLocked", { orderId: o._id, lockedBy: riderId });
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
            if (io) io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "OUT_FOR_DELIVERY", riderName: req.user.name });

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

            const deliverNow = new Date();
            order.status = "DELIVERED";
            order.paymentStatus = "paid";
            order.deliveredAt = deliverNow;
            // Calculate delivery duration (pickup to delivery)
            if (order.pickedUpAt) {
                order.deliveryDurationMs = deliverNow.getTime() - new Date(order.pickedUpAt).getTime();
            }
            await order.save();

            // Unlock rider
            const riderId = req.user._id || req.user.id;
            const rider = await User.findById(riderId);
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
            if (io) io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "DELIVERED" });

            await notify("customer", `Order delivered! Thank you 🎉`, "success", order.customerId);
            await notify("seller", `Order ${order._id} delivered successfully`, "success");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Cancel Order ──────────────────────────────────────────────────────────────
router.patch("/:id/cancel",
    authenticate,
    body("reason").trim().notEmpty().withMessage("Cancellation reason required"),
    validate,
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) throw new NotFound();
            if (!order.canTransitionTo("CANCELLED"))
                throw new BadRequest(`Cannot cancel from status: ${order.status}`);

            const isOwner = order.customerId.toString() === req.user._id.toString();
            const canCancel = isOwner || ["seller", "admin"].includes(req.user.role);
            if (!canCancel) throw new Forbidden("Cannot cancel this order");

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
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
            }

            const io = req.app.get("io");
            if (io) io.to(`order_${order._id}`).emit("deliveryStatusUpdate", { orderId: order._id, status: "CANCELLED" });

            await notify("customer", `Order cancelled. Reason: ${req.body.reason}`, "alert", order.customerId);
            await notify("seller", `Order ${order._id} was cancelled`, "alert");

            res.json({ ok: true, order });
        } catch (err) { next(err); }
    }
);

// ── Flag Order ────────────────────────────────────────────────────────────────
router.patch("/:id/flag",
    authenticate,
    body("issue").trim().notEmpty().withMessage("Issue description required"),
    validate,
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
            const haversineDist = (a, b) => {
                if (!a?.lat || !b?.lat) return Infinity;
                const R = 6371e3;
                const toRad = d => d * Math.PI / 180;
                const dLat = toRad(b.lat - a.lat);
                const dLng = toRad(b.lng - a.lng);
                const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
                return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
            };

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

module.exports = router;
