const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema({
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
        type: String,
        enum: ['REQUESTED', 'MANUAL_REVIEW', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'],
        default: 'REQUESTED'
    },
    gatewayPayoutId: { type: String }, // e.g. po_xyz or transfer_xyz
    idempotencyKey: { type: String, required: true, unique: true }, // payout_{id}
    failureReason: { type: String },
    bankReference: { type: String } // Physical UTR code from bank
}, { timestamps: true });

withdrawalSchema.index({ status: 1 });
withdrawalSchema.index({ idempotencyKey: 1 });

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
