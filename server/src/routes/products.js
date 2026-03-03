const express = require("express");
const { body, query } = require("express-validator");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { NotFound } = require("../utils/errors");

const User = require("../models/User");

const router = express.Router();

// ── Multi-Seller Geo-Search ────────────────────────────────────────────────────
// GET /api/products/search?q=Milk&lat=19.05&lng=72.83&sort=distance&category=Dairy
router.get("/search", async (req, res, next) => {
    try {
        const { q, lat, lng, sort = "distance", category } = req.query;

        // Build filter
        const filter = { status: "active", stock: { $gt: 0 } };
        if (category) filter.category = category;
        if (q) {
            filter.$or = [
                { name: { $regex: q, $options: "i" } },
                { category: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
            ];
        }

        // Fetch all matching products with seller info
        const products = await Product.find(filter)
            .populate("sellerId", "name storeName location rating isOpen deliveryRadius businessHours storePhone")
            .sort({ name: 1 })
            .limit(100);

        // Haversine distance helper
        const calcDistance = (sellerLat, sellerLng) => {
            if (!lat || !lng || !sellerLat || !sellerLng) return null;
            const R = 6371;
            const toRad = d => d * Math.PI / 180;
            const dLat = toRad(sellerLat - parseFloat(lat));
            const dLng = toRad(sellerLng - parseFloat(lng));
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(parseFloat(lat))) * Math.cos(toRad(sellerLat)) * Math.sin(dLng / 2) ** 2;
            return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
        };

        // Enrich each product with seller distance + ETA + Smart Score
        const enriched = products.map(p => {
            const seller = p.sellerId;
            const distanceKm = seller ? calcDistance(seller.location?.lat, seller.location?.lng) : null;
            const estimatedDeliveryMin = distanceKm !== null ? Math.round(distanceKm * 6 + 10) : 30;

            // Smart Ranking Algorithm Score
            // Higher is better
            let compositeScore = 0;
            if (seller) {
                const r = seller.rating || 4.0;
                const d = distanceKm || 5;
                const s = p.stock > 0 ? 1 : 0;
                // Base 100 + rating bonus - distance penalty - time penalty + stock bonus
                compositeScore = 100 + (r * 10) - (d * 15) - (estimatedDeliveryMin * 2) + (s * 50);
            }

            return {
                ...p.toJSON(),
                seller: seller ? {
                    _id: seller._id,
                    name: seller.storeName || seller.name,
                    storePhone: seller.storePhone,
                    rating: seller.rating,
                    isOpen: seller.isOpen,
                    location: seller.location,
                    businessHours: seller.businessHours,
                    deliveryRadius: seller.deliveryRadius,
                } : null,
                distanceKm,
                estimatedDeliveryMin,
                compositeScore,
                inDeliveryRadius: distanceKm !== null ? distanceKm <= (seller?.deliveryRadius || 5) : true,
            };
        });

        // Sort
        let sorted = enriched;
        switch (sort) {
            case "price": sorted = enriched.sort((a, b) => a.sellingPrice - b.sellingPrice); break;
            case "rating": sorted = enriched.sort((a, b) => (b.seller?.rating || 0) - (a.seller?.rating || 0)); break;
            case "delivery_time": sorted = enriched.sort((a, b) => a.estimatedDeliveryMin - b.estimatedDeliveryMin); break;
            case "distance": sorted = enriched.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)); break;
            case "smart":
            default:
                // Default to Smart Logistics Ranking (Highest Score First)
                sorted = enriched.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
        }

        // Group by product name (multi-seller grouping)
        const grouped = {};
        sorted.forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!grouped[key]) {
                grouped[key] = { name: p.name, emoji: p.emoji, category: p.category, variants: [] };
            }
            grouped[key].variants.push(p);
        });

        res.json({
            ok: true,
            products: sorted,           // flat list for grid
            grouped: Object.values(grouped), // grouped by name for comparison
            total: sorted.length,
        });
    } catch (err) { next(err); }
});

// ── List Products (public, paginated) ─────────────────────────────────────────
router.get("/",
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("category").optional().trim(),
    query("search").optional().trim(),
    validate,
    async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            const filter = { status: "active" };
            if (req.query.category) filter.category = req.query.category;
            if (req.query.search) {
                filter.$or = [
                    { name: { $regex: req.query.search, $options: "i" } },
                    { category: { $regex: req.query.search, $options: "i" } },
                ];
            }

            const [products, total] = await Promise.all([
                Product.find(filter)
                    .populate("sellerId", "name storeName location rating isOpen")
                    .sort({ createdAt: -1 }).skip(skip).limit(limit),
                Product.countDocuments(filter),
            ]);

            res.json({
                ok: true,
                products,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) { next(err); }
    }
);


// ── Get Single Product ────────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) throw new NotFound("Product not found");
        res.json({ ok: true, product });
    } catch (err) { next(err); }
});

// ── Create Product (seller/admin) ─────────────────────────────────────────────
router.post("/",
    authenticate, authorize("seller", "admin"),
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("category").trim().notEmpty().withMessage("Category is required"),
    body("sellingPrice").isFloat({ min: 0 }).withMessage("Price must be ≥ 0"),
    body("stock").optional().isInt({ min: 0 }),
    validate,
    async (req, res, next) => {
        try {
            const product = await Product.create({
                ...req.body,
                sellerId: req.user._id,
            });
            res.status(201).json({ ok: true, product });
        } catch (err) { next(err); }
    }
);

// ── Update Product (seller/admin) ─────────────────────────────────────────────
router.patch("/:id",
    authenticate, authorize("seller", "admin"),
    async (req, res, next) => {
        try {
            const product = await Product.findByIdAndUpdate(
                req.params.id,
                { $set: req.body },
                { new: true, runValidators: true }
            );
            if (!product) throw new NotFound("Product not found");
            res.json({ ok: true, product });
        } catch (err) { next(err); }
    }
);

// ── Update Stock ──────────────────────────────────────────────────────────────
router.patch("/:id/stock",
    authenticate, authorize("seller", "admin"),
    body("delta").isInt().withMessage("Delta must be an integer"),
    validate,
    async (req, res, next) => {
        try {
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFound("Product not found");
            product.stock = Math.max(0, product.stock + req.body.delta);
            await product.save();
            res.json({ ok: true, product });
        } catch (err) { next(err); }
    }
);

// ── Delete Product (admin only) ───────────────────────────────────────────────
router.delete("/:id",
    authenticate, authorize("admin"),
    async (req, res, next) => {
        try {
            const product = await Product.findByIdAndDelete(req.params.id);
            if (!product) throw new NotFound("Product not found");
            res.json({ ok: true, message: "Deleted" });
        } catch (err) { next(err); }
    }
);

// ── Get Product Reviews (paginated) ──────────────────────────────────────────
router.get("/:id/reviews", async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const product = await Product.findById(req.params.id).select("reviews rating reviewCount ratingDist");
        if (!product) throw new NotFound("Product not found");

        const total = product.reviews.length;
        // Sort newest first, paginate
        const paged = [...product.reviews]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(skip, skip + limit);

        res.json({
            ok: true,
            reviews: paged,
            rating: product.rating,
            reviewCount: product.reviewCount,
            ratingDist: product.ratingDist,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
});

// ── Submit / Update Review (authenticated customer) ───────────────────────────
router.post("/:id/rate",
    authenticate, authorize("customer"),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be 1–5"),
    body("comment").optional().isString().trim().isLength({ max: 500 }),
    validate,
    async (req, res, next) => {
        try {
            const { rating, comment = "" } = req.body;
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFound("Product not found");

            // Remove old review from this user if exists
            const existingIdx = product.reviews.findIndex(
                r => r.userId.toString() === req.user._id.toString()
            );
            if (existingIdx !== -1) {
                product.reviews.splice(existingIdx, 1);
            }

            // Push new review
            product.reviews.push({
                userId: req.user._id,
                userName: req.user.name,
                userAvatar: req.user.avatar || req.user.name?.slice(0, 2).toUpperCase() || "U",
                rating,
                comment,
            });

            // Recompute aggregate rating + distribution
            const dist = { one: 0, two: 0, three: 0, four: 0, five: 0 };
            const keys = ["one", "two", "three", "four", "five"];
            let sum = 0;
            for (const r of product.reviews) {
                sum += r.rating;
                dist[keys[r.rating - 1]]++;
            }
            product.reviewCount = product.reviews.length;
            product.rating = parseFloat((sum / product.reviewCount).toFixed(1));
            product.ratingDist = dist;

            await product.save();

            res.json({
                ok: true,
                rating: product.rating,
                reviewCount: product.reviewCount,
                ratingDist: product.ratingDist,
            });
        } catch (err) { next(err); }
    }
);

// ── Update Product Images (seller/admin) ──────────────────────────────────────
router.patch("/:id/images",
    authenticate, authorize("seller", "admin"),
    body("images").isArray({ max: 5 }).withMessage("Up to 5 image URLs allowed"),
    body("images.*").isURL().withMessage("Each image must be a valid URL"),
    validate,
    async (req, res, next) => {
        try {
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFound("Product not found");

            // Only the seller who owns it (or admin) can update images
            if (req.user.role !== "admin" && product.sellerId?.toString() !== req.user._id.toString())
                throw new NotFound("Product not found");

            product.images = req.body.images;
            product.imageUrl = req.body.images[0] || product.imageUrl;
            await product.save();

            res.json({ ok: true, images: product.images, imageUrl: product.imageUrl });
        } catch (err) { next(err); }
    }
);

module.exports = router;

