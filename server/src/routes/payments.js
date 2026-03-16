const express = require("express");
const crypto = require("crypto");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const WalletTransaction = require("../models/WalletTransaction");
const { authenticate, authorize } = require("../middleware/auth");
const validateJoi = require("../middleware/validateJoi");
const paymentValidation = require("../validations/payment.validation");
const { BadRequest, NotFound, Conflict } = require("../utils/errors");
const { createRazorpayOrder, verifySignature, verifyWebhookSignature, fetchPaymentStatus, fetchOrderStatus, refundPayment, distributeRevenue } = require("../services/paymentService");
const { notify } = require("../services/notificationService");
const StockReservation = require("../models/StockReservation");
const config = require("../config");
const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");
const orderVelocityCheck = require("../middleware/orderVelocityCheck");

const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const router = express.Router();

// ── Checkout — Unified Payment Endpoint ───────────────────────────────────────
// Creates order + processes payment in one atomic flow
router.post("/checkout",
    authenticate, authorize("customer"),
    orderVelocityCheck,
    validateJoi(paymentValidation.checkout),
    async (req, res, next) => {
        try {
            const { items, address, paymentMethod } = req.body;

            // 1. Validate & Cluster items by Seller — BATCH FETCH (Phase-8 perf fix)
            const productIds = items.map(i => i.productId);
            const products = await Product.find({ _id: { $in: productIds } });
            const productMap = new Map(products.map(p => [p._id.toString(), p]));

            const sellerGroups = {};
            let grandSubtotal = 0;

            for (const item of items) {
                const product = productMap.get(item.productId.toString ? item.productId.toString() : item.productId);
                if (!product) throw new BadRequest(`Product ${item.productId} not found`);
                if (product.stock < item.qty) {
                    throw new BadRequest(`Insufficient stock for ${product.name} (available: ${product.stock})`);
                }

                const sId = product.sellerId ? product.sellerId.toString() : "DEFAULT_SELLER";
                if (!sellerGroups[sId]) {
                    sellerGroups[sId] = { sellerId: product.sellerId, items: [], subtotal: 0 };
                }

                const itemTotal = product.sellingPrice * item.qty;
                sellerGroups[sId].items.push({
                    productId: product._id, name: product.name,
                    emoji: product.emoji, imageUrl: product.imageUrl || "",
                    qty: item.qty, price: product.sellingPrice,
                    selectedVariant: item.selectedVariant || undefined,
                });
                sellerGroups[sId].subtotal += itemTotal;
                grandSubtotal += itemTotal;
            }

            const sellerCount = Object.keys(sellerGroups).length;
            const deliveryFeePerSeller = 30; // ₹30 per distinct seller
            const deliveryFeeTotal = deliveryFeePerSeller * sellerCount;
            const platformFeeTotal = 5;
            const discountTotal = grandSubtotal > 200 ? Math.round(grandSubtotal * 0.02) : 0;
            const grandTotal = grandSubtotal + deliveryFeeTotal + platformFeeTotal - discountTotal;

            const platformFeePerSeller = parseFloat((platformFeeTotal / sellerCount).toFixed(2));
            const discountPerSeller = Math.floor(discountTotal / sellerCount);

            logger.debug("Incoming checkout headers", { keys: Object.keys(req.headers) });
            logger.debug("Extracted Idemp-Key", { key: req.headers["idempotency-key"] });
            const idempotencyKey = req.headers["idempotency-key"] || `chk_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
            const paymentGroupId = `PG_${crypto.randomBytes(8).toString("hex")}`;

            const existingTxn = await Transaction.findOne({ idempotencyKey });
            if (existingTxn && existingTxn.status === "completed") {
                throw new Conflict("This order group has already been paid");
            }
            if (existingTxn && existingTxn.status === "pending") {
                throw new Conflict("A checkout with this idempotency key is already pending. Please complete or cancel it.");
            }
            // Phase-7: Pre-validate payment eligibility BEFORE any mutations
            const user = await User.findById(req.user._id);
            const availableBalance = user.walletBalance - (user.reservedBalance || 0);
            if (paymentMethod === "wallet") {
                if (availableBalance < grandTotal) {
                    throw new BadRequest(`Insufficient available balance (₹${availableBalance}). Need ₹${grandTotal}`);
                }
            } else if (paymentMethod === "hybrid") {
                // Hybrid: at minimum wallet + gateway must cover total
                // No hard failure here — gateway will cover the remainder
            }

            // 2. Stock Reservation System (Phase-8) — reserve instead of permanent decrement
            const reservations = [];
            for (const item of items) {
                // Atomic decrement with underflow protection
                const updated = await Product.findOneAndUpdate(
                    { _id: item.productId, stock: { $gte: item.qty } },
                    { $inc: { stock: -item.qty } },
                    { new: true }
                );
                if (!updated) {
                    // Rollback previous reservations in this batch
                    for (const prev of reservations) {
                        await Product.findByIdAndUpdate(prev.productId, { $inc: { stock: prev.qty } });
                        await StockReservation.findByIdAndUpdate(prev._id, { status: "CANCELLED" });
                    }
                    const p = productMap.get(item.productId.toString ? item.productId.toString() : item.productId);
                    throw new BadRequest(`Stock no longer available for ${p?.name || item.productId}`);
                }
                const reservation = await StockReservation.create({
                    productId: item.productId,
                    qty: item.qty,
                    paymentGroupId,
                    selectedVariant: item.selectedVariant || undefined,
                    status: "RESERVED",
                    expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
                });
                reservations.push(reservation);
            }

            // 3. Create N sub-orders (PENDING_PAYMENT)
            let createdOrders = [];
            for (const sId of Object.keys(sellerGroups)) {
                const group = sellerGroups[sId];
                const groupTotal = group.subtotal + deliveryFeePerSeller + platformFeePerSeller - discountPerSeller;

                const sellerSubtotal = group.subtotal;
                const platformCommission = platformFeePerSeller;
                const sellerNetEarnings = parseFloat((sellerSubtotal - platformCommission).toFixed(2));
                const taxAmount = parseFloat((sellerSubtotal * 0.05).toFixed(2)); // generic 5% total GST
                const cgst = parseFloat((taxAmount / 2).toFixed(2));
                const sgst = parseFloat((taxAmount / 2).toFixed(2));

                const order = await Order.create({
                    customerId: req.user._id,
                    customerName: req.user.name,
                    sellerId: group.sellerId,
                    items: group.items,
                    subtotal: group.subtotal,
                    deliveryFee: deliveryFeePerSeller,
                    platformFee: platformFeePerSeller,
                    discountShare: discountPerSeller,
                    sellerSubtotal,
                    platformCommission,
                    sellerNetEarnings,
                    taxAmount,
                    cgst,
                    sgst,
                    total: groupTotal,
                    address,
                    paymentMethod,
                    paymentGroupId,
                    status: "PENDING_PAYMENT",
                    paymentStatus: "pending",
                    events: [{ status: "PENDING_PAYMENT", note: "Order initiated, awaiting payment" }]
                });
                createdOrders.push(order);
            }

            // 4. Process payment based on method
            let walletDeducted = 0;
            let gatewayAmount = 0;
            let razorpayOrderId = null;
            let needsGatewayPayment = false;
            // user already fetched above in pre-validation

            if (paymentMethod === "wallet") {
                // Balance already validated above — safe to deduct
                walletDeducted = grandTotal;
                const updatedUser = await User.findByIdAndUpdate(
                    req.user._id, { $inc: { walletBalance: -grandTotal, totalOrders: sellerCount } }, { new: true }
                );

                await WalletTransaction.create({
                    userId: req.user._id, type: "debit", amount: grandTotal,
                    category: "order_payment", // Add a group ID to WalletTxn if needed, but notes usually suffice
                    balanceBefore: user.walletBalance, balanceAfter: updatedUser.walletBalance,
                    note: `Payment for Order Group ${paymentGroupId}`,
                    razorpayOrderId: paymentGroupId // Store group ID here for wallet
                });

                // Update all orders instantly
                await Order.updateMany(
                    { paymentGroupId, status: "PENDING_PAYMENT" },
                    {
                        $set: { status: "CONFIRMED", paymentStatus: "paid", paymentId: `wallet_${Date.now()}` },
                        $push: { events: { status: "CONFIRMED", note: "Wallet payment successful" } }
                    }
                );

                const revenue = distributeRevenue(grandTotal);
                await Transaction.create({
                    orderId: null, // Unified transaction
                    paymentId: paymentGroupId,
                    amount: grandTotal, type: "order_payment", method: "wallet",
                    walletAmount: grandTotal, gatewayAmount: 0,
                    ...revenue, status: "completed", idempotencyKey,
                });

                await notify("customer", `Orders placed! ₹${grandTotal} paid from wallet`, "payment", req.user._id);

                // Phase-7: Real-time seller notification via Socket.IO
                const io = req.app.get("io");
                if (io) {
                    const confirmedOrders = await Order.find({ paymentGroupId, status: "CONFIRMED" });
                    for (const o of confirmedOrders) {
                        io.emit("newOrder", { orderId: o._id, customerName: req.user.name, total: o.total });
                        if (o.sellerId) {
                            await notify("seller", `New paid order ₹${o.total} — ready to confirm!`, "order", o.sellerId);
                        }
                    }
                }

            } else if (paymentMethod === "razorpay") {
                gatewayAmount = grandTotal;
                needsGatewayPayment = true;
                const rzOrder = await createRazorpayOrder(grandTotal, `group_${paymentGroupId}`, {
                    paymentGroupId,
                    customerId: req.user._id.toString(),
                });
                razorpayOrderId = rzOrder.id;

                // Attach RZ order ID to all sub-orders
                await Order.updateMany({ paymentGroupId }, { razorpayOrderId: rzOrder.id });

                await Transaction.create({
                    orderId: null, amount: grandTotal,
                    paymentId: paymentGroupId,
                    type: "order_payment", method: "razorpay",
                    walletAmount: 0, gatewayAmount: grandTotal,
                    status: "pending", idempotencyKey,
                });

            } else if (paymentMethod === "hybrid") {
                walletDeducted = Math.min(availableBalance, grandTotal);
                gatewayAmount = grandTotal - walletDeducted;

                // Phase-7: Crash-safe hybrid
                // DO NOT deduct wallet when gateway payment is also needed.
                // Wallet is RESERVED (tracked in Transaction) and only deducted
                // after gateway capture via webhook/verify handler.
                if (gatewayAmount > 0) {
                    needsGatewayPayment = true;
                    // Phase-8: Reserve wallet amount (prevent double-spending)
                    await User.findByIdAndUpdate(req.user._id, {
                        $inc: { reservedBalance: walletDeducted }
                    });
                    const rzOrder = await createRazorpayOrder(gatewayAmount, `group_${paymentGroupId}`, {
                        paymentGroupId, walletDeducted: walletDeducted.toString(),
                    });
                    razorpayOrderId = rzOrder.id;
                    await Order.updateMany({ paymentGroupId }, { razorpayOrderId: rzOrder.id });
                } else {
                    // Full wallet cover — deduct immediately (same as pure wallet)
                    const updatedUser = await User.findByIdAndUpdate(
                        req.user._id, { $inc: { walletBalance: -walletDeducted } }, { new: true }
                    );
                    await WalletTransaction.create({
                        userId: req.user._id, type: "debit", amount: walletDeducted,
                        category: "order_payment", balanceBefore: user.walletBalance,
                        balanceAfter: updatedUser.walletBalance,
                        note: `Full wallet payment for Group ${paymentGroupId}`,
                        razorpayOrderId: paymentGroupId
                    });
                    await Order.updateMany({ paymentGroupId }, {
                        $set: { status: "CONFIRMED", paymentStatus: "paid", paymentId: `wallet_${Date.now()}` },
                        $push: { events: { status: "CONFIRMED", note: "Hybrid wallet-only payment successful" } }
                    });
                    await User.findByIdAndUpdate(req.user._id, { $inc: { totalOrders: sellerCount } });
                }

                await Transaction.create({
                    orderId: null, amount: grandTotal, paymentId: paymentGroupId,
                    type: "order_payment", method: "hybrid",
                    walletAmount: walletDeducted, gatewayAmount,
                    status: gatewayAmount > 0 ? "pending" : "completed",
                    idempotencyKey,
                });

                if (!needsGatewayPayment) {
                    const revenue = distributeRevenue(grandTotal);
                    await Transaction.findOneAndUpdate({ idempotencyKey }, { ...revenue, status: "completed" });
                    await notify("customer", `Orders placed! ₹${grandTotal} paid (₹${walletDeducted} wallet)`, "payment", req.user._id);
                }
            }

            // Low stock alerts — use already-fetched product map (Phase-8 perf fix)
            for (const item of items) {
                const p = productMap.get(item.productId.toString ? item.productId.toString() : item.productId);
                if (p && (p.stock - item.qty) < 10) {
                    await notify("seller", `⚠ Low stock: ${p.name} (${p.stock - item.qty} left)`, "alert", p.sellerId);
                }
            }

            // Phase-8: Confirm stock reservations on successful payment initiation
            if (!needsGatewayPayment) {
                await StockReservation.updateMany(
                    { paymentGroupId, status: "RESERVED" },
                    { $set: { status: "CONFIRMED" } }
                );
            }

            logger.info("Group checkout processed", {
                paymentGroupId, method: paymentMethod, sellerCount,
                grandTotal, walletDeducted, gatewayAmount,
            });

            res.status(201).json({
                ok: true, orders: createdOrders, // RETURN ALL SUB-ORDERS
                needsGatewayPayment,
                razorpayOrderId,
                razorpayKeyId: needsGatewayPayment ? config.razorpay.keyId : undefined,
                gatewayAmount: gatewayAmount * 100,
                walletDeducted,
            });
        } catch (err) { next(err); }
    }
);

// ── Verify Gateway Payment (client-side callback) ─────────────────────────────
router.post("/verify",
    authenticate,
    validateJoi(paymentValidation.verify),
    async (req, res, next) => {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

            // HMAC signature verification — ensures response came from Razorpay
            const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
            if (!isValid) {
                logger.warn("Invalid payment signature", { razorpay_order_id, razorpay_payment_id });
                throw new BadRequest("Invalid payment signature — possible tampering detected");
            }

            const orders = await Order.find({ razorpayOrderId: razorpay_order_id });
            if (!orders || orders.length === 0) throw new NotFound("Orders not found for payment");

            // Idempotency: already paid — safe to return success
            if (orders[0].paymentStatus === "paid") {
                return res.json({ ok: true, message: "Already verified", orders });
            }

            const paymentGroupId = orders[0].paymentGroupId;

            // Mark all grouped orders as paid and transition them strictly to CONFIRMED
            await Order.updateMany(
                { razorpayOrderId: razorpay_order_id, status: "PENDING_PAYMENT" },
                {
                    $set: { paymentStatus: "paid", paymentId: razorpay_payment_id, status: "CONFIRMED" },
                    $push: { events: { status: "CONFIRMED", note: "Razorpay payment verified via client callback" } }
                }
            );

            // Phase-8: Confirm stock reservations
            await StockReservation.updateMany(
                { paymentGroupId, status: "RESERVED" },
                { $set: { status: "CONFIRMED" } }
            );

            // Phase-8: Commit hybrid wallet deduction on gateway success
            const txn = await Transaction.findOne({ paymentId: paymentGroupId });
            if (txn && txn.method === "hybrid" && txn.walletAmount > 0) {
                const customer = await User.findById(orders[0].customerId);
                const walletDeducted = txn.walletAmount;
                const updatedCustomer = await User.findByIdAndUpdate(
                    orders[0].customerId,
                    { $inc: { walletBalance: -walletDeducted, reservedBalance: -walletDeducted } },
                    { new: true }
                );
                await WalletTransaction.create({
                    userId: orders[0].customerId, type: "debit", amount: walletDeducted,
                    category: "order_payment",
                    balanceBefore: customer.walletBalance,
                    balanceAfter: updatedCustomer.walletBalance,
                    note: `Hybrid wallet portion for Group ${paymentGroupId}`,
                });
            }

            await User.findByIdAndUpdate(orders[0].customerId, { $inc: { totalOrders: orders.length } });

            // Calculate total revenue from all sub-orders combined
            let totalGrand = 0;
            for (const o of orders) {
                totalGrand += o.total;
                const revenue = distributeRevenue(o.total);
                await notify("seller", `Payment received — ₹${revenue.sellerEarnings} earnings`, "payment");
            }

            const totalRevenue = distributeRevenue(totalGrand);
            // Complete unified transaction
            await Transaction.findOneAndUpdate(
                { paymentId: paymentGroupId, status: "pending" },
                { paymentId: razorpay_payment_id, ...totalRevenue, status: "completed" }
            );

            await notify("customer", `Payment successful! ₹${totalGrand}`, "payment", orders[0].customerId);
            await notify("admin", `Group Transaction completed — ₹${totalGrand}`, "payment");

            logger.info("Payment verified via client callback", {
                paymentGroupId, paymentId: razorpay_payment_id, total: totalGrand, orderCount: orders.length
            });

            // Phase-7: Real-time seller notification via Socket.IO
            const io = req.app.get("io");
            if (io) {
                const confirmedOrders = await Order.find({ razorpayOrderId: razorpay_order_id, status: "CONFIRMED" });
                for (const o of confirmedOrders) {
                    io.emit("newOrder", { orderId: o._id, customerName: o.customerName, total: o.total });
                }
            }

            // Refetch to return updated array
            const updatedOrders = await Order.find({ razorpayOrderId: razorpay_order_id });
            res.json({ ok: true, message: "Payment verified", orders: updatedOrders });
        } catch (err) { next(err); }
    }
);

// ── Razorpay Webhook (source of truth) ────────────────────────────────────────
// IMPORTANT: JSON parsing happens globally, we use req.rawBody preserved by app.js for HMAC
router.post("/webhook", async (req, res) => {
    try {
        const rawBody = req.rawBody ? req.rawBody.toString() : "";

        // 1. Verify webhook signature — HARD REJECT unsigned/tampered requests
        const receivedSignature = req.headers["x-razorpay-signature"];
        if (!receivedSignature) {
            logger.warn("Webhook REJECTED — missing x-razorpay-signature header", {
                ip: req.ip, userAgent: req.headers["user-agent"],
            });
            return res.status(401).json({ ok: false, error: "Missing webhook signature" });
        }
        const isValid = verifyWebhookSignature(rawBody, receivedSignature);
        if (!isValid) {
            logger.warn("Webhook REJECTED — signature verification failed", {
                signature: receivedSignature, ip: req.ip,
            });
            return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
        }
        logger.info("Webhook signature verified ✓");

        // Parse from previously parsed body
        const event = req.body;
        logger.info("Razorpay webhook event", { event: event.event, payloadId: event.payload?.payment?.entity?.id });

        // Phase-7: Replay attack prevention — deduplicate by event ID
        const WebhookEvent = require("../models/WebhookEvent");
        const eventId = event.account_id ? `${event.account_id}_${event.event}_${event.payload?.payment?.entity?.id || Date.now()}` : `evt_${Date.now()}`;
        try {
            await WebhookEvent.create({
                eventId,
                eventType: event.event,
                paymentId: event.payload?.payment?.entity?.id,
            });
        } catch (dupErr) {
            if (dupErr.code === 11000) {
                logger.warn("Webhook REPLAY blocked — duplicate event ID", { eventId });
                return res.status(200).json({ ok: true, message: "Duplicate event — already processed" });
            }
            throw dupErr;
        }

        // 2. Handle payment.captured — order paid successfully
        if (event.event === "payment.captured") {
            const payment = event.payload.payment.entity;
            await handlePaymentCaptured(payment);
        }

        // 3. Handle payment.failed — mark order as failed
        if (event.event === "payment.failed") {
            const payment = event.payload.payment.entity;
            await handlePaymentFailed(payment);
        }

        // 4. Handle refund.created
        if (event.event === "refund.created") {
            const refund = event.payload.refund.entity;
            logger.info("Refund webhook received", { refundId: refund.id, paymentId: refund.payment_id });
        }

        // Always return 200 to Razorpay (they retry on non-200)
        res.status(200).json({ ok: true });
    } catch (err) {
        logger.error("Webhook processing error", { error: err.message, stack: err.stack });
        res.status(200).json({ ok: true }); // Still return 200 to prevent retries
    }
});

// ── Webhook handler: payment.captured ─────────────────────────────────────────
async function handlePaymentCaptured(payment) {
    // Handle order payment (array-based for Multi-Seller)
    const orders = await Order.find({ razorpayOrderId: payment.order_id });
    if (orders.length > 0 && orders[0].paymentStatus !== "paid") {
        const paymentGroupId = orders[0].paymentGroupId;

        await Order.updateMany(
            { razorpayOrderId: payment.order_id, status: "PENDING_PAYMENT" },
            {
                $set: { paymentStatus: "paid", paymentId: payment.id, status: "CONFIRMED" },
                $push: { events: { status: "CONFIRMED", note: "Razorpay payment verified via webhook" } }
            }
        );

        await User.findByIdAndUpdate(orders[0].customerId, { $inc: { totalOrders: orders.length } });

        let grandTotal = 0;
        for (const o of orders) {
            grandTotal += o.total;
            const rev = distributeRevenue(o.total);
            await notify("seller", `Payment received — ₹${rev.sellerEarnings} earnings`, "payment", o.sellerId);
        }

        const combinedRev = distributeRevenue(grandTotal);
        await Transaction.findOneAndUpdate(
            { paymentId: paymentGroupId, status: "pending" },
            { paymentId: payment.id, ...combinedRev, status: "completed" }
        );

        await notify("customer", `Payment successful! ₹${grandTotal}`, "payment", orders[0].customerId);

        // Phase-7: Deduct reserved wallet portion for hybrid payments
        const txn = await Transaction.findOne({ paymentId: payment.id, status: "completed" });
        if (txn && txn.method === "hybrid" && txn.walletAmount > 0) {
            const customer = await User.findById(orders[0].customerId);
            if (customer.walletBalance >= txn.walletAmount) {
                const updatedCustomer = await User.findByIdAndUpdate(
                    orders[0].customerId,
                    { $inc: { walletBalance: -txn.walletAmount } },
                    { new: true }
                );
                await WalletTransaction.create({
                    userId: orders[0].customerId, type: "debit", amount: txn.walletAmount,
                    category: "order_payment",
                    balanceBefore: customer.walletBalance,
                    balanceAfter: updatedCustomer.walletBalance,
                    note: `Hybrid wallet deduction after gateway capture — Group ${paymentGroupId}`,
                    razorpayOrderId: paymentGroupId,
                });
                logger.info("Hybrid wallet portion deducted post-capture", { walletAmount: txn.walletAmount, paymentGroupId });
            }
        }

        // Phase-7: Real-time seller notification via Socket.IO
        // Note: Socket.IO instance is not directly available in standalone functions.
        // Seller notification was already sent above via notify().
        // For socket, the /verify endpoint handles client-side real-time updates.

        logger.info("Webhook: group payment captured", { paymentGroupId, paymentId: payment.id, orderCount: orders.length });
    }

    // Handle wallet top-up
    const walletTxn = await WalletTransaction.findOne({
        razorpayOrderId: payment.order_id, status: "pending",
    });
    if (walletTxn) {
        // Idempotency: skip if already completed
        if (walletTxn.status === "completed") return;

        const updatedUser = await User.findByIdAndUpdate(
            walletTxn.userId,
            { $inc: { walletBalance: walletTxn.amount } },
            { new: true }
        );
        walletTxn.paymentId = payment.id;
        walletTxn.balanceAfter = updatedUser.walletBalance;
        walletTxn.status = "completed";
        await walletTxn.save();

        await notify("customer", `₹${walletTxn.amount} added to wallet!`, "payment", walletTxn.userId);
        logger.info("Webhook: wallet topup captured", { userId: walletTxn.userId.toString(), amount: walletTxn.amount });
    }
}

// ── Webhook handler: payment.failed ───────────────────────────────────────────
async function handlePaymentFailed(payment) {
    const orders = await Order.find({ razorpayOrderId: payment.order_id });
    if (orders.length > 0 && orders[0].paymentStatus === "pending" || orders.length > 0 && orders[0].status === "PENDING_PAYMENT") {
        const paymentGroupId = orders[0].paymentGroupId;

        await Order.updateMany(
            { razorpayOrderId: payment.order_id },
            { paymentStatus: "failed", status: "CANCELLED" }
        );

        // Mark transaction as failed
        await Transaction.findOneAndUpdate(
            { paymentId: paymentGroupId, status: "pending" },
            { status: "failed" }
        );

        // Restore stock across ALL sub-orders
        for (const order of orders) {
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
            }
        }

        // Refund wallet portion if hybrid payment
        const txn = await Transaction.findOne({ paymentId: paymentGroupId });
        if (txn && txn.walletAmount > 0) {
            const user = await User.findById(orders[0].customerId);
            const updatedUser = await User.findByIdAndUpdate(
                orders[0].customerId,
                { $inc: { walletBalance: txn.walletAmount } },
                { new: true }
            );
            await WalletTransaction.create({
                userId: orders[0].customerId, type: "credit", amount: txn.walletAmount,
                category: "refund", orderId: null,
                balanceBefore: user.walletBalance,
                balanceAfter: updatedUser.walletBalance,
                note: `Refund — payment failed for Group ${paymentGroupId}`,
            });
        }

        await notify("customer", `Payment failed for orders. Stock has been restored.`, "alert", orders[0].customerId);
        logger.info("Webhook: payment failed (Stock Restored)", { paymentGroupId });
    }

    // Handle failed wallet top-up
    const walletTxn = await WalletTransaction.findOne({
        razorpayOrderId: payment.order_id, status: "pending",
    });
    if (walletTxn) {
        walletTxn.status = "failed";
        await walletTxn.save();
        logger.info("Webhook: wallet topup failed", { userId: walletTxn.userId.toString() });
    }
}

// ── Payment Status ────────────────────────────────────────────────────────────
router.get("/status/:orderId", authenticate, async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) throw new NotFound("Order not found");
        const transaction = await Transaction.findOne({ orderId: order._id });

        res.json({
            ok: true,
            paymentStatus: order.paymentStatus,
            paymentId: order.paymentId,
            razorpayOrderId: order.razorpayOrderId,
            transaction: transaction || null,
        });
    } catch (err) { next(err); }
});

// ── Reconciliation — Check Razorpay for missed payments ───────────────────────
router.post("/reconcile/:orderId",
    authenticate, authorize("admin", "super_admin", "support"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.orderId);
            if (!order) throw new NotFound("Order not found");
            if (order.paymentStatus === "paid") {
                return res.json({ ok: true, message: "Already paid", order });
            }
            if (!order.razorpayOrderId) {
                throw new BadRequest("No Razorpay order associated");
            }

            // Fetch actual status from Razorpay API
            const rzOrder = await fetchOrderStatus(order.razorpayOrderId);
            if (!rzOrder) throw new BadRequest("Could not fetch status from Razorpay");

            logger.info("Reconciliation: Razorpay order status", {
                orderId: order._id.toString(),
                rzStatus: rzOrder.status,
                amountPaid: rzOrder.amount_paid,
            });

            if (rzOrder.status === "paid" && rzOrder.amount_paid > 0) {
                // Payment was successful but we missed the webhook — recover now
                // Fetch the payment ID from Razorpay payments
                const payments = rzOrder.payments || [];
                let paymentId = null;

                if (payments.length > 0) {
                    paymentId = payments[0]; // First successful payment
                } else {
                    // Fallback: construct from order
                    paymentId = `reconciled_${Date.now()}`;
                }

                order.paymentStatus = "paid";
                order.paymentId = paymentId;
                await order.save();

                const revenue = distributeRevenue(order.total);
                await Transaction.findOneAndUpdate(
                    { orderId: order._id, status: "pending" },
                    { paymentId, ...revenue, status: "completed" }
                );

                await User.findByIdAndUpdate(order.customerId, { $inc: { totalOrders: 1 } });
                await notify("customer", `Payment confirmed! ₹${order.total}`, "payment", order.customerId);

                logger.info("Reconciliation: order recovered", { orderId: order._id.toString() });

                // Audit trail
                await AuditLog.create({
                    action: "payment_reconciled", actorId: req.user._id,
                    actorName: req.user.name, actorRole: req.user.role,
                    targetId: order._id.toString(), targetType: "order",
                    details: { amount: order.total, razorpayOrderId: rzOrder.id },
                    ipAddress: req.ip || "unknown",
                }).catch(() => {});

                return res.json({ ok: true, message: "Payment recovered via reconciliation", order });
            }

            res.json({
                ok: true,
                message: "Not yet paid on Razorpay",
                razorpayStatus: rzOrder.status,
                order,
            });
        } catch (err) { next(err); }
    }
);

// ── Refund ────────────────────────────────────────────────────────────────────
router.post("/refund/:orderId",
    authenticate, authorize("admin", "super_admin", "support"),
    async (req, res, next) => {
        try {
            const order = await Order.findById(req.params.orderId);
            if (!order) throw new NotFound("Order not found");
            if (order.paymentStatus !== "paid") throw new BadRequest("Order not paid");

            const txn = await Transaction.findOne({ orderId: order._id, status: "completed" });

            // Refund gateway portion via Razorpay API
            if (txn && txn.gatewayAmount > 0 && order.paymentId && !order.paymentId.startsWith("wallet_")) {
                const refund = await refundPayment(order.paymentId, txn.gatewayAmount, {
                    orderId: order._id.toString(),
                    reason: req.body.reason || "Customer requested refund",
                });
                logger.info("Gateway refund initiated", { refundId: refund.id });
            }

            // Refund wallet portion
            if (txn && txn.walletAmount > 0) {
                const user = await User.findById(order.customerId);
                const updatedUser = await User.findByIdAndUpdate(
                    order.customerId,
                    { $inc: { walletBalance: txn.walletAmount } },
                    { new: true }
                );
                await WalletTransaction.create({
                    userId: order.customerId, type: "credit", amount: txn.walletAmount,
                    category: "refund", orderId: order._id,
                    balanceBefore: user.walletBalance,
                    balanceAfter: updatedUser.walletBalance,
                    note: `Refund for order ${order._id}`,
                });
            }

            order.paymentStatus = "refunded";
            await order.save();

            if (txn) { txn.status = "refunded"; await txn.save(); }

            // Restore stock
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
            }

            await notify("customer", `Refund of ₹${order.total} processed`, "payment", order.customerId);

            // Audit trail
            await AuditLog.create({
                action: "refund_issued", actorId: req.user._id,
                actorName: req.user.name, actorRole: req.user.role,
                targetId: order._id.toString(), targetType: "order",
                details: { amount: order.total, reason: req.body.reason || "Admin/support refund" },
                ipAddress: req.ip || "unknown",
            }).catch(() => {}); // Non-blocking

            res.json({ ok: true, message: "Refund processed" });
        } catch (err) { next(err); }
    }
);

// ── Admin: Financial Summary ──────────────────────────────────────────────────
router.get("/admin/summary",
    authenticate, authorize("admin", "super_admin"),
    async (req, res, next) => {
        try {
            const completedTxns = await Transaction.find({ status: "completed", type: "order_payment" });

            const summary = completedTxns.reduce((acc, txn) => {
                acc.totalRevenue += txn.amount;
                acc.totalPlatformFees += txn.platformFee;
                acc.totalSellerEarnings += txn.sellerEarnings;
                acc.totalDeliveryFees += txn.deliveryFee;
                acc.totalWalletPayments += txn.walletAmount;
                acc.totalGatewayPayments += txn.gatewayAmount;
                acc.transactionCount++;
                return acc;
            }, {
                totalRevenue: 0, totalPlatformFees: 0, totalSellerEarnings: 0,
                totalDeliveryFees: 0, totalWalletPayments: 0, totalGatewayPayments: 0,
                transactionCount: 0,
            });

            const refundedCount = await Transaction.countDocuments({ status: "refunded" });
            const pendingCount = await Transaction.countDocuments({ status: "pending" });
            const failedCount = await Transaction.countDocuments({ status: "failed" });

            res.json({ ok: true, summary: { ...summary, refundedCount, pendingCount, failedCount } });
        } catch (err) { next(err); }
    }
);

// ── Cancel / Abandon Checkout (restore stock + wallet) ────────────────────────
// Called by frontend when user closes the Razorpay popup or the gateway fails
router.post("/cancel/:paymentGroupId",
    authenticate,
    async (req, res, next) => {
        try {
            const { paymentGroupId } = req.params;
            const orders = await Order.find({ paymentGroupId, customerId: req.user._id });
            if (!orders || orders.length === 0) throw new NotFound("No orders found for this payment group");

            // Only allow cancellation of PENDING_PAYMENT orders
            const pendingOrders = orders.filter(o => o.status === "PENDING_PAYMENT");
            if (pendingOrders.length === 0) {
                return res.json({ ok: true, message: "Orders already processed — no cancellation needed" });
            }

            // 1. Cancel all pending orders
            await Order.updateMany(
                { paymentGroupId, status: "PENDING_PAYMENT" },
                {
                    $set: { status: "CANCELLED", paymentStatus: "failed", cancelReason: "User abandoned checkout" },
                    $push: { events: { status: "CANCELLED", note: "Checkout abandoned — stock & wallet restored" } }
                }
            );

            // 2. Restore stock across ALL cancelled sub-orders
            for (const order of pendingOrders) {
                for (const item of order.items) {
                    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
                }
            }

            // 3. Refund wallet portion if hybrid/wallet payment was partially deducted
            const txn = await Transaction.findOne({ paymentId: paymentGroupId, status: "pending" });
            if (txn && txn.walletAmount > 0) {
                const user = await User.findById(req.user._id);
                const updatedUser = await User.findByIdAndUpdate(
                    req.user._id,
                    { $inc: { walletBalance: txn.walletAmount } },
                    { new: true }
                );
                await WalletTransaction.create({
                    userId: req.user._id, type: "credit", amount: txn.walletAmount,
                    category: "refund",
                    balanceBefore: user.walletBalance,
                    balanceAfter: updatedUser.walletBalance,
                    note: `Refund — checkout cancelled for Group ${paymentGroupId}`,
                });
                logger.info("Checkout cancel: wallet refunded", {
                    paymentGroupId, walletRefund: txn.walletAmount,
                });
            }

            // 4. Mark the transaction as failed
            if (txn) {
                txn.status = "failed";
                await txn.save();
            }

            await notify("customer", "Checkout cancelled. Stock and wallet restored.", "alert", req.user._id);

            logger.info("Checkout cancelled by user", {
                paymentGroupId, ordersCancelled: pendingOrders.length,
            });

            res.json({ ok: true, message: "Checkout cancelled — stock & wallet restored" });
        } catch (err) { next(err); }
    }
);

module.exports = router;
