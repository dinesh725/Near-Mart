const mongoose = require("mongoose");

const procurementSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    vendorName: { type: String },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sellerName: { type: String },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        productName: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
        costPrice: { type: Number, default: 0 }
    }],
    totalAmount: { type: Number, default: 0 },
    totalWeight: { type: Number, default: 0 }, // dynamically calculated in KG
    distanceKm: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deliveryPartnerName: { type: String },
    deliveryOtp: { type: String },
    status: { type: String, enum: ["pending", "accepted", "shipped", "in_transit", "delivered", "fulfilled", "cancelled"], default: "pending" },
}, { timestamps: true });

module.exports = mongoose.model("Procurement", procurementSchema);
