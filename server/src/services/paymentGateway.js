const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require("../utils/logger");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_dummy'
});

const createPaymentIntent = async (amountInPaise, currency = 'INR', orderId, customerId) => {
    try {
        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: currency.toUpperCase(),
            receipt: orderId.toString(),
            notes: { customerId: customerId.toString() }
        });
        // We return client_secret here as the actual intent.id mapping to Razorpay order id to not break existing checkout APIs
        return { ok: true, id: order.id, client_secret: order.id };
    } catch (e) {
        logger.error(`[Gateway] Intent Creation Failed: ${e.message}`);
        return { ok: false, error: 'Gateway unavailable. Please try again later.' };
    }
};

const verifyWebhookSignature = (rawBody, signatureHeader) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_dummy';
        const expectedSignature = crypto.createHmac('sha256', secret)
            .update(rawBody.toString())
            .digest('hex');
            
        if (expectedSignature !== signatureHeader) {
            return null; // Don't match
        }
        
        // Return parsed JSON representing structural event body
        return JSON.parse(rawBody.toString());
    } catch (err) {
        logger.error(`[Gateway] Invalid Webhook Signature: ${err.message}`);
        return null;
    }
};

const createRefund = async (paymentIntentId, amountInPaise) => {
    try {
        // Fetch raw payments for exact physical refund execution bypassing Order 
        const payments = await razorpay.orders.fetchPayments(paymentIntentId);
        if (!payments || payments.items.length === 0) {
           throw new Error("No physical payment nodes found for this intent.");
        }
        const paymentId = payments.items[0].id;
        
        const refund = await razorpay.payments.refund(paymentId, {
            amount: amountInPaise
        });
        return { ok: true, id: refund.id };
    } catch (e) {
        logger.error(`[Gateway] Refund Failed: ${e.message}`);
        return { ok: false, error: 'Refund unavailable' };
    }
};

module.exports = { createPaymentIntent, verifyWebhookSignature, createRefund };
