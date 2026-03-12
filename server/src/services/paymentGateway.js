const Stripe = require('stripe');
// Using a dummy key for testing/simulation if not provided
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
    maxNetworkRetries: 2,
    timeout: 5000
});
const logger = require("../utils/logger");

const createPaymentIntent = async (amountInPaise, currency = 'inr', orderId, customerId) => {
    try {
        const intent = await stripe.paymentIntents.create({
            amount: amountInPaise,
            currency,
            metadata: { orderId: orderId.toString(), customerId: customerId.toString() }
        });
        return { ok: true, id: intent.id, client_secret: intent.client_secret };
    } catch (e) {
        logger.error(`[Gateway] Intent Creation Failed: ${e.message}`);
        return { ok: false, error: 'Gateway unavailable. Please try again later.' };
    }
};

const verifyWebhookSignature = (rawBody, signatureHeader) => {
    try {
        return stripe.webhooks.constructEvent(
            rawBody, 
            signatureHeader, 
            process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy'
        );
    } catch (err) {
        logger.error(`[Gateway] Invalid Webhook Signature: ${err.message}`);
        return null; // Return null on failure instead of crashing
    }
};

const createRefund = async (paymentIntentId, amountInPaise) => {
    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: amountInPaise
        });
        return { ok: true, id: refund.id };
    } catch (e) {
        logger.error(`[Gateway] Refund Failed: ${e.message}`);
        return { ok: false, error: 'Refund unavailable' };
    }
};

module.exports = { createPaymentIntent, verifyWebhookSignature, createRefund };
