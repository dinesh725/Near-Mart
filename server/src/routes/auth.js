const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const config = require("../config");
const validateJoi = require("../middleware/validateJoi");
const authValidation = require("../validations/auth.validation");
const userValidation = require("../validations/user.validation");
const { authLimiter } = require("../middleware/rateLimiter");
const verifyCaptcha = require("../middleware/verifyCaptcha");
const { recordSuspiciousEvent } = require("../middleware/abuseDetector");
const { BadRequest, Unauthorized, Conflict, Forbidden } = require("../utils/errors");
const { authenticate, safeGenerateTokens } = require("../middleware/auth");
const logger = require("../utils/logger");
const EmailService = require("../services/emailService");
const SmsService = require("../services/smsService");
const { addNotificationJob } = require("../services/queueService");
const { OAuth2Client } = require("google-auth-library");
const redisClient = require("../config/redis");

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Security: Only these roles may be self-assigned during public registration ──
const PUBLIC_ROLES = ["customer", "seller", "vendor", "delivery"];

// ── Register ──────────────────────────────────────────────────────────────────
router.post("/register",
    authLimiter,
    validateJoi(authValidation.register),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { name, email, password } = data;
            // Security: clamp role to public roles only — admin/support cannot self-register
            const role = PUBLIC_ROLES.includes(data.role) ? data.role : "customer";

            const exists = await User.findOne({ email });
            if (exists) throw new Conflict("Email already registered");

            const user = await User.create({ name, email, password, role });
            const tokens = await safeGenerateTokens(user._id);

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

// ── Accept Staff Invite ───────────────────────────────────────────────────────
const Invite = require("../models/Invite");

router.post("/accept-invite",
    authLimiter,
    validateJoi(authValidation.acceptInvite),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { token, name, password } = data;

            const invite = await Invite.findOne({ token });
            if (!invite) throw new BadRequest("Invalid invite token");
            if (!invite.isValid()) throw new BadRequest("Invite has expired or already been used");

            // Check email collision
            const exists = await User.findOne({ email: invite.email });
            if (exists) throw new Conflict("An account with this email already exists");

            // Create staff account with the role from the invite
            const user = await User.create({
                name,
                email: invite.email,
                password,
                role: invite.role,
                status: "active",
                invitedBy: invite.invitedBy,
                emailVerified: true, // Trusted — invite was sent to this email
            });

            // Mark invite as used
            invite.usedAt = new Date();
            invite.usedBy = user._id;
            await invite.save();

            const tokens = await safeGenerateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            logger.info(`Staff onboarded via invite: ${invite.email} as ${invite.role}`);
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
    validateJoi(authValidation.login),
    // Conditional CAPTCHA: only enforce after 3+ failed login attempts
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const existingUser = await User.findOne({ email: data.email });
            if (existingUser && (existingUser.loginAttempts || 0) >= 3) {
                return verifyCaptcha(req, res, next);
            }
            next();
        } catch (err) { next(err); }
    },
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { email, password } = data;
            const user = await User.findOne({ email }).select("+password +mfaSecret");

            // ── Suspended account block ────────────────────────────────────
            if (user && user.status === "suspended") {
                logger.warn("auth:suspended_login", {
                    event: "SUSPENDED_USER_LOGIN_ATTEMPT",
                    userId: user._id,
                    ip: req.ip,
                    route: req.originalUrl,
                    timestamp: new Date().toISOString(),
                });
                throw new Forbidden("Account suspended. Contact support.");
            }

            // ── Per-account lockout check ──────────────────────────────────
            if (user && user.lockUntil && user.lockUntil > Date.now()) {
                const minsLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
                throw new Unauthorized(`Account locked due to multiple failed login attempts. Try again in ${minsLeft} minutes.`);
            }

            // ── Credential verification ────────────────────────────────────
            if (!user || !(await user.comparePassword(password))) {
                // Track failed attempt (only if user exists)
                if (user) {
                    user.loginAttempts = (user.loginAttempts || 0) + 1;

                    // Progressive delay: 500ms per prior failure, capped at 3s
                    const delay = Math.min((user.loginAttempts - 1) * 500, 3000);
                    if (delay > 0) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                    if (user.loginAttempts >= 5) {
                        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
                        logger.warn(`Account locked: ${email} after ${user.loginAttempts} failed attempts`);
                    }
                    await user.save();
                }
                // Record for IP abuse tracking
                recordSuspiciousEvent(req.ip, "login_failure");
                throw new Unauthorized("Invalid email or password");
            }

            // ── Successful auth — reset lockout counters ───────────────────
            if (user.loginAttempts > 0 || user.lockUntil) {
                user.loginAttempts = 0;
                user.lockUntil = undefined;
            }

            // ── Device fingerprinting & new device alert ────────────────
            const currentIp = req.ip;
            const currentUA = req.headers["user-agent"] || "unknown";

            if (user.lastLoginIp && (user.lastLoginIp !== currentIp || user.lastLoginUserAgent !== currentUA)) {
                logger.warn("New login device detected for user", {
                    userId: user._id.toString(),
                    ip: currentIp,
                    userAgent: currentUA,
                    previousIp: user.lastLoginIp,
                });
            }

            user.lastLoginIp = currentIp;
            user.lastLoginUserAgent = currentUA;
            user.lastLoginAt = new Date();

            // Append to loginHistory (capped at 10 entries)
            if (!user.loginHistory) user.loginHistory = [];
            user.loginHistory.push({ ip: currentIp, userAgent: currentUA, at: new Date() });
            if (user.loginHistory.length > 10) {
                user.loginHistory = user.loginHistory.slice(-10);
            }

            // ── MFA check for privileged roles ───────────────────────────
            if (["admin", "super_admin"].includes(user.role) && user.mfaEnabled && user.mfaSecret) {
                await user.save(); // persist lockout reset + device info
                return res.json({ ok: true, requireMfa: true, mfaUserId: user._id });
            }

            // OTP Reset failover
            const now = new Date();
            if (user.otpCountResetAt && now > user.otpCountResetAt) {
                user.otpCountToday = 0;
                user.otpCountResetAt = new Date(now.setHours(24, 0, 0, 0));
                logger.info(`OTP cost-control limits organically reset for user ${user._id}`);
            }

            const tokens = await safeGenerateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            logger.info(`User logged in: ${email}`);
            res.json({ ok: true, user: user.toJSON(), ...tokens });
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Multi-Factor Authentication (TOTP) ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

/**
 * POST /api/auth/mfa/setup
 * Generate a TOTP secret and return QR code for admin/super_admin.
 */
router.post("/mfa/setup",
    authenticate,
    async (req, res, next) => {
        try {
            if (!["admin", "super_admin"].includes(req.user.role)) {
                throw new BadRequest("MFA is only available for admin and super_admin accounts");
            }
            if (req.user.mfaEnabled) {
                throw new BadRequest("MFA is already enabled for this account");
            }

            const secret = speakeasy.generateSecret({
                name: `NearMart (${req.user.email})`,
                issuer: "NearMart",
                length: 20,
            });

            // Save secret temporarily — not enabled until verified
            await User.findByIdAndUpdate(req.user._id, { mfaSecret: secret.base32 });

            const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

            res.json({
                ok: true,
                secret: secret.base32,
                qrCode: qrDataUrl,
                message: "Scan the QR code with your authenticator app, then verify with a token.",
            });
        } catch (err) { next(err); }
    }
);

/**
 * POST /api/auth/mfa/verify
 * Verify a TOTP token to enable MFA.
 */
router.post("/mfa/verify",
    authenticate,
    validateJoi(authValidation.mfaVerify),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const user = await User.findById(req.user._id).select("+mfaSecret");
            if (!user || !user.mfaSecret) {
                throw new BadRequest("MFA setup not initiated. Call /mfa/setup first.");
            }

            const verified = speakeasy.totp.verify({
                secret: user.mfaSecret,
                encoding: "base32",
                token: data.token,
                window: 1, // Allow 1 window of drift (30s each direction)
            });

            if (!verified) {
                throw new BadRequest("Invalid TOTP token. Please try again.");
            }

            user.mfaEnabled = true;
            await user.save();

            logger.info(`MFA enabled for ${user.email}`);
            res.json({ ok: true, message: "MFA successfully enabled." });
        } catch (err) { next(err); }
    }
);

/**
 * POST /api/auth/mfa/login
 * Complete MFA login — verify TOTP and issue JWT tokens.
 */
router.post("/mfa/login",
    authLimiter,
    validateJoi({ body: require("joi").object({
        mfaUserId: require("joi").string().trim().required().messages({ "any.required": "User ID required" }),
        token: require("joi").string().trim().required().messages({ "any.required": "TOTP token required" }),
    }).unknown(false) }),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { mfaUserId, token } = data;

            const user = await User.findById(mfaUserId).select("+mfaSecret");
            if (!user || !user.mfaEnabled || !user.mfaSecret) {
                throw new Unauthorized("Invalid MFA session");
            }

            const verified = speakeasy.totp.verify({
                secret: user.mfaSecret,
                encoding: "base32",
                token,
                window: 1,
            });

            if (!verified) {
                throw new Unauthorized("Invalid TOTP token");
            }

            const tokens = await safeGenerateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            logger.info(`MFA login completed: ${user.email}`);
            res.json({ ok: true, user: user.toJSON(), ...tokens });
        } catch (err) { next(err); }
    }
);

// ── Demo Login (quick access for demo roles) ──────────────────────────────────
router.post("/demo/:role",
    authLimiter,
    require("../middleware/validateJoi")({ params: require("joi").object({ role: require("joi").string().required() }) }),
    async (req, res, next) => {
        try {
            const params = req.validatedParams || req.params;
            const { role } = params;
            if (!User.ROLES.includes(role)) throw new BadRequest("Invalid role");

            const user = await User.findOne({ role, email: new RegExp(`^demo\\.${role}@`) });
            if (!user) throw new BadRequest(`No demo user for role: ${role}`);

            const tokens = await safeGenerateTokens(user._id);
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

        let tokens;
        try {
            tokens = await safeGenerateTokens(user._id);
        } catch (securityErr) {
            // ── 🔴 CRITICAL: Invalidate refresh token if suspension/security failure ──
            user.refreshToken = null;
            await user.save();
            logger.warn("auth:refresh_denied", {
                event: "REFRESH_DENIED_SUSPENSION",
                userId: user._id,
                ip: req.ip,
                route: req.originalUrl,
                timestamp: new Date().toISOString(),
            });
            throw securityErr;
        }

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

        if (req.user.role === "delivery") {
            try {
                await redisClient.zrem("riders:locations", req.user._id.toString());
                await redisClient.hdel(`rider:${req.user._id}:meta`, "data");
            } catch (e) {
                logger.warn(`Redis logout cleanup failed for rider ${req.user._id}`);
            }
        }

        res.json({ ok: true, message: "Logged out" });
    } catch (err) { next(err); }
});

// ── Get Current User ──────────────────────────────────────────────────────────
router.get("/me", authenticate, (req, res) => {
    res.json({ ok: true, user: req.user.toJSON() });
});

// ── Update User Location ──────────────────────────────────────────────────────
router.patch("/location", authenticate,
    validateJoi(authValidation.location),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { lat, lng, address } = data;
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
router.patch("/profile", authenticate, validateJoi(userValidation.updateProfile),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const allowed = [
                "name", "phone", "address",
                "storeName", "storeId", "city", "payoutAccount", "businessHours",
                "companyName", "supplierId", "paymentTerms",
                "vehicleType", "vehicleNo",
                "department", "shift",
                "kycDocuments", "kycSubmittedAt",
                "avatar", "storeDescription", "isOnline", "deliveryRadius", "serviceRadius"
            ];
            for (const key of allowed) {
                if (data[key] !== undefined) req.user[key] = data[key];
            }
            
            // Auto-transition to SUBMITTED if documents are explicitly provided and not already verified
            if (data.kycDocuments !== undefined && req.user.kycStatus !== "VERIFIED") {
                req.user.kycStatus = "SUBMITTED";
                if (!data.kycSubmittedAt) {
                    req.user.kycSubmittedAt = new Date(); // Server-generated timestamp fallback
                }
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
    validateJoi(authValidation.google),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { token } = data;
            // Security: clamp role to public roles only
            const role = PUBLIC_ROLES.includes(data.role) ? data.role : "customer";

            // ── Validate Required ENV Variables ──
            if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
                logger.error("Missing Google Auth environment variables", { 
                    id: !!process.env.GOOGLE_CLIENT_ID, 
                    secret: !!process.env.GOOGLE_CLIENT_SECRET, 
                    callback: !!process.env.GOOGLE_CALLBACK_URL 
                });
                return res.status(500).json({ ok: false, error: "Authentication service configuration error" });
            }

            // Verify Google Token
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            const { sub: googleId, email, name, picture, email_verified } = payload;

            // ── Strict OAuth Profile Validation ──
            if (!email || !email_verified) {
                logger.warn("OAuth failure: missing or unverified email", { ip: req.ip, route: req.originalUrl });
                throw new BadRequest("Your Google account must have a verified email address.");
            }

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
                    role: role
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

            const tokens = await safeGenerateTokens(user._id);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            res.json({ ok: true, user: user.toJSON(), ...tokens, isNewUser });
        } catch (err) {
            logger.warn(`Google auth failed: ${err.message}`);
            if (err.statusCode) {
                return next(err);
            }
            next(new Unauthorized("Invalid Google Token or Authentication Failed"));
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Google OAuth Mobile Redirect (Implicit Flow for Capacitor) ───────────────
// ══════════════════════════════════════════════════════════════════════════════

// This page receives the id_token from Google's implicit flow (in URL hash),
// sends it to our verify endpoint, and redirects back to the app with JWT tokens.
router.get("/google/mobile-redirect", (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Signing in...</title></head><body>
<p style="text-align:center;margin-top:40vh;font-family:sans-serif;color:#666">Completing sign-in...</p>
<script>
(function(){
  try {
    var hash = window.location.hash.substring(1);
    var params = new URLSearchParams(hash);
    var idToken = params.get('id_token');
    var error = params.get('error');
    if (error || !idToken) {
      window.location.href = 'in.nearmart.app://google-callback?error=' + encodeURIComponent(error || 'no_token');
      return;
    }
    fetch(window.location.origin + '/api/auth/google/mobile-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok && data.accessToken) {
        window.location.href = 'in.nearmart.app://google-callback?accessToken=' + encodeURIComponent(data.accessToken) + '&refreshToken=' + encodeURIComponent(data.refreshToken);
      } else {
        window.location.href = 'in.nearmart.app://google-callback?error=' + encodeURIComponent(data.error || 'auth_failed');
      }
    })
    .catch(function(e) {
      window.location.href = 'in.nearmart.app://google-callback?error=' + encodeURIComponent(e.message || 'network_error');
    });
  } catch(e) {
    window.location.href = 'in.nearmart.app://google-callback?error=' + encodeURIComponent(e.message || 'unknown_error');
  }
})();
</script></body></html>`);
});

// Mobile verify endpoint — receives id_token from the redirect page above
router.post("/google/mobile-verify", async (req, res, next) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

        // ── Validate Required ENV Variables ──
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
            logger.error("Missing Google Auth environment variables on mobile-verify");
            return res.status(500).json({ ok: false, error: "Authentication service configuration error" });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture, email_verified } = payload;

        // ── Strict OAuth Profile Validation ──
        if (!email || !email_verified) {
            logger.warn("OAuth failure: missing or unverified email (mobile)", { ip: req.ip, route: req.originalUrl });
            throw new BadRequest("Your Google account must have a verified email address.");
        }

        let user = await User.findOne({ $or: [{ googleId }, { email }] });
        let isNewUser = false;

        if (!user) {
            user = await User.create({
                name, email, googleId,
                emailVerified: true,
                profileImage: picture,
                role: "customer"
            });
            isNewUser = true;
            logger.info(`New Google user created (mobile): ${email}`);
        } else {
            if (!user.googleId) {
                user.googleId = googleId;
                user.profileImage = user.profileImage || picture;
                user.emailVerified = true;
                await user.save();
                logger.info(`Google identity linked (mobile): ${email}`);
            }
        }

        const tokens = await safeGenerateTokens(user._id);
        user.refreshToken = tokens.refreshToken;
        await user.save();

        res.json({ ok: true, user: user.toJSON(), ...tokens, isNewUser });
    } catch (err) {
        logger.warn(`Google mobile auth failed: ${err.message}`);
        res.status(401).json({ ok: false, error: "Invalid Google Token" });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Phone Linking ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.post("/link-phone",
    authenticate,
    validateJoi(authValidation.linkPhone),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { phone, otp } = data;

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
    validateJoi(authValidation.sendOtp),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { phone } = data;

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

            // Dispatch OTP via Notification Queue
            await addNotificationJob("sms:sendOtp", { phone, otpCode: otp });

            res.json({ ok: true, message: "OTP sent successfully", expiresIn: 300 });
        } catch (err) { next(err); }
    }
);

router.post("/verify-otp",
    authLimiter,
    validateJoi(authValidation.verifyOtp),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { phone, otp, name, role } = data;

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
                // Security: clamp role to public roles only
                const safeRole = PUBLIC_ROLES.includes(role) ? role : "customer";
                user = await User.create({
                    name: name.trim(),
                    phone,
                    phoneVerified: true, // OTP verified = phone verified
                    role: safeRole,
                });
                isNewUser = true;
                logger.info(`New OTP user created: ${phone} as ${user.role}`);
            } else {
                // Mark phone as verified for existing users
                if (!user.phoneVerified) {
                    user.phoneVerified = true;
                }
            }

            const tokens = await safeGenerateTokens(user._id);
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
    validateJoi(authValidation.fcmToken),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const token = data.fcmToken;

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

            // Dispatch to Background Queue
            await addNotificationJob("email:verification", {
                to: req.user.email,
                actionUrl: verifyUrl,
                name: req.user.name
            });
            
            res.json({ ok: true, message: "Verification email queued for background sending" });
        } catch (err) { next(err); }
    }
);

router.get("/verify-email/:token", 
    require("../middleware/validateJoi")({ params: require("joi").object({ token: require("joi").string().required() }) }),
    async (req, res, next) => {
    try {
        const params = req.validatedParams || req.params;
        const { token } = params;
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
    validateJoi(authValidation.forgotPassword),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { identifier } = data;
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
                
                await addNotificationJob("email:reset_password", {
                    to: user.email,
                    actionUrl: verifyUrl,
                    name: user.name
                });
                
                res.json({ ok: true, message: "Recovery email queued." });
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
                await addNotificationJob("sms:sendOtp", { phone: identifier, otpCode: otp });
                
                res.json({ ok: true, message: "Recovery OTP queued." });
            }
        } catch (err) { next(err); }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// ── Change Password ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

router.post("/change-password", authenticate,
    validateJoi(authValidation.changePassword),
    async (req, res, next) => {
        try {
            const data = req.validatedBody || req.body;
            const { oldPassword, newPassword } = data;
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
