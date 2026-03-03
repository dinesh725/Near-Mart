const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const VendorInventory = require("../models/VendorInventory");
const { authenticate, authorize } = require("../middleware/auth");
const { NotFound } = require("../utils/errors");

const router = express.Router();

// ── Get All Vendors ────────────────────────────────────────────────────────────
// GET /api/vendors
router.get("/", async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 50;

        // Fetch users who are strictly registered as "vendor"
        const vendors = await User.find({ role: "vendor" })
            .select("_id name companyName email phone city state country gst rating isVerified createdAt")
            .limit(limit);

        res.json(vendors);
    } catch (err) { next(err); }
});

// ── Get Single Vendor Profile ──────────────────────────────────────────────────
// GET /api/vendors/:id
router.get("/:id", async (req, res, next) => {
    try {
        const vendor = await User.findOne({ _id: req.params.id, role: "vendor" })
            .select("_id name companyName email phone city state country gst rating isVerified createdAt");

        if (!vendor) throw new NotFound("Vendor not found");

        const inventoryCount = await VendorInventory.countDocuments({ vendorId: req.params.id });
        res.json({ ...vendor.toJSON(), inventoryCount });
    } catch (err) { next(err); }
});

module.exports = router;
