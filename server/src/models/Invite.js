const mongoose = require("mongoose");
const crypto = require("crypto");

const STAFF_ROLES = ["admin", "support"];

const inviteSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: STAFF_ROLES, required: true },
    token: { type: String, required: true, unique: true, index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
}, { timestamps: true });

// Generate a secure, URL-safe invite token
inviteSchema.statics.generateToken = function () {
    return crypto.randomBytes(32).toString("hex");
};

// Check if invite is still valid (not used, not revoked, not expired)
inviteSchema.methods.isValid = function () {
    if (this.usedAt) return false;
    if (this.revokedAt) return false;
    if (this.expiresAt < new Date()) return false;
    return true;
};

// Auto-clean expired, unused invites (MongoDB TTL index)
// Used invites are preserved for audit trail (partialFilterExpression)
inviteSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, partialFilterExpression: { usedAt: null, revokedAt: null } }
);

module.exports = mongoose.model("Invite", inviteSchema);
module.exports.STAFF_ROLES = STAFF_ROLES;
