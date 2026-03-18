const express = require("express");
const Procurement = require("../models/Procurement");
const Product = require("../models/Product");
const VendorInventory = require("../models/VendorInventory");
const { authenticate, authorize } = require("../middleware/auth");
const { NotFound } = require("../utils/errors");
const { notify } = require("../services/notificationService");
const logger = require("../utils/logger");

const router = express.Router();

// ── Create Procurement Request ────────────────────────────────────────────────
router.post("/",
    authenticate, authorize("seller", "admin", "super_admin"),
    (req, res, next) => { logger.debug("Incoming PO payload", { body: req.body }); next(); },
    require("../middleware/validateJoi")({ body: require("joi").object({
        items: require("joi").array().items(require("joi").object({
            productName: require("joi").string().required(),
            qty: require("joi").number().integer().min(1).required(),
            costPrice: require("joi").number().min(0).required()
        }).unknown(true)).min(1).required()
    }).unknown(true) }),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const items = data.items.map(item => ({
                productId: item.productId,
                productName: item.productName,
                qty: Number(item.qty),
                costPrice: Number(item.costPrice)
            }));

            const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.costPrice), 0);

            // Phase 8: Wholesale Freight Logistics Math
            const totalWeight = items.reduce((sum, item) => sum + item.qty, 0); // Heuristic: 1 qty unit = 1 kg approx.
            const distanceKm = Math.floor(Math.random() * 15) + 2; // Simulated transit 2-16km
            const deliveryFee = Math.floor((distanceKm * 12) + (totalWeight * 2.5)); // Dynamic Pricing: ₹12/km + ₹2.5/kg

            const procurement = await Procurement.create({
                sellerId: req.user._id,
                sellerName: req.user.name || req.user.companyName || "Seller",
                items,
                totalAmount,
                totalWeight,
                distanceKm,
                deliveryFee,
                vendorId: data.vendorId || undefined,
                vendorName: data.vendorName || undefined,
            });

            await notify("vendor", `New bulk request from ${procurement.sellerName}: ${items.length} items`, "demand");
            res.status(201).json({ ok: true, procurement });
        } catch (err) { next(err); }
    }
);

// ── List Procurement History ──────────────────────────────────────────────────
router.get("/", authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let filter = {};
        if (req.user.role === "seller") filter.sellerId = req.user._id;
        if (req.user.role === "vendor") filter.vendorId = req.user._id;

        const [items, total] = await Promise.all([
            Procurement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Procurement.countDocuments(filter),
        ]);

        res.json({
            ok: true, procurement: items,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
});

// ── Vendor Accept Procurement ──────────────────────────────────────────────────
router.patch("/:id/accept",
    authenticate, authorize("vendor", "admin", "super_admin"),
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res, next) => {
        try {
            const params = req.validatedParams || req.params;
            const proc = await Procurement.findById(params.id);
            if (!proc) throw new NotFound();

            // Deduct stock from Vendor's live inventory for ALL items BEFORE saving
            const vendorStocks = [];
            for (const item of proc.items) {
                const vendorStock = await VendorInventory.findOne({
                    vendorId: req.user._id,
                    productName: { $regex: new RegExp(`^${item.productName}$`, "i") }
                });

                if (!vendorStock || vendorStock.stock < item.qty) {
                    return res.status(400).json({ ok: false, error: `Insufficient stock in warehouse for ${item.productName}. You need ${item.qty} units.` });
                }
                vendorStocks.push({ doc: vendorStock, deduct: item.qty });
            }

            // All items valid, commit vendor stock deductions
            for (const entry of vendorStocks) {
                entry.doc.stock -= entry.deduct;
                await entry.doc.save();
            }

            // Phase 8: Handoff to Logistics
            proc.status = "accepted"; // Changed from 'fulfilled'. Waiting for Delivery Rider.
            proc.deliveryOtp = Math.floor(100000 + Math.random() * 900000).toString(); // Secure 6-digit OTP
            proc.vendorId = req.user._id;
            proc.vendorName = req.user.name || req.user.companyName || "Vendor";
            await proc.save();

            await notify("seller", `Vendor accepted your Purchase Order. Preparing for dispatch. OTP: ${proc.deliveryOtp}`, "transit");
            res.json({ ok: true, procurement: proc });
        } catch (err) { next(err); }
    }
);

// ── B2B Transit: List Available Jobs (Delivery) ───────────────────────────────
router.get("/transit/available", authenticate, authorize("delivery"), async (req, res, next) => {
    try {
        const rider = await require("../models/User").findById(req.user._id);
        const capacity = rider.weightCapacity || 20; // Default bike capacity 20kg

        // Find orders that have been accepted by vendor and are not too heavy for the rider
        const jobs = await Procurement.find({
            status: "accepted",
            totalWeight: { $lte: capacity }
        }).sort({ createdAt: -1 });

        res.json({ ok: true, jobs });
    } catch (err) { next(err); }
});

// ── B2B Transit: Accept Job (Pickup) ──────────────────────────────────────────
router.patch("/:id/pickup", 
    authenticate, authorize("delivery"), 
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res, next) => {
    try {
        const params = req.validatedParams || req.params;
        const proc = await Procurement.findById(params.id);
        if (!proc || proc.status !== "accepted") throw new NotFound();

        proc.status = "shipped";
        proc.deliveryPartnerId = req.user._id;
        proc.deliveryPartnerName = req.user.name || "Delivery Partner";
        await proc.save();

        await notify("seller", `Your wholesale order has been picked up by ${proc.deliveryPartnerName}.`, "transit");
        res.json({ ok: true, procurement: proc });
    } catch (err) { next(err); }
});

// ── B2B Transit: Complete Delivery (Drop-off & OTP) ───────────────────────────
router.patch("/:id/deliver", 
    authenticate, authorize("delivery"), 
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res, next) => {
    try {
        const { otp } = req.body;
        const params = req.validatedParams || req.params;
        const proc = await Procurement.findById(params.id);
        if (!proc || proc.status !== "shipped") throw new NotFound();

        // 1. High-Value Secure OTP check
        if (proc.deliveryOtp && proc.deliveryOtp !== otp) {
            return res.status(400).json({ ok: false, error: "Invalid Delivery OTP. Please verify with the Seller." });
        }

        proc.status = "delivered";
        await proc.save();

        // 2. Stock Injection (Deferred from Fulfill -> Deliver)
        for (const item of proc.items) {
            let product = await Product.findOne({ sellerId: proc.sellerId, name: { $regex: new RegExp(`^${item.productName}$`, "i") } });

            if (!product) {
                await Product.create({
                    sellerId: proc.sellerId,
                    name: item.productName,
                    category: "General",
                    costPrice: item.costPrice,
                    sellingPrice: item.costPrice * 1.5,
                    stock: item.qty,
                    status: "active",
                    emoji: "📦",
                    unit: "pcs"
                });
            } else {
                product.stock += item.qty;
                product.costPrice = item.costPrice;
                await product.save();
            }
        }

        await notify("seller", `Wholesale order delivered successfully by ${proc.deliveryPartnerName}!`, "success");
        res.json({ ok: true, procurement: proc });
    } catch (err) { next(err); }
});

module.exports = router;
