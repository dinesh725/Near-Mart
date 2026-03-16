const express = require("express");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");
const validateJoi = require("../middleware/validateJoi");
const productValidation = require("../validations/product.validation");
const { NotFound } = require("../utils/errors");

const SearchEngine = require("../services/searchEngine");
const redisClient = require("../config/redis");

const User = require("../models/User");

const router = express.Router();

// ── Multi-Seller Geo-Search ────────────────────────────────────────────────────
// GET /api/products/search?q=Milk&lat=19.05&lng=72.83&sort=distance&category=Dairy
router.get("/search", async (req, res, next) => {
    try {
        const { q, lat, lng, sort = "distance", category, page = "1", limit = "20" } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

        // Redis cache check
        // Round lat/lng to 2 decimal places to create a ~1.1km cache grid to improve hit rate
        const cacheLat = lat ? parseFloat(lat).toFixed(2) : "0";
        const cacheLng = lng ? parseFloat(lng).toFixed(2) : "0";
        const cacheKey = `search:${q || "all"}:${cacheLat}:${cacheLng}:${sort}:${category || "all"}:${pageNum}:${limitNum}`;
        
        const cachedMatch = await redisClient.get(cacheKey);
        if (cachedMatch) {
            return res.json(JSON.parse(cachedMatch));
        }

        // Build filter
        const filter = { status: "active", stock: { $gt: 0 } };
        if (category) filter.category = category;

        if (q) {
            const searchIds = await SearchEngine.searchProducts(q, 100);
            if (searchIds !== "USE_DB_FALLBACK" && Array.isArray(searchIds)) {
                filter._id = { $in: searchIds };
            } else {
                filter.$or = [
                    { name: { $regex: q, $options: "i" } },
                    { category: { $regex: q, $options: "i" } },
                    { description: { $regex: q, $options: "i" } },
                ];
            }
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

        // Filter out closed sellers and out-of-range products before sorting
        const validProducts = enriched.filter(p => {
            // If we have seller GPS + Customer GPS, strictly enforce radius
            if (p.distanceKm !== null && p.seller?.deliveryRadius) {
                if (p.distanceKm > p.seller.deliveryRadius) return false;
            } else if (p.distanceKm !== null && p.distanceKm > 15) {
                // Fallback max delivery radius of 15km if seller radius not explicitly set
                return false;
            }
            // Enforce open/close status
            if (p.seller && p.seller.isOpen === false) return false;
            return true;
        });

        // Sort valid products
        let sorted = validProducts;
        switch (sort) {
            case "price": sorted = validProducts.sort((a, b) => a.sellingPrice - b.sellingPrice); break;
            case "rating": sorted = validProducts.sort((a, b) => (b.seller?.rating || 0) - (a.seller?.rating || 0)); break;
            case "delivery_time": sorted = validProducts.sort((a, b) => a.estimatedDeliveryMin - b.estimatedDeliveryMin); break;
            case "distance": sorted = validProducts.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)); break;
            case "smart":
            default:
                // Default to Smart Logistics Ranking (Highest Score First)
                sorted = validProducts.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
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

        // Paginate the grouped results
        const allGroups = Object.values(grouped);
        const totalGroups = allGroups.length;
        const startIdx = (pageNum - 1) * limitNum;
        const paginatedGroups = allGroups.slice(startIdx, startIdx + limitNum);
        const hasMore = startIdx + limitNum < totalGroups;

        const responseObj = {
            ok: true,
            products: sorted,           // flat list (for backward compat)
            grouped: paginatedGroups,   // paginated grouped by name
            total: sorted.length,
            totalGroups,
            page: pageNum,
            hasMore,
        };

        // Cache for 2 minutes
        await redisClient.setex(cacheKey, 120, JSON.stringify(responseObj));

        res.json(responseObj);
    } catch (err) { next(err); }
});

// ── List Products (public, paginated) ─────────────────────────────────────────
router.get("/",
    validateJoi(productValidation.listProducts),
    async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            const categoryFilter = req.query.category || "all";
            const searchFilter = req.query.search || "all";
            const cacheKey = `products_list:${categoryFilter}:${searchFilter}:${page}:${limit}`;

            const cachedMatch = await redisClient.get(cacheKey);
            if (cachedMatch) {
                return res.json(JSON.parse(cachedMatch));
            }

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

            const responseObj = {
                ok: true,
                products,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            };

            await redisClient.setex(cacheKey, 120, JSON.stringify(responseObj));
            res.json(responseObj);
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
    authenticate, authorize("seller", "admin", "super_admin"),
    validateJoi(productValidation.createProduct),
    async (req, res, next) => {
        try {
            const product = await Product.create({
                ...req.body,
                sellerId: req.user._id,
            });
            await SearchEngine.syncProduct(product);
            res.status(201).json({ ok: true, product });
        } catch (err) { next(err); }
    }
);

// ── Update Product (seller/admin) ─────────────────────────────────────────────
router.patch("/:id",
    authenticate, authorize("seller", "admin", "super_admin"),
    async (req, res, next) => {
        try {
            const productToUpdate = await Product.findById(req.params.id);
            if (!productToUpdate) throw new NotFound("Product not found");

            if (req.user.role !== "admin" && productToUpdate.sellerId?.toString() !== req.user._id.toString()) {
                throw new NotFound("Product not found or unauthorized to edit");
            }

            const product = await Product.findByIdAndUpdate(
                req.params.id,
                { $set: req.body },
                { new: true, runValidators: true }
            );
            await SearchEngine.syncProduct(product);
            res.json({ ok: true, product });
        } catch (err) { next(err); }
    }
);

// ── Update Stock ──────────────────────────────────────────────────────────────
router.patch("/:id/stock",
    authenticate, authorize("seller", "admin", "super_admin"),
    validateJoi(productValidation.updateStock),
    async (req, res, next) => {
        try {
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFound("Product not found");

            if (req.user.role !== "admin" && product.sellerId?.toString() !== req.user._id.toString()) {
                throw new NotFound("Product not found or unauthorized to edit stock");
            }

            product.stock = Math.max(0, product.stock + req.body.delta);
            await product.save();
            await SearchEngine.syncProduct(product);
            res.json({ ok: true, product });
        } catch (err) { next(err); }
    }
);

// ── Delete Product (admin / seller) ──────────────────────────────────────────
router.delete("/:id",
    authenticate, authorize("admin", "super_admin", "seller"),
    async (req, res, next) => {
        try {
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFound("Product not found");

            if (req.user.role !== "admin" && req.user.role !== "super_admin" && product.sellerId.toString() !== req.user._id.toString()) {
                throw new NotFound("Product not found or unauthorized to delete");
            }

            await product.deleteOne(); // Use deleteOne to trigger any hooks if they exist, or just remove
            await SearchEngine.removeProduct(req.params.id);
            res.json({ ok: true, message: "Deleted successfully" });
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
    validateJoi(productValidation.rateProduct),
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
    authenticate, authorize("seller", "admin", "super_admin"),
    validateJoi(productValidation.updateImages),
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

