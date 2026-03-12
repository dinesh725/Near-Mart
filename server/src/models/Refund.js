const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    amount: { type: Number, required: true },
    reason: { type: String },
    status: { 
        type: String, 
        enum: ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED"], 
        default: "PENDING",
        index: true
    },
    gatewayRefundId: { type: String, unique: true, sparse: true, index: true }, // e.g., Stripe/Razorpay refund ID
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Admin or Customer who initiated it
    retryCount: { type: Number, default: 0 },
    errorLog: [{ type: String }],
    processedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Refund", refundSchema);
