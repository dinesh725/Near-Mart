const express = require('express');
const router = express.Router();
const { verifyWebhookSignature } = require('../services/paymentGateway');
const { addPaymentJob } = require('../services/queueService');
const logger = require("../utils/logger");

// ── Webhook Consumer ──────────────────────────────────────────────────────────
// Requires exactly the Raw Body (do NOT parse JSON before this runs)
router.post('/payment', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        
        // 1. Cryptographic Validation
        const event = verifyWebhookSignature(req.body, signature);
        if (!event) {
            return res.status(400).send(`Webhook Error: Invalid Signature`);
        }

        // 2. Fast Acknowledgment to prevent Timeout
        res.status(200).json({ received: true });

        // Extract main entity from payload (payment or refund)
        const entityKey = event.contains ? event.contains[0] : Object.keys(event.payload)[0];
        const data = event.payload[entityKey] ? event.payload[entityKey].entity : event.payload;

        // 3. Push to Background Queue (BullMQ)
        await addPaymentJob('process_webhook', { 
            eventType: event.event, 
            data: data, 
            eventId: req.headers['x-razorpay-event-id'] || `rzp_evt_${Date.now()}`
        });
        
    } catch (err) {
        logger.error(`[Webhook Route Error] ${err.message}`);
        return res.status(500).json({ error: "Webhook Error" });
    }
});

module.exports = router;
