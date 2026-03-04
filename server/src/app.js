const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const config = require("./config");
const { generalLimiter } = require("./middleware/rateLimiter");
const { AppError } = require("./utils/errors");
const logger = require("./utils/logger");

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
const geocodingRoutes = require("./routes/geocoding");
const vendorInventoryRoutes = require("./routes/vendorInventory");
const vendorRoutes = require("./routes/vendors");

// Start tracking background jobs (OTP Resets)
require("./services/cronJobs");

const app = express();

// ── Trust proxy (required for Render, Railway, Heroku) ───────────────────────
app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────────────────────────────
// helmet() must allow cross-origin API consumption for Capacitor WebView
// (WebView origin is https://localhost, API is at near-mart.onrender.com)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },  // Allow API responses to be read cross-origin
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },  // Allow Google OAuth popups
    contentSecurityPolicy: false,  // CSP not needed for an API server
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
    allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ── Parsing ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (config.nodeEnv !== "test") {
    app.use(morgan("short"));
}

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use("/api/", generalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
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
app.use("/api/geocoding", geocodingRoutes);
app.use("/api/vendor-inventory", vendorInventoryRoutes);
app.use("/api/vendors", vendorRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ ok: false, error: "Endpoint not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
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

    logger.error("Unhandled error", { message: err.message, stack: err.stack });
    res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Internal server error" });
});

module.exports = app;
