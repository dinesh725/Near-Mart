const mongoose = require("mongoose");

// ── Review sub-schema ─────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    userAvatar: { type: String, default: "" },     // initials or URL
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", trim: true, maxlength: 500 },
    helpful: { type: Number, default: 0 },      // upvotes on review
}, { timestamps: true });

// ── Product schema ────────────────────────────────────────────────────────────
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

    // ── Media ──────────────────────────────────────────────────────────────────
    imageUrl: { type: String, default: "" },     // primary image (legacy)
    images: { type: [String], default: [] },   // gallery (up to 5 URLs)

    // ── Product details ────────────────────────────────────────────────────────
    tags: { type: [String], default: [] },       // "Organic", "Best Seller", "New"
    highlights: { type: [String], default: [] },       // "Farm fresh", "No preservatives"
    freshness: { type: String, default: "Fresh" },    // shelf life label
    weight: { type: String, default: "" },         // "500g", "1kg"
    manufacturer: { type: String, default: "" },
    expiryInfo: { type: String, default: "" },         // "Best before 7 days"
    nutritionInfo: { type: String, default: "" },

    // ── Ratings & Reviews ──────────────────────────────────────────────────────
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    ratingDist: {                                    // distribution: stars 1-5 counts
        one: { type: Number, default: 0 },
        two: { type: Number, default: 0 },
        three: { type: Number, default: 0 },
        four: { type: Number, default: 0 },
        five: { type: Number, default: 0 },
    },
    reviews: { type: [reviewSchema], default: [] },

    // ── Business fields ────────────────────────────────────────────────────────
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
