require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const config = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/nearmart",
    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || "15m",
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    },
    mapbox: {
        accessToken: process.env.MAPBOX_ACCESS_TOKEN,
    },
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    resend: {
        apiKey: process.env.RESEND_API_KEY,
    },
    fcm: {
        serverKey: process.env.FCM_SERVER_KEY,
    },
    otp: {
        expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10),
    },
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    nodeEnv: process.env.NODE_ENV || "development",
    platformCommission: 0.10,   // 10%
    deliveryFeeFlat: 30,        // ₹30
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};

// ── Startup Warnings ─────────────────────────────────────────────────────────
const warn = (key, label) => {
    if (!process.env[key]) console.warn(`⚠️  Missing env: ${key} — ${label} will not work`);
};
warn("RAZORPAY_KEY_ID", "Payment processing");
warn("RAZORPAY_KEY_SECRET", "Payment processing");
warn("MAPBOX_ACCESS_TOKEN", "Mapbox maps & routing");
warn("CLOUDINARY_CLOUD_NAME", "Image uploads");
warn("CLOUDINARY_API_KEY", "Image uploads");
warn("CLOUDINARY_API_SECRET", "Image uploads");

module.exports = config;
