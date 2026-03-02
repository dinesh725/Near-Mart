const express = require("express");
const { body } = require("express-validator");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const config = require("../config");
const { authenticate, generateTokens } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const { BadRequest, Unauthorized, Conflict } = require("../utils/errors");
const logger = require("../utils/logger");
const EmailService = require("../services/emailService");
const SmsService = require("../services/smsService");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Register ──────────────────────────────────────────────────────────────────
router.post("/register",
    authLimiter,
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Min 6 characters"),
    body("role").isIn(User.ROLES).withMessage("Invalid role"),
    validate,
    async (req, res, next) => {
        try {
            const { name, email, password, role } = req.body;

            const exists = await User.findOne({ email });
            if (exists) throw new Conflict("Email already registered");

            const user = await User.create({ name, email, password, role });
            const tokens = generateTokens(user._id);

            user.refreshToken = tokens.refreshToken;
            await user.save();

            logger.info(`User registered: ${email} as ${role}`);
            res.status(201).json({
                ok: true,
                user: user.toJSON(),
                ...tokens,
            });
        } catch (err) { next(err); }
    }
);

// ── Login ─────────────────────────────────────────────────────────────────────
router.post("/login",
    authLimiter,
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("password").notEmpty().withMessage("Password required"),
    validate,
    async (req, res, next) => {
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email }).select("+password");

            if (!user || !(await user.comparePassword(password)))
                throw new Unauthorized("Invalid email or password");

            // OTP Reset failover
            const now = new Date();
            if (user.otpCountResetAt && now > user.otpCountResetAt) {
                user.otpCountToday = 0;
                user.otpCountResetAt = new Date(now.setHours(24, 0, 0, 0));
                logger.info(`OTP cost-control limits organically reset for user ${user._id}`);
            }

            const tokens = generateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            logger.info(`User logged in: ${email}`);
            res.json({ ok: true, user: user.toJSON(), ...tokens });
        } catch (err) { next(err); }
    }
);

// ── Demo Login (quick access for demo roles) ──────────────────────────────────
router.post("/demo/:role",
    authLimiter,
    async (req, res, next) => {
        try {
            const { role } = req.params;
            if (!User.ROLES.includes(role)) throw new BadRequest("Invalid role");

            const user = await User.findOne({ role, email: new RegExp(`^demo\\.${role}@`) });
            if (!user) throw new BadRequest(`No demo user for role: ${role}`);

            const tokens = generateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            res.json({ ok: true, user: user.toJSON(), ...tokens });
        } catch (err) { next(err); }
    }
);

// ── Refresh Token ─────────────────────────────────────────────────────────────
router.post("/refresh", async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) throw new Unauthorized("No refresh token");

        const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
        const user = await User.findById(decoded.id).select("+refreshToken");

        if (!user || user.refreshToken !== refreshToken)
            throw new Unauthorized("Invalid refresh token");

        const tokens = generateTokens(user._id);
        user.refreshToken = tokens.refreshToken;
        await user.save();

        res.json({ ok: true, ...tokens });
    } catch (err) {
        if (err.name === "TokenExpiredError")
            return next(new Unauthorized("Refresh token expired — please log in again"));
        next(err);
    }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post("/logout", authenticate, async (req, res, next) => {
    try {
        req.user.refreshToken = null;
        await req.user.save();
        res.json({ ok: true, message: "Logged out" });
    } catch (err) { next(err); }
});

// ── Get Current User ──────────────────────────────────────────────────────────
router.get("/me", authenticate, (req, res) => {
    res.json({ ok: true, user: req.user.toJSON() });
});

// ── Update User Location ──────────────────────────────────────────────────────
router.patch("/location", authenticate,
    body("lat").isNumeric().withMessage("lat required"),
    body("lng").isNumeric().withMessage("lng required"),
    validate,
    async (req, res, next) => {
        try {
            const { lat, lng, address } = req.body;
            req.user.location = {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                address: address || "",
                coordinates: [parseFloat(lng), parseFloat(lat)], // GeoJSON [lng, lat] for 2dsphere
            };
            await req.user.save();
            res.json({ ok: true, location: req.user.location });
        } catch (err) { next(err); }
    }
);


// ── Update Profile ────────────────────────────────────────────────────────────
router.patch("/profile", authenticate,
    async (req, res, next) => {
        try {
            const allowed = [
                "name", "phone", "address",
                "storeName", "storeId", "city", "payoutAccount", "businessHours",
                "companyName", "supplierId", "paymentTerms",
                "vehicleType", "vehicleNo",
                "department", "shift"
            ];
            for (const key of allowed) {
                if (req.body[key] !== undefined) req.user[key] = req.body[key];
            }
            await req.user.save();
            res.json({ ok: true, user: req.user.toJSON() });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Google One-Tap Sign In / OAuth ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.post("/google",
    authLimiter,
    body("token").notEmpty().withMessage("Google ID token required"),
    body("role").optional().isIn(User.ROLES).withMessage("Invalid role"),
    validate,
    async (req, res, next) => {
        try {
            const { token, role } = req.body;

            // Verify Google Token
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            const { sub: googleId, email, name, picture } = payload;

            // Find or Create Identity
            let user = await User.findOne({ $or: [{ googleId }, { email }] });
            let isNewUser = false;

            if (!user) {
                user = await User.create({
                    name,
                    email,
                    googleId,
                    emailVerified: true, // Trusted from Google
                    profileImage: picture,
                    role: role || "customer"
                });
                isNewUser = true;
                logger.info(`New Google user created: ${email}`);
            } else {
                // Link Google Identity if they matched on Email but lacked googleId
                if (!user.googleId) {
                    user.googleId = googleId;
                    user.profileImage = user.profileImage || picture;
                    user.emailVerified = true;
                    await user.save();
                    logger.info(`Google identity linked to existing user: ${email}`);
                }
            }

            const tokens = generateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            res.json({ ok: true, user: user.toJSON(), ...tokens, isNewUser });
        } catch (err) {
            logger.warn(`Google auth failed: ${err.message}`);
            next(new Unauthorized("Invalid Google Token"));
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Phone Linking ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.post("/link-phone",
    authenticate,
    body("phone").trim().notEmpty().withMessage("Phone required"),
    body("otp").trim().isLength({ min: 6, max: 6 }).withMessage("6-digit OTP required"),
    validate,
    async (req, res, next) => {
        try {
            const { phone, otp } = req.body;

            // Prevent linking if phone is already claimed
            const existing = await User.findOne({ phone, _id: { $ne: req.user._id } });
            if (existing) {
                return res.status(409).json({ ok: false, error: "Phone number is already registered to another account." });
            }

            const result = await Otp.verifyOtp(phone, otp);
            if (!result.valid) {
                return res.status(400).json({ ok: false, error: result.reason });
            }

            req.user.phone = phone;
            req.user.phoneVerified = true;
            await req.user.save();

            logger.info(`Phone ${phone} successfully linked to user ${req.user._id}`);
            res.json({ ok: true, message: "Phone number linked successfully", user: req.user.toJSON() });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── OTP Phone Login ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const Otp = require("../models/Otp");

// Rate limiter: 1 OTP per phone per 60s (in-memory)
const otpCooldowns = new Map();

router.post("/send-otp",
    authLimiter,
    body("phone").trim().notEmpty().withMessage("Phone number required")
        .matches(/^\+?[0-9]{10,15}$/).withMessage("Invalid phone number"),
    validate,
    async (req, res, next) => {
        try {
            const { phone } = req.body;

            // Rate limit check (in-memory 60s block)
            const lastSent = otpCooldowns.get(phone);
            if (lastSent && Date.now() - lastSent < 60000) {
                const secs = Math.ceil((60000 - (Date.now() - lastSent)) / 1000);
                return res.status(429).json({ ok: false, error: `Wait ${secs}s before requesting another OTP` });
            }

            // ── BETA READINESS: DAILY OTP COST CONTROL LIMIT (10/day) ──
            let user = await User.findOne({ phone });
            if (user) {
                const now = new Date();
                if (user.otpCountResetAt && now > user.otpCountResetAt) {
                    user.otpCountToday = 0;
                    user.otpCountResetAt = new Date(now.setHours(24, 0, 0, 0));
                }

                if (user.otpCountToday >= 10) {
                    return res.status(429).json({
                        ok: false,
                        error: "Phone verification limit reached for today. Please continue using email verification."
                    });
                }

                user.otpCountToday += 1;
                await user.save();
            }

            // ── Test Number Interception ─────────────────────────────────────
            // For test phones (like Firebase test numbers), use deterministic OTP
            const testOtp = SmsService.getTestOtp(phone);
            let otp;
            if (testOtp) {
                // Delete any existing OTP and create a new one with the known test code
                await Otp.deleteMany({ phone });
                const bcrypt = require("bcryptjs");
                const otpHash = await bcrypt.hash(testOtp, 10);
                const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
                await Otp.create({ phone, otpHash, expiresAt });
                otp = testOtp;
                logger.info(`[OTP] Test number ${phone} — deterministic OTP stored`);
            } else {
                const result = await Otp.createOtp(phone);
                otp = result.otp;
            }

            otpCooldowns.set(phone, Date.now());

            // Dispatch OTP via Service (logs to console in dev_console mode)
            await SmsService.sendOtp(phone, otp);

            res.json({ ok: true, message: "OTP sent successfully", expiresIn: 300 });
        } catch (err) { next(err); }
    }
);

router.post("/verify-otp",
    authLimiter,
    body("phone").trim().notEmpty().withMessage("Phone required"),
    body("otp").trim().isLength({ min: 6, max: 6 }).withMessage("6-digit OTP required"),
    body("name").optional().trim(),
    body("role").optional().isIn(User.ROLES).withMessage("Invalid role"),
    validate,
    async (req, res, next) => {
        try {
            const { phone, otp, name, role } = req.body;

            const result = await Otp.verifyOtp(phone, otp);
            if (!result.valid) {
                return res.status(400).json({ ok: false, error: result.reason });
            }

            // Find or create user
            let user = await User.findOne({ phone });
            let isNewUser = false;

            if (!user) {
                // OTP is valid but name is needed to create new account
                if (!name) return res.status(200).json({ ok: false, needsName: true, message: "Name required to create new account" });
                user = await User.create({
                    name: name.trim(),
                    phone,
                    phoneVerified: true, // OTP verified = phone verified
                    role: role || "customer",
                });
                isNewUser = true;
                logger.info(`New OTP user created: ${phone} as ${user.role}`);
            } else {
                // Mark phone as verified for existing users
                if (!user.phoneVerified) {
                    user.phoneVerified = true;
                }
            }

            const tokens = generateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            logger.info(`OTP login: ${phone} (${isNewUser ? "new" : "existing"})`);
            res.json({ ok: true, user: user.toJSON(), ...tokens, isNewUser });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── FCM Token Registration ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.patch("/fcm-token", authenticate,
    body("fcmToken").trim().notEmpty().withMessage("FCM token required"),
    validate,
    async (req, res, next) => {
        try {
            const token = req.body.fcmToken;

            // Add to array without duplicates
            if (!req.user.fcmTokens) req.user.fcmTokens = [];
            if (!req.user.fcmTokens.includes(token)) {
                req.user.fcmTokens.push(token);
                // Keep singleton for backwards compatibility
                req.user.fcmToken = token;
                await req.user.save();
                logger.info(`FCM token registered for user ${req.user._id}`);
            }

            res.json({ ok: true, message: "FCM token saved" });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Email Verification ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");

router.post("/send-email-verification", authenticate,
    async (req, res, next) => {
        try {
            if (!req.user.email) {
                return res.status(400).json({ ok: false, error: "No email set on this account" });
            }
            if (req.user.emailVerified) {
                return res.json({ ok: true, message: "Email already verified" });
            }

            const token = crypto.randomBytes(32).toString("hex");
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            await User.findByIdAndUpdate(req.user._id, {
                emailVerificationToken: token,
                emailVerificationExpires: expires,
            });

            const verifyUrl = `${EmailService.getFrontendUrl()}/verify-email?token=${token}`;

            // Try sending via EmailService (with 12s race timeout)
            try {
                await Promise.race([
                    EmailService.sendVerificationEmail(req.user.email, verifyUrl, req.user.name),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP Connection Timeout - Mail server unreachable")), 12000)),
                ]);
                res.json({ ok: true, message: "Verification email sent" });
            } catch (err) {
                logger.warn(`Failed to send verification email (${err.message}). Dev token fallback: ${verifyUrl}`);
                console.log(`\n  Email verification URL for ${req.user.email}: ${verifyUrl}\n`);
                return res.status(500).json({ ok: false, error: err.message || "Failed to send verification email. Please try again later." });
            }
        } catch (err) { next(err); }
    }
);

router.get("/verify-email/:token", async (req, res, next) => {
    try {
        const { token } = req.params;
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() },
        }).select("+emailVerificationToken +emailVerificationExpires");

        if (!user) {
            return res.status(400).json({ ok: false, error: "Invalid or expired verification token" });
        }

        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        logger.info(`Email verified for user ${user._id} (${user.email})`);
        res.json({ ok: true, message: "Email verified successfully" });
    } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Password Recovery ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.post("/forgot-password",
    authLimiter,
    body("identifier").trim().notEmpty().withMessage("Email or Phone required"),
    validate,
    async (req, res, next) => {
        try {
            const { identifier } = req.body;
            const isEmail = identifier.includes("@");

            const user = await User.findOne(isEmail ? { email: identifier.toLowerCase() } : { phone: identifier });
            if (!user) {
                // Return success anyway to prevent enumeration
                return res.json({ ok: true, message: "If an account exists, a recovery link/OTP has been sent." });
            }

            if (isEmail) {
                const token = crypto.randomBytes(32).toString("hex");
                user.emailVerificationToken = token;
                user.emailVerificationExpires = new Date(Date.now() + 3600000); // 1h
                await user.save();

                const verifyUrl = `${EmailService.getFrontendUrl()}/reset-password?token=${token}`;
                try {
                    await Promise.race([
                        EmailService.sendPasswordResetEmail(user.email, verifyUrl, user.name),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP Connection Timeout - Mail server unreachable")), 12000)),
                    ]);
                    res.json({ ok: true, message: "Recovery email sent." });
                } catch (e) {
                    logger.warn(`Recovery email failed for ${user.email} (${e.message})`);
                    console.log(`\n  [DEV] Password Reset URL: ${verifyUrl}\n`);
                    return res.status(500).json({ ok: false, error: e.message || "Failed to send recovery email. Please try again later." });
                }
            } else {
                // Cost control limits apply to recovery too
                const now = new Date();
                if (user.otpCountResetAt && now > user.otpCountResetAt) {
                    user.otpCountToday = 0;
                    user.otpCountResetAt = new Date(now.setHours(24, 0, 0, 0));
                }
                if (user.otpCountToday >= 10) {
                    return res.status(429).json({ ok: false, error: "Limit reached. Use email recovery." });
                }

                user.otpCountToday += 1;
                await user.save();

                const { otp } = await Otp.createOtp(identifier);
                const smsStatus = await SmsService.sendOtp(identifier, otp);
                if (smsStatus.devMode) {
                    console.log(`\n  [DEV] Recovery OTP for ${identifier}: ${otp}\n`);
                }
                res.json({ ok: true, message: "Recovery OTP sent." });
            }
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Change Password ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.post("/change-password", authenticate,
    body("oldPassword").notEmpty().withMessage("Current password required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
    validate,
    async (req, res, next) => {
        try {
            const { oldPassword, newPassword } = req.body;
            const user = await User.findById(req.user._id).select("+password");

            if (!user.password) {
                // User signed up via Google/OTP without setting a password
                user.password = newPassword;
                await user.save();
                return res.json({ ok: true, message: "Password set successfully" });
            }

            const isMatch = await user.comparePassword(oldPassword);
            if (!isMatch) return res.status(400).json({ ok: false, error: "Current password is incorrect" });

            user.password = newPassword;
            await user.save();

            logger.info(`Password changed for user ${user._id}`);
            res.json({ ok: true, message: "Password changed successfully" });
        } catch (err) { next(err); }
    }
);

module.exports = router;
