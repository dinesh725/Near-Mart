const rateLimit = require("express-rate-limit");

// ── Global API limiter: 100 req / 15 min ─────────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many requests, please try again later." },
});

// ── Auth limiter: 20 req / 15 min for general auth routes ────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many auth attempts, please try again later." },
});

// ── Sensitive endpoint limiter: 10 req / 1 min ──────────────────────────────
// Applied to login, register, KYC upload — brute-force / abuse prevention
const sensitiveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many attempts. Please wait a minute before retrying." },
});

// ── Financial endpoint limiter: 5 req / 1 min ───────────────────────────────
// Applied to checkout, wallet add-money — prevents payment/wallet abuse
const financialLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many financial requests. Please wait before retrying." },
});

module.exports = { generalLimiter, authLimiter, sensitiveLimiter, financialLimiter };
