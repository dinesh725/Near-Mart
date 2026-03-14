const express = require("express");
const { body } = require("express-validator");
const User = require("../models/User");
const Invite = require("../models/Invite");
const { authenticate, authorize, authorizeHierarchy } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { BadRequest, NotFound, Conflict, Forbidden } = require("../utils/errors");
const logger = require("../utils/logger");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

// ══════════════════════════════════════════════════════════════════════════════
// ── Staff Invite System ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/invite-staff
 * Super Admin only: invite an admin or support staff member.
 * Admin can only invite support.
 */
router.post("/invite-staff",
    authenticate, authorizeHierarchy("admin"),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("role").isIn(Invite.STAFF_ROLES).withMessage("Role must be 'admin' or 'support'"),
    validate,
    async (req, res, next) => {
        try {
            const { email, role } = req.body;

            // Hierarchy enforcement: only super_admin can invite admins
            if (role === "admin" && req.user.role !== "super_admin") {
                throw new Forbidden("Only super admins can invite admin staff");
            }

            // Check if user already exists with this email
            const existingUser = await User.findOne({ email });
            if (existingUser) throw new Conflict("A user with this email already exists");

            // Check if there's already an active invite for this email
            const existingInvite = await Invite.findOne({
                email,
                usedAt: null,
                revokedAt: null,
                expiresAt: { $gt: new Date() },
            });
            if (existingInvite) throw new Conflict("An active invite already exists for this email");

            // Generate invite
            const token = Invite.generateToken();
            const invite = await Invite.create({
                email,
                role,
                token,
                invitedBy: req.user._id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            });

            // Build invite URL (frontend will handle this route)
            const baseUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
            const inviteUrl = `${baseUrl}/invite?token=${token}`;

            logger.info(`Staff invite created: ${email} as ${role} by ${req.user.email}`, {
                inviteId: invite._id,
                invitedBy: req.user._id,
            });

            res.status(201).json({
                ok: true,
                invite: {
                    id: invite._id,
                    email: invite.email,
                    role: invite.role,
                    expiresAt: invite.expiresAt,
                    inviteUrl,
                },
            });

            // Audit trail (non-blocking, after response)
            AuditLog.create({
                action: "staff_invited", actorId: req.user._id,
                actorName: req.user.name, actorRole: req.user.role,
                targetId: invite._id.toString(), targetType: "invite",
                details: { email, role },
                ipAddress: req.ip || "unknown",
            }).catch(() => {});
        } catch (err) { next(err); }
    }
);

/**
 * GET /api/admin/invites
 * List all invites (super_admin sees all, admin sees support invites only)
 */
router.get("/invites",
    authenticate, authorizeHierarchy("admin"),
    async (req, res, next) => {
        try {
            const filter = {};
            // Admins can only see support invites
            if (req.user.role === "admin") {
                filter.role = "support";
            }

            const invites = await Invite.find(filter)
                .populate("invitedBy", "name email role")
                .populate("usedBy", "name email")
                .sort({ createdAt: -1 })
                .limit(50);

            res.json({ ok: true, invites });
        } catch (err) { next(err); }
    }
);

/**
 * DELETE /api/admin/invites/:id
 * Revoke a pending invite
 */
router.delete("/invites/:id",
    authenticate, authorizeHierarchy("admin"),
    async (req, res, next) => {
        try {
            const invite = await Invite.findById(req.params.id);
            if (!invite) throw new NotFound("Invite not found");
            if (invite.usedAt) throw new BadRequest("Invite already used — cannot revoke");

            // Hierarchy: admin can only revoke support invites
            if (invite.role === "admin" && req.user.role !== "super_admin") {
                throw new Forbidden("Only super admins can revoke admin invites");
            }

            invite.revokedAt = new Date();
            await invite.save();

            logger.info(`Invite revoked: ${invite.email} by ${req.user.email}`);

            AuditLog.create({
                action: "invite_revoked", actorId: req.user._id,
                actorName: req.user.name, actorRole: req.user.role,
                targetId: invite._id.toString(), targetType: "invite",
                details: { email: invite.email, role: invite.role },
                ipAddress: req.ip || "unknown",
            }).catch(() => {});

            res.json({ ok: true, msg: "Invite revoked" });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── User Management ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/users
 * List all users with optional role filter.
 * super_admin sees all, admin sees support + public roles.
 */
router.get("/users",
    authenticate, authorizeHierarchy("admin"),
    async (req, res, next) => {
        try {
            const { role, status, page = 1, limit = 50 } = req.query;
            const filter = {};

            if (role) filter.role = role;
            if (status) filter.status = status;

            // Hierarchy: admins cannot view super_admin accounts
            if (req.user.role === "admin") {
                filter.role = { $ne: "super_admin" };
                if (role && role !== "super_admin") filter.role = role;
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [users, total] = await Promise.all([
                User.find(filter)
                    .select("name email role status avatar createdAt invitedBy")
                    .populate("invitedBy", "name email")
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                User.countDocuments(filter),
            ]);

            res.json({
                ok: true,
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });
        } catch (err) { next(err); }
    }
);

/**
 * PATCH /api/admin/users/:id/suspend
 * Suspend a user account.
 * super_admin can suspend anyone except themselves.
 * admin can suspend support only.
 */
router.patch("/users/:id/suspend",
    authenticate, authorizeHierarchy("admin"),
    body("reason").optional().trim(),
    async (req, res, next) => {
        try {
            const target = await User.findById(req.params.id);
            if (!target) throw new NotFound("User not found");

            // Cannot suspend yourself
            if (target._id.toString() === req.user._id.toString()) {
                throw new BadRequest("Cannot suspend your own account");
            }

            // Hierarchy enforcement
            if (target.role === "super_admin") {
                throw new Forbidden("Super admin accounts cannot be suspended");
            }
            if (target.role === "admin" && req.user.role !== "super_admin") {
                throw new Forbidden("Only super admins can suspend admin accounts");
            }

            target.status = "suspended";
            await target.save();

            logger.info(`User suspended: ${target.email} by ${req.user.email}`, {
                reason: req.body.reason || "No reason given",
            });

            AuditLog.create({
                action: "user_suspended", actorId: req.user._id,
                actorName: req.user.name, actorRole: req.user.role,
                targetId: target._id.toString(), targetType: "user",
                details: { email: target.email, role: target.role, reason: req.body.reason || "No reason given" },
                ipAddress: req.ip || "unknown",
            }).catch(() => {});

            res.json({ ok: true, user: target.toJSON() });
        } catch (err) { next(err); }
    }
);

/**
 * PATCH /api/admin/users/:id/activate
 * Re-activate a suspended user account.
 */
router.patch("/users/:id/activate",
    authenticate, authorizeHierarchy("admin"),
    async (req, res, next) => {
        try {
            const target = await User.findById(req.params.id);
            if (!target) throw new NotFound("User not found");

            if (target.role === "admin" && req.user.role !== "super_admin") {
                throw new Forbidden("Only super admins can activate admin accounts");
            }

            target.status = "active";
            await target.save();

            logger.info(`User activated: ${target.email} by ${req.user.email}`);

            AuditLog.create({
                action: "user_activated", actorId: req.user._id,
                actorName: req.user.name, actorRole: req.user.role,
                targetId: target._id.toString(), targetType: "user",
                details: { email: target.email, role: target.role },
                ipAddress: req.ip || "unknown",
            }).catch(() => {});

            res.json({ ok: true, user: target.toJSON() });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Audit Logs ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/audit-logs
 * Paginated list of all audit log entries.
 */
router.get("/audit-logs",
    authenticate, authorizeHierarchy("admin"),
    async (req, res, next) => {
        try {
            const { action, page = 1, limit = 50 } = req.query;
            const filter = {};
            if (action) filter.action = action;

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [logs, total] = await Promise.all([
                AuditLog.find(filter)
                    .populate("actorId", "name email role")
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                AuditLog.countDocuments(filter),
            ]);

            res.json({
                ok: true,
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });
        } catch (err) { next(err); }
    }
);

module.exports = router;
