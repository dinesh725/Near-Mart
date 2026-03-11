const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    paymentId: { type: String },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["order_payment", "wallet_topup", "refund"], default: "order_payment" },
    method: { type: String, enum: ["wallet", "razorpay", "hybrid"], default: "razorpay" },
    walletAmount: { type: Number, default: 0 },
    gatewayAmount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    sellerEarnings: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "completed", "failed", "refunded"], default: "pending" },
    idempotencyKey: { type: String, unique: true, sparse: true },
}, { timestamps: true });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
