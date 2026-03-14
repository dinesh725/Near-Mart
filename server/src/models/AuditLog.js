const mongoose = require("mongoose");

const AUDIT_ACTIONS = [
    // Existing actions
    "KYC_APPROVED", "KYC_REJECTED", "MANUAL_REFUND", "PAYOUT_AUTHORIZED",
    "LEDGER_OVERRIDE", "STORE_SUSPENDED", "PAYOUT_REQUESTED", "PAYOUT_PROCESSING",
    "PAYOUT_PAID", "PAYOUT_FAILED",
    // Phase 4 actions
    "refund_issued", "manual_dispatch", "kyc_status_change",
    "user_suspended", "user_activated", "payment_reconciled",
    "staff_invited", "invite_revoked",
];

const auditLogSchema = new mongoose.Schema({
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorName: { type: String },
    actorRole: { type: String },
    ipAddress: { type: String, default: "unknown" },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    targetId: { type: String, index: true },
    targetType: { type: String }, // "order", "user", "invite", "transaction"
    previousState: { type: mongoose.Schema.Types.Mixed },
    newState: { type: mongoose.Schema.Types.Mixed },
    details: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, default: "" },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
