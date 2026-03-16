const express = require("express");
const { body } = require("express-validator");
const VendorInventory = require("../models/VendorInventory");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { NotFound, BadRequest } = require("../utils/errors");

const router = express.Router();

// ── List Inventory (Public for Sellers to browse, specific for Vendors) ──
router.get("/", authenticate, async (req, res, next) => {
    try {
        let filter = {};
        // If a vendor is querying, only show their own inventory
        if (req.user.role === "vendor") {
            filter.vendorId = req.user._id;
        } else if (req.query.vendorId) {
            // If a seller is browsing a specific vendor
            filter.vendorId = req.query.vendorId;
        }

        const inventory = await VendorInventory.find(filter).sort({ createdAt: -1 });
        res.json({ ok: true, inventory });
    } catch (err) {
        next(err);
    }
});

// ── Add New Supply (Vendors Only) ──────────────────────────────────────────
router.post("/",
    authenticate, authorize("vendor"),
    require("../middleware/validateJoi")(require("joi").object({
        productName: require("joi").string().trim().required(),
        costPrice: require("joi").number().min(0).required(),
        stock: require("joi").number().integer().min(0).required(),
        unit: require("joi").string().optional(),
        emoji: require("joi").string().optional(),
        minOrderQty: require("joi").number().integer().min(1).optional(),
        leadDays: require("joi").number().integer().min(0).optional()
    }).unknown(true)),
    async (req, res, next) => {
        try {
            const item = await VendorInventory.create({
                ...req.body,
                vendorId: req.user._id,
                vendorName: req.user.name || req.user.companyName || "Vendor"
            });
            res.status(201).json({ ok: true, inventory: item });
        } catch (err) {
            next(err);
        }
    }
);

// ── Update Supply (Vendors Only) ───────────────────────────────────────────
router.patch("/:id",
    authenticate, authorize("vendor"),
    require("../middleware/validateJoi")(require("joi").object({
        costPrice: require("joi").number().min(0).optional(),
        stock: require("joi").number().integer().min(0).optional(),
        minOrderQty: require("joi").number().integer().min(1).optional()
    }).unknown(true)),
    async (req, res, next) => {
        try {
            const item = await VendorInventory.findOne({ _id: req.params.id, vendorId: req.user._id });
            if (!item) throw new NotFound("Inventory item not found");

            if (req.body.costPrice !== undefined) item.costPrice = req.body.costPrice;
            if (req.body.stock !== undefined) item.stock = req.body.stock;
            if (req.body.minOrderQty !== undefined) item.minOrderQty = req.body.minOrderQty;

            await item.save();
            res.json({ ok: true, inventory: item });
        } catch (err) {
            next(err);
        }
    }
);

// ── Delete Supply (Vendors Only) ───────────────────────────────────────────
router.delete("/:id", authenticate, authorize("vendor"), async (req, res, next) => {
    try {
        const item = await VendorInventory.findOneAndDelete({ _id: req.params.id, vendorId: req.user._id });
        if (!item) throw new NotFound("Inventory item not found");
        res.json({ ok: true, message: "Inventory item deleted" });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
