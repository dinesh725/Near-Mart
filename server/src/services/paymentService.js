const Razorpay = require("razorpay");
const crypto = require("crypto");
const config = require("../config");
const logger = require("../utils/logger");

let razorpayInstance = null;

const getRazorpay = () => {
    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: config.razorpay.keyId,
            key_secret: config.razorpay.keySecret,
        });
    }
    return razorpayInstance;
};

// ── Create Razorpay Order ─────────────────────────────────────────────────────
const createRazorpayOrder = async (amount, receipt, notes = {}) => {
    const rz = getRazorpay();
    const options = {
        amount: Math.round(amount * 100), // paise
        currency: "INR",
        receipt,
        payment_capture: 1, // auto-capture on success
        notes,
    };
    const order = await rz.orders.create(options);
    logger.info("Razorpay order created", { orderId: order.id, amount, receipt });
    return order;
};

// ── Verify Razorpay Payment Signature (client-side verify) ────────────────────
const verifySignature = (orderId, paymentId, signature) => {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto
        .createHmac("sha256", config.razorpay.keySecret)
        .update(body)
        .digest("hex");
    return expected === signature;
};

// ── Verify Razorpay Webhook Signature ─────────────────────────────────────────
// Phase-7: NEVER fall back to keySecret — they are different secrets
const verifyWebhookSignature = (rawBody, receivedSignature) => {
    const webhookSecret = config.razorpay.webhookSecret;
    if (!webhookSecret) {
        logger.error("[SECURITY] RAZORPAY_WEBHOOK_SECRET is not configured — webhook verification will ALWAYS fail");
        return false;
    }
    const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
    return expected === receivedSignature;
};

// ── Fetch Payment Details from Razorpay API (reconciliation) ──────────────────
const fetchPaymentStatus = async (paymentId) => {
    try {
        const rz = getRazorpay();
        const payment = await rz.payments.fetch(paymentId);
        logger.info("Razorpay payment fetched", {
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount,
        });
        return payment;
    } catch (err) {
        logger.error("Failed to fetch payment from Razorpay", { paymentId, error: err.message });
        return null;
    }
};

// ── Fetch Razorpay Order Details (for reconciliation) ─────────────────────────
const fetchOrderStatus = async (razorpayOrderId) => {
    try {
        const rz = getRazorpay();
        const order = await rz.orders.fetch(razorpayOrderId);
        return order;
    } catch (err) {
        logger.error("Failed to fetch Razorpay order", { razorpayOrderId, error: err.message });
        return null;
    }
};

// ── Process Refund ────────────────────────────────────────────────────────────
const refundPayment = async (paymentId, amount, notes = {}) => {
    const rz = getRazorpay();
    const refund = await rz.payments.refund(paymentId, {
        amount: Math.round(amount * 100),
        notes,
    });
    logger.info("Refund processed", { paymentId, refundId: refund.id, amount });
    return refund;
};

// ── Revenue Distribution ──────────────────────────────────────────────────────
const distributeRevenue = (totalAmount) => {
    const platformFee = Math.round(totalAmount * config.platformCommission * 100) / 100;
    const deliveryFee = config.deliveryFeeFlat;
    const sellerEarnings = Math.round((totalAmount - platformFee - deliveryFee) * 100) / 100;
    return { platformFee, deliveryFee, sellerEarnings };
};

module.exports = {
    getRazorpay,
    createRazorpayOrder,
    verifySignature,
    verifyWebhookSignature,
    fetchPaymentStatus,
    fetchOrderStatus,
    refundPayment,
    distributeRevenue,
};
