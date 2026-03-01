const express = require("express");
const { body } = require("express-validator");
const Procurement = require("../models/Procurement");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { NotFound } = require("../utils/errors");
const { notify } = require("../services/notificationService");

const router = express.Router();

// ── Create Procurement Request ────────────────────────────────────────────────
router.post("/",
    authenticate, authorize("seller", "admin"),
    body("productId").notEmpty(),
    body("qty").isInt({ min: 1 }),
    validate,
    async (req, res, next) => {
        try {
            const product = await Product.findById(req.body.productId);
            if (!product) throw new NotFound("Product not found");

            const procurement = await Procurement.create({
                sellerId: req.user._id,
                productId: product._id,
                productName: product.name,
                qty: req.body.qty,
                costPrice: product.costPrice,
                vendorId: req.body.vendorId || undefined,
                vendorName: req.body.vendorName || undefined,
            });

            await notify("vendor", `New procurement request: ${product.name} × ${req.body.qty}`, "demand");
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

// ── Fulfill Procurement ───────────────────────────────────────────────────────
router.patch("/:id/fulfill",
    authenticate, authorize("vendor", "admin"),
    async (req, res, next) => {
        try {
            const proc = await Procurement.findById(req.params.id);
            if (!proc) throw new NotFound();

            proc.status = "fulfilled";
            proc.vendorId = req.user._id;
            proc.vendorName = req.user.name;
            await proc.save();

            // Add stock to product
            await Product.findByIdAndUpdate(proc.productId, {
                $inc: { stock: proc.qty },
            });

            await notify("seller", `Procurement fulfilled: ${proc.productName} × ${proc.qty}`, "stock");
            res.json({ ok: true, procurement: proc });
        } catch (err) { next(err); }
    }
);

module.exports = router;
