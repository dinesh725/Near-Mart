const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");

const otpSchema = new mongoose.Schema({
    phone: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL auto-delete
    createdAt: { type: Date, default: Date.now },
});

// Generate a 6-digit OTP and return { otp, doc }
otpSchema.statics.createOtp = async function (phone) {
    // Delete any existing OTP for this phone
    await this.deleteMany({ phone });

    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const doc = await this.create({ phone, otpHash, expiresAt });
    return { otp, doc };
};

// Verify OTP — returns { valid, reason }
otpSchema.statics.verifyOtp = async function (phone, otp) {
    const doc = await this.findOne({ phone });
    if (!doc) return { valid: false, reason: "OTP not found or expired" };
    if (doc.attempts >= 5) {
        logger.warn(`[ANTI-FRAUD] OTP locked for ${phone} due to 5 failed attempts. Possible brute force.`);
        return { valid: false, reason: "Too many attempts. Request a new OTP." };
    }

    doc.attempts += 1;
    await doc.save();

    const match = await bcrypt.compare(otp, doc.otpHash);
    if (!match) return { valid: false, reason: `Invalid OTP (${5 - doc.attempts} attempts left)` };

    // Valid — delete OTP
    await this.deleteOne({ _id: doc._id });
    return { valid: true };
};

module.exports = mongoose.model("Otp", otpSchema);
