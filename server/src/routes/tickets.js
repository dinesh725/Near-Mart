const express = require("express");
const { body } = require("express-validator");
const Ticket = require("../models/Ticket");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { NotFound, BadRequest } = require("../utils/errors");
const { notify } = require("../services/notificationService");

const router = express.Router();

// ── Create Ticket ─────────────────────────────────────────────────────────────
router.post("/",
    authenticate,
    body("issue").trim().notEmpty().withMessage("Issue description required"),
    body("orderId").optional(),
    validate,
    async (req, res, next) => {
        try {
            const ticket = await Ticket.create({
                userId: req.user._id,
                customerName: req.user.name,
                orderId: req.body.orderId || undefined,
                problemItems: req.body.problemItems || [],
                reasonCategory: req.body.reasonCategory || "other",
                images: req.body.images || [],
                issue: req.body.issue,
                priority: req.body.priority || "medium",
            });

            await notify("support", `New ticket: "${req.body.issue}"`, "ticket");
            res.status(201).json({ ok: true, ticket });
        } catch (err) { next(err); }
    }
);

// ── List Tickets (role-filtered) ──────────────────────────────────────────────
router.get("/", authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let filter = {};
        if (req.user.role === "customer") filter.userId = req.user._id;
        if (req.query.status) filter.status = req.query.status;

        const [tickets, total] = await Promise.all([
            Ticket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Ticket.countDocuments(filter),
        ]);

        res.json({
            ok: true, tickets,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
});

// ── Send Message ──────────────────────────────────────────────────────────────
router.post("/:id/message",
    authenticate,
    body("text").trim().notEmpty(),
    body("from").optional().isIn(["customer", "agent", "system"]),
    validate,
    async (req, res, next) => {
        try {
            const ticket = await Ticket.findById(req.params.id);
            if (!ticket) throw new NotFound("Ticket not found");

            const from = req.user.role === "customer" ? "customer" : "agent";
            ticket.messages.push({ from, text: req.body.text });
            if (ticket.status === "open") ticket.status = "in_progress";
            await ticket.save();

            res.json({ ok: true, ticket });
        } catch (err) { next(err); }
    }
);

// ── Resolve Ticket ────────────────────────────────────────────────────────────
router.patch("/:id/resolve",
    authenticate, authorize("support", "admin"),
    async (req, res, next) => {
        try {
            const ticket = await Ticket.findById(req.params.id);
            if (!ticket) throw new NotFound();
            ticket.status = "resolved";
            await ticket.save();

            await notify("customer", `Your ticket has been resolved ✅`, "success", ticket.userId);
            res.json({ ok: true, ticket });
        } catch (err) { next(err); }
    }
);

// ── Escalate Ticket ───────────────────────────────────────────────────────────
router.patch("/:id/escalate",
    authenticate, authorize("support", "admin"),
    async (req, res, next) => {
        try {
            const ticket = await Ticket.findById(req.params.id);
            if (!ticket) throw new NotFound();
            ticket.status = "escalated";
            ticket.priority = "critical";
            await ticket.save();

            await notify("admin", `Ticket escalated: ${ticket.issue}`, "alert");
            res.json({ ok: true, ticket });
        } catch (err) { next(err); }
    }
);

module.exports = router;
