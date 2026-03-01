const express = require("express");
const crypto = require("crypto");
const { body } = require("express-validator");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const WalletTransaction = require("../models/WalletTransaction");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { BadRequest, NotFound, Conflict } = require("../utils/errors");
const { createRazorpayOrder, verifySignature, verifyWebhookSignature, fetchPaymentStatus, fetchOrderStatus, refundPayment, distributeRevenue } = require("../services/paymentService");
const { notify } = require("../services/notificationService");
const config = require("../config");
const logger = require("../utils/logger");

const router = express.Router();

// ── Checkout — Unified Payment Endpoint ───────────────────────────────────────
// Creates order + processes payment in one atomic flow
router.post("/checkout",
    authenticate, authorize("customer"),
    body("items").isArray({ min: 1 }).withMessage("At least one item required"),
    body("items.*.productId").notEmpty(),
    body("items.*.qty").isInt({ min: 1 }),
    body("address").trim().notEmpty().withMessage("Address is required"),
    body("paymentMethod").isIn(["wallet", "razorpay", "hybrid"]).withMessage("Invalid payment method"),
    validate,
    async (req, res, next) => {
        try {
            const { items, address, paymentMethod } = req.body;

            // 1. Validate products & stock
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
            const deliveryFee = 30;
            const platformFee = 5;
            const discount = subtotal > 200 ? Math.round(subtotal * 0.02) : 0;
            const total = subtotal + deliveryFee + platformFee - discount;

            // 2. Create order (paymentStatus = pending)
            const order = await Order.create({
                customerId: req.user._id,
                customerName: req.user.name,
                items: orderItems,
                total,
                address,
                paymentMethod,
                paymentStatus: "pending",
            });

            // 3. Idempotency key
            const idempotencyKey = `checkout_${order._id}`;
            const existingTxn = await Transaction.findOne({ idempotencyKey });
            if (existingTxn && existingTxn.status === "completed") {
                throw new Conflict("This order has already been paid");
            }

            // 4. Deduct stock
            for (const item of orderItems) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.qty } });
            }

            // 5. Process payment based on method
            let walletDeducted = 0;
            let gatewayAmount = 0;
            let razorpayOrderId = null;
            let needsGatewayPayment = false;
            const user = await User.findById(req.user._id);

            if (paymentMethod === "wallet") {
                // Full wallet payment
                if (user.walletBalance < total) {
                    throw new BadRequest(`Insufficient wallet balance (₹${user.walletBalance}). Need ₹${total}`);
                }
                walletDeducted = total;
                const updatedUser = await User.findByIdAndUpdate(
                    req.user._id,
                    { $inc: { walletBalance: -total, totalOrders: 1 } },
                    { new: true }
                );

                await WalletTransaction.create({
                    userId: req.user._id, type: "debit", amount: total,
                    category: "order_payment", orderId: order._id,
                    balanceBefore: user.walletBalance,
                    balanceAfter: updatedUser.walletBalance,
                    note: `Payment for order ${order._id}`,
                });

                order.paymentStatus = "paid";
                order.paymentId = `wallet_${Date.now()}`;
                await order.save();

                const revenue = distributeRevenue(total);
                await Transaction.create({
                    orderId: order._id, paymentId: order.paymentId,
                    amount: total, type: "order_payment", method: "wallet",
                    walletAmount: total, gatewayAmount: 0,
                    ...revenue, status: "completed", idempotencyKey,
                });

                await notify("customer", `Order placed! ₹${total} paid from wallet`, "payment", req.user._id);
                await notify("seller", `New order — ₹${total}`, "order");

            } else if (paymentMethod === "razorpay") {
                // Full gateway payment — order NOT confirmed until verify/webhook
                gatewayAmount = total;
                needsGatewayPayment = true;
                const rzOrder = await createRazorpayOrder(total, `order_${order._id}`, {
                    orderId: order._id.toString(),
                    customerId: req.user._id.toString(),
                });
                razorpayOrderId = rzOrder.id;
                order.razorpayOrderId = rzOrder.id;
                await order.save();

                await Transaction.create({
                    orderId: order._id, amount: total,
                    type: "order_payment", method: "razorpay",
                    walletAmount: 0, gatewayAmount: total,
                    status: "pending", idempotencyKey,
                });

            } else if (paymentMethod === "hybrid") {
                // Wallet + gateway
                walletDeducted = Math.min(user.walletBalance, total);
                gatewayAmount = total - walletDeducted;

                if (walletDeducted > 0) {
                    const updatedUser = await User.findByIdAndUpdate(
                        req.user._id,
                        { $inc: { walletBalance: -walletDeducted } },
                        { new: true }
                    );
                    await WalletTransaction.create({
                        userId: req.user._id, type: "debit", amount: walletDeducted,
                        category: "order_payment", orderId: order._id,
                        balanceBefore: user.walletBalance,
                        balanceAfter: updatedUser.walletBalance,
                        note: `Partial payment for order ${order._id}`,
                    });
                }

                if (gatewayAmount > 0) {
                    needsGatewayPayment = true;
                    const rzOrder = await createRazorpayOrder(gatewayAmount, `order_${order._id}`, {
                        orderId: order._id.toString(),
                        walletDeducted: walletDeducted.toString(),
                    });
                    razorpayOrderId = rzOrder.id;
                    order.razorpayOrderId = rzOrder.id;
                    await order.save();
                } else {
                    order.paymentStatus = "paid";
                    order.paymentId = `wallet_${Date.now()}`;
                    await order.save();
                    await User.findByIdAndUpdate(req.user._id, { $inc: { totalOrders: 1 } });
                }

                await Transaction.create({
                    orderId: order._id, amount: total,
                    type: "order_payment", method: "hybrid",
                    walletAmount: walletDeducted, gatewayAmount,
                    status: gatewayAmount > 0 ? "pending" : "completed",
                    idempotencyKey,
                });

                if (!needsGatewayPayment) {
                    const revenue = distributeRevenue(total);
                    await Transaction.findOneAndUpdate({ idempotencyKey }, { ...revenue, status: "completed" });
                    await notify("customer", `Order placed! ₹${total} paid (₹${walletDeducted} wallet)`, "payment", req.user._id);
                    await notify("seller", `New order — ₹${total}`, "order");
                }
            }

            // Low stock alerts
            for (const item of orderItems) {
                const p = await Product.findById(item.productId);
                if (p && p.stock < 10) {
                    await notify("seller", `⚠ Low stock: ${p.name} (${p.stock} left)`, "alert");
                }
            }

            logger.info("Checkout processed", {
                orderId: order._id.toString(), method: paymentMethod,
                total, walletDeducted, gatewayAmount,
            });

            res.status(201).json({
                ok: true, order,
                needsGatewayPayment,
                razorpayOrderId,
                razorpayKeyId: needsGatewayPayment ? config.razorpay.keyId : undefined,
                gatewayAmount: gatewayAmount * 100, // paise for Razorpay SDK
                walletDeducted,
            });
        } catch (err) { next(err); }
    }
);

// ── Verify Gateway Payment (client-side callback) ─────────────────────────────
router.post("/verify",
    authenticate,
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    validate,
    async (req, res, next) => {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

            // HMAC signature verification — ensures response came from Razorpay
            const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
            if (!isValid) {
                logger.warn("Invalid payment signature", { razorpay_order_id, razorpay_payment_id });
                throw new BadRequest("Invalid payment signature — possible tampering detected");
            }

            const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
            if (!order) throw new NotFound("Order not found");

            // Idempotency: already paid — safe to return success
            if (order.paymentStatus === "paid") {
                return res.json({ ok: true, message: "Already verified", order });
            }

            // Mark order as paid ONLY after signature verification
            order.paymentStatus = "paid";
            order.paymentId = razorpay_payment_id;
            await order.save();

            await User.findByIdAndUpdate(order.customerId, { $inc: { totalOrders: 1 } });

            // Revenue distribution + complete transaction
            const revenue = distributeRevenue(order.total);
            await Transaction.findOneAndUpdate(
                { orderId: order._id, status: "pending" },
                { paymentId: razorpay_payment_id, ...revenue, status: "completed" }
            );

            await notify("customer", `Payment successful! ₹${order.total}`, "payment", order.customerId);
            await notify("seller", `Payment received — ₹${revenue.sellerEarnings} earnings`, "payment");
            await notify("admin", `Transaction completed — ₹${revenue.platformFee} platform fee`, "payment");

            logger.info("Payment verified via client callback", {
                orderId: order._id.toString(),
                paymentId: razorpay_payment_id,
                total: order.total,
            });

            res.json({ ok: true, message: "Payment verified", order });
        } catch (err) { next(err); }
    }
);

// ── Razorpay Webhook (source of truth) ────────────────────────────────────────
// IMPORTANT: Body must be raw for HMAC verification. JSON parsing happens here.
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
        const rawBody = req.body.toString();

        // 1. Verify webhook signature — REJECT unsigned/tampered requests
        const receivedSignature = req.headers["x-razorpay-signature"];
        if (receivedSignature) {
            const isValid = verifyWebhookSignature(rawBody, receivedSignature);
            if (!isValid) {
                logger.warn("Webhook signature verification failed", { signature: receivedSignature });
                return res.status(400).json({ ok: false, error: "Invalid webhook signature" });
            }
            logger.info("Webhook signature verified ✓");
        } else {
            logger.warn("Webhook received without signature header");
        }

        const event = JSON.parse(rawBody);
        logger.info("Razorpay webhook event", { event: event.event, payloadId: event.payload?.payment?.entity?.id });

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
    // Handle order payment
    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "paid";
        order.paymentId = payment.id;
        await order.save();

        await User.findByIdAndUpdate(order.customerId, { $inc: { totalOrders: 1 } });

        const revenue = distributeRevenue(order.total);
        await Transaction.findOneAndUpdate(
            { orderId: order._id, status: "pending" },
            { paymentId: payment.id, ...revenue, status: "completed" }
        );

        await notify("customer", `Payment successful! ₹${order.total}`, "payment", order.customerId);
        await notify("seller", `Payment received — ₹${revenue.sellerEarnings} earnings`, "payment");

        logger.info("Webhook: order payment captured", { orderId: order._id.toString(), paymentId: payment.id });
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
    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (order && order.paymentStatus === "pending") {
        order.paymentStatus = "failed";
        await order.save();

        // Mark transaction as failed
        await Transaction.findOneAndUpdate(
            { orderId: order._id, status: "pending" },
            { status: "failed" }
        );

        // Restore stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
        }

        // Refund wallet portion if hybrid payment
        const txn = await Transaction.findOne({ orderId: order._id });
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
                note: `Refund — payment failed for order ${order._id}`,
            });
        }

        await notify("customer", `Payment failed for order. Stock has been restored.`, "alert", order.customerId);
        logger.info("Webhook: payment failed", { orderId: order._id.toString() });
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
    authenticate, authorize("admin", "support"),
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
    authenticate, authorize("admin", "support"),
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

            res.json({ ok: true, message: "Refund processed" });
        } catch (err) { next(err); }
    }
);

// ── Admin: Financial Summary ──────────────────────────────────────────────────
router.get("/admin/summary",
    authenticate, authorize("admin"),
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

module.exports = router;
