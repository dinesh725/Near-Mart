const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // Admin
    ipAddress: { type: String, required: true },
    action: { 
        type: String, 
        enum: ["KYC_APPROVED", "KYC_REJECTED", "MANUAL_REFUND", "PAYOUT_AUTHORIZED", "LEDGER_OVERRIDE", "STORE_SUSPENDED", "PAYOUT_REQUESTED", "PAYOUT_PROCESSING", "PAYOUT_PAID", "PAYOUT_FAILED"], 
        required: true 
    },
    targetId: { type: mongoose.Schema.Types.ObjectId }, // User ID, Transaction ID, or Order ID
    previousState: { type: mongoose.Schema.Types.Mixed },
    newState: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, required: true }
}, { timestamps: true }); 

module.exports = mongoose.model("AuditLog", auditLogSchema);
