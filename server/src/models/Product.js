const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    emoji: { type: String, default: "📦" },
    category: { type: String, required: true, index: true },
    sellingPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: "pcs" },
    imageUrl: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    gstRate: { type: Number, default: 0 },
    deliveryAlloc: { type: Number, default: 3 },
    platformComm: { type: Number, default: 0 },
    marketAvgPrice: { type: Number, default: 0 },
    competitorLow: { type: Number, default: 0 },
    competitorHigh: { type: Number, default: 0 },
    demandTrend: { type: String, default: "stable" },
    transparencyMode: { type: String, default: "partial" },
    weekSales: { type: [Number], default: [0, 0, 0, 0, 0, 0, 0] },
    monthlySales: { type: Number, default: 0 },
    monthlyRevenue: { type: Number, default: 0 },
    monthlyProfit: { type: Number, default: 0 },
}, { timestamps: true });

productSchema.index({ name: "text", category: "text" });

module.exports = mongoose.model("Product", productSchema);
