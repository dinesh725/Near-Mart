const mongoose = require("mongoose");

const vendorInventorySchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vendorName: { type: String, required: true },
    productName: { type: String, required: true },
    emoji: { type: String, default: "📦" },
    stock: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: "kg" },
    costPrice: { type: Number, required: true, min: 0 },
    minOrderQty: { type: Number, default: 10, min: 1 },
    leadDays: { type: Number, default: 1, min: 0 }
}, { timestamps: true });

vendorInventorySchema.index({ productName: "text" });

module.exports = mongoose.model("VendorInventory", vendorInventorySchema);
