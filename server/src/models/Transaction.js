const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    idempotencyKey: { type: String, unique: true, sparse: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true }, // Optional ref to an order
    type: {
        type: String,
        enum: ["order_payment", "wallet_topup", "refund", "PAYMENT_CAPTURE", "ESCROW_RELEASE", "REFUND", "PAYOUT", "ADJUSTMENT", "PLATFORM_FEE"],
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded", "PENDING", "COMPLETED", "FAILED"],
        default: "PENDING",
        index: true
    },
    entries: [{
        walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
        amount: { type: Number, required: true }, // Positive for Credit, Negative for Debit
        currency: { type: String, default: "INR" },
        balanceType: { type: String, enum: ["balance", "pendingBalance", "availableBalance"], default: "balance" }
    }],
    metadata: { type: mongoose.Schema.Types.Mixed }, // e.g., failure reason

    // Webhook Replay Protection
    gatewayPaymentId: { type: String, unique: true, sparse: true, index: true },
    gatewayRefundId: { type: String, unique: true, sparse: true, index: true },
    gatewayEventId: { type: String, unique: true, sparse: true, index: true },

    // Legacy fields for backward compatibility while migrating
    paymentId: { type: String },
    amount: { type: Number },
    method: { type: String, enum: ["wallet", "razorpay", "hybrid"], default: "razorpay" },
    walletAmount: { type: Number, default: 0 },
    gatewayAmount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    sellerEarnings: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    processedAt: { type: Date }
}, { timestamps: true });

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ "entries.walletId": 1 }); // Required to speed up ledger aggregates

// Ensure double-entry validity before saving
transactionSchema.pre("save", function (next) {
    if (this.entries && this.entries.length > 0) {
        const sum = this.entries.reduce((acc, entry) => acc + entry.amount, 0);
        // Using toFixed to handle JS floating point inaccuracies
        if (Math.abs(sum) > 0.01) {
            return next(new Error(`Transaction entries must balance to zero. Current sum: ${sum}`));
        }
    }
    next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
