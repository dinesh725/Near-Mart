const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const config = require("./config");
const { generalLimiter, sensitiveLimiter } = require("./middleware/rateLimiter");
const requestId = require("./middleware/requestId");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const { AppError } = require("./utils/errors");
const logger = require("./utils/logger");
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
        nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
});

// Route imports
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payments");
const ticketRoutes = require("./routes/tickets");
const notificationRoutes = require("./routes/notifications");
const procurementRoutes = require("./routes/procurement");
const walletRoutes = require("./routes/wallet");
const sellerRoutes = require("./routes/sellers");
const uploadRoutes = require("./routes/upload");
const adminLogisticsRoutes = require("./routes/admin-logistics");
const adminRoutes = require("./routes/admin");
const geocodingRoutes = require("./routes/geocoding");
const vendorInventoryRoutes = require("./routes/vendorInventory");
const vendorRoutes = require("./routes/vendors");
const webhookRoutes = require("./routes/webhooks");
const checkoutRoutes = require("./routes/checkout");
const kycRoutes = require("./routes/kyc");
const withdrawalRoutes = require("./routes/withdrawals");

// Start tracking background jobs (OTP Resets)
require("./services/cronJobs");

const app = express();

// ── Trust proxy (required for Render, Railway, Heroku) ───────────────────────
app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────────────────────────────
// helmet() must allow cross-origin API consumption for Capacitor WebView
// (WebView origin is https://localhost, API is at near-mart.onrender.com)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// Multi-origin CORS: CORS_ORIGIN can be comma-separated
const allowedOrigins = config.corsOrigin.split(",").map(o => o.trim()).filter(Boolean);
// Capacitor WebView origins (always allowed for mobile app support)
const capacitorOrigins = ["capacitor://localhost", "https://localhost", "http://localhost"];
app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (mobile apps, server-to-server)
        if (!origin) return cb(null, true);
        // Allow configured origins
        if (allowedOrigins.includes(origin)) return cb(null, true);
        // Allow Capacitor WebView origins (Android & iOS)
        if (capacitorOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
}));

// ── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ── Phase-6B: Webhooks (Must be before express.json for raw body) ──
app.use("/api/webhooks", webhookRoutes);

// ── Parsing ───────────────────────────────────────────────────────────────────
app.use(express.json({ 
    limit: "1mb",
    verify: (req, res, buf) => {
        req.rawBody = buf; // Retain raw body for HMAC signature verification
    }
}));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// ── Logging ───────────────────────────────────────────────────────────────────
if (config.nodeEnv !== "test") {
    app.use(morgan("short"));
}

// ── Request Correlation ID ──────────────────────────────────────────────────────
app.use(requestId);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use("/api/", generalLimiter);

// ── Sensitive Endpoint Rate Limiting (brute-force protection) ─────────────
app.use("/api/auth/login", sensitiveLimiter);
app.use("/api/auth/register", sensitiveLimiter);
app.use("/api/kyc/upload", sensitiveLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.status(200).send("NearMart server is awake! 🚀");
});

app.get("/api/health", (req, res) => {
    res.json({ ok: true, status: "running", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/procurement", procurementRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin/logistics", adminLogisticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/geocoding", geocodingRoutes);
app.use("/api/vendor-inventory", vendorInventoryRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/withdrawals", withdrawalRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ ok: false, error: "Endpoint not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            ok: false,
            code: err.code,
            error: err.message,
        });
    }

    // Mongoose validation errors
    if (err.name === "ValidationError") {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: messages.join(", ") });
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0];
        return res.status(409).json({ ok: false, code: "DUPLICATE", error: `Duplicate value for: ${field}` });
    }

    // Mongoose bad ObjectId
    if (err.name === "CastError" && err.kind === "ObjectId") {
        return res.status(400).json({ ok: false, code: "INVALID_ID", error: "Invalid ID format" });
    }

    logger.error("Unhandled error", { message: err.message, stack: err.stack, requestId: req.id });
    res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Internal server error" });
});

module.exports = app;
