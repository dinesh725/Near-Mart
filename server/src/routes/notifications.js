const express = require("express");
const Notification = require("../models/Notification");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// ── Get Notifications (for current user's role) ───────────────────────────────
router.get("/", authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;

        const filter = {
            $or: [
                { forRole: req.user.role },
                { userId: req.user._id },
            ],
        };
        if (req.query.unread === "true") filter.read = false;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Notification.countDocuments(filter),
            Notification.countDocuments({ ...filter, read: false }),
        ]);

        res.json({
            ok: true, notifications, unreadCount,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
});

// ── Mark as Read ──────────────────────────────────────────────────────────────
router.patch("/:id/read", 
    authenticate, 
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res, next) => {
    try {
        const params = req.validatedParams || req.params;
        await Notification.findByIdAndUpdate(params.id, { read: true });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ── Mark All Read ─────────────────────────────────────────────────────────────
router.patch("/read-all", authenticate, async (req, res, next) => {
    try {
        await Notification.updateMany(
            { $or: [{ forRole: req.user.role }, { userId: req.user._id }], read: false },
            { read: true }
        );
        res.json({ ok: true });
    } catch (err) { next(err); }
});

module.exports = router;
