const mongoose = require("mongoose");

const stockReservationSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1 },
    paymentGroupId: { type: String, required: true, index: true },
    // Variant support — matches the order item variant format
    selectedVariant: {
        variantId: { type: String },
        name: { type: String },
    },
    status: {
        type: String,
        enum: ["RESERVED", "CONFIRMED", "EXPIRED", "CANCELLED"],
        default: "RESERVED",
        index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
});

// Compound index for sweeper queries
stockReservationSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("StockReservation", stockReservationSchema);
