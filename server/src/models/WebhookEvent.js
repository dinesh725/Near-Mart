const mongoose = require("mongoose");

// ── Webhook Event Deduplication Store (Phase-7) ──────────────────────────────
// Stores processed Razorpay event IDs to prevent replay attacks.
// TTL index auto-cleans entries after 7 days to keep the collection lean.
const webhookEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    paymentId: { type: String },
    processedAt: { type: Date, default: Date.now },
}, { timestamps: false });

// Auto-expire after 7 days — replay protection only needs short-term memory
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
