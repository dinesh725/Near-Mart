const mongoose = require("mongoose");

const procurementSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    vendorName: { type: String },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    costPrice: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "fulfilled", "cancelled"], default: "pending" },
}, { timestamps: true });

module.exports = mongoose.model("Procurement", procurementSchema);
