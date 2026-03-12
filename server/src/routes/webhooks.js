const express = require('express');
const router = express.Router();
const { verifyWebhookSignature } = require('../services/paymentGateway');
const { addPaymentJob } = require('../services/queueService');
const logger = require("../utils/logger");

// ── Webhook Consumer ──────────────────────────────────────────────────────────
// Requires exactly the Raw Body (do NOT parse JSON before this runs)
router.post('/payment', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        
        // 1. Cryptographic Validation
        const event = verifyWebhookSignature(req.body, signature);
        if (!event) {
            return res.status(400).send(`Webhook Error: Invalid Signature`);
        }

        // 2. Fast Acknowledgment to prevent Stripe Timeout
        res.status(200).json({ received: true });

        // 3. Push to Background Queue (BullMQ)
        // Pass the parsed JSON object to the worker
        await addPaymentJob('process_webhook', { 
            eventType: event.type, 
            data: event.data.object, 
            eventId: event.id 
        });
        
    } catch (err) {
        logger.error(`[Webhook Route Error] ${err.message}`);
        return res.status(500).json({ error: "Webhook Error" });
    }
});

module.exports = router;
