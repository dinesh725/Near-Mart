const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: ["add_money", "order_payment", "refund", "cashback", "welcome_bonus"], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    paymentId: { type: String },
    razorpayOrderId: { type: String },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    note: { type: String, default: "" },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "completed" },
}, { timestamps: true });

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ razorpayOrderId: 1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
