const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");
const { geocodeAddress } = require("../services/geocoding");
const { BadRequest, NotFound } = require("../utils/errors");

const router = express.Router();

// ── Nearby Sellers ─────────────────────────────────────────────────────────────
// GET /api/sellers/nearby?lat=19.05&lng=72.83&radius=10&category=
router.get("/nearby", async (req, res, next) => {
    try {
        const { lat, lng, radius = 5, category } = req.query;

        let filter = { role: "seller", isOpen: true };

        // If coordinates provided, use geo-query
        if (lat && lng) {
            filter["location.coordinates"] = {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                    $maxDistance: parseFloat(radius) * 1000, // convert km → meters
                }
            };
        }

        const sellers = await User.find(filter)
            .select("_id name storeName storeDescription storePhone location businessHours isOpen rating deliveryRadius")
            .limit(30);

        // Add computed distance if coords provided
        const sellersWithMeta = sellers.map(s => {
            const seller = s.toJSON();
            if (lat && lng && s.location?.lat && s.location?.lng) {
                const R = 6371;
                const toRad = d => d * Math.PI / 180;
                const dLat = toRad(s.location.lat - parseFloat(lat));
                const dLng = toRad(s.location.lng - parseFloat(lng));
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(parseFloat(lat))) * Math.cos(toRad(s.location.lat)) * Math.sin(dLng / 2) ** 2;
                seller.distanceKm = parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
                seller.estimatedDeliveryMin = Math.round(seller.distanceKm * 6 + 10); // rough estimate
            }
            return seller;
        });

        sellersWithMeta.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));

        res.json({ ok: true, sellers: sellersWithMeta });
    } catch (err) { next(err); }
});

// ── Seller Onboarding ─────────────────────────────────────────────────────────
// PATCH /api/sellers/onboard
router.patch("/onboard", authenticate, authorize("seller", "admin", "super_admin"),
    require("../middleware/validateJoi")({ body: require("joi").object({
        storeName: require("joi").string().trim().optional(),
        storeDescription: require("joi").string().trim().optional(),
        storePhone: require("joi").string().trim().optional(),
        deliveryRadius: require("joi").number().optional(),
        isOpen: require("joi").boolean().optional()
    }).unknown(true) }),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { storeName, storeDescription, storePhone, deliveryRadius, isOpen, businessHours, address, lat, lng } = data;

            if (storeName !== undefined) req.user.storeName = storeName;
            if (storeDescription !== undefined) req.user.storeDescription = storeDescription;
            if (storePhone !== undefined) req.user.storePhone = storePhone;
            if (deliveryRadius !== undefined) req.user.deliveryRadius = parseFloat(deliveryRadius);
            if (isOpen !== undefined) req.user.isOpen = isOpen;
            if (businessHours) req.user.businessHours = { ...req.user.businessHours, ...businessHours };

            // Location update
            if (lat && lng) {
                req.user.location = {
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    address: address || req.user.location?.address || "",
                    coordinates: [parseFloat(lng), parseFloat(lat)], // GeoJSON [lng,lat]
                };
            } else if (address && !lat) {
                // Auto-geocode address
                const geoResult = await geocodeAddress(address);
                if (geoResult) {
                    req.user.location = {
                        lat: geoResult.lat,
                        lng: geoResult.lng,
                        address: geoResult.address,
                        coordinates: [geoResult.lng, geoResult.lat],
                    };
                }
            }

            await req.user.save();
            res.json({ ok: true, user: req.user.toJSON() });
        } catch (err) { next(err); }
    }
);

// ── Open / Close Store Toggle ─────────────────────────────────────────────────
// PATCH /api/sellers/toggle-open
router.patch("/toggle-open", authenticate, authorize("seller"), async (req, res, next) => {
    try {
        req.user.isOpen = !req.user.isOpen;
        await req.user.save();
        res.json({ ok: true, isOpen: req.user.isOpen });
    } catch (err) { next(err); }
});

// ── Get Seller Profile ────────────────────────────────────────────────────────
// GET /api/sellers/:id
router.get("/:id", 
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res, next) => {
    try {
        const params = req.validatedParams || req.params;
        const seller = await User.findOne({ _id: params.id, role: "seller" })
            .select("_id name storeName storeDescription storePhone location businessHours isOpen rating deliveryRadius");
        if (!seller) throw new NotFound("Seller not found");

        const productCount = await Product.countDocuments({ sellerId: params.id, status: "active" });
        res.json({ ok: true, seller: { ...seller.toJSON(), productCount } });
    } catch (err) { next(err); }
});

// ── Seller's Products ─────────────────────────────────────────────────────────
// GET /api/sellers/:id/products?category=&q=
router.get("/:id/products", 
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res, next) => {
    try {
        const { category, q, page = 1, limit = 40 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const params = req.validatedParams || req.params;
        const filter = { sellerId: params.id, status: "active", stock: { $gt: 0 } };
        if (category) filter.category = category;
        if (q) filter.$text = { $search: q };

        const [products, total] = await Promise.all([
            Product.find(filter).skip(skip).limit(parseInt(limit)).sort({ name: 1 }),
            Product.countDocuments(filter),
        ]);

        res.json({ ok: true, products, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
    } catch (err) { next(err); }
});

module.exports = router;
