const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ROLES = ["customer", "seller", "vendor", "delivery", "support", "admin"];

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    phone: { type: String, sparse: true, index: true },
    address: { type: String, default: "" },
    // ── Common Location (Used by all) ──────────────────────────────────
    location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
        address: String,
        // Seller boundary mapping
        servicePolygon: {
            type: { type: String, enum: ["Polygon"], default: "Polygon" },
            coordinates: { type: [[[Number]]], default: [] }
        },
    },
    avatar: { type: String, default: "" },
    walletBalance: { type: Number, default: 0 },
    refreshToken: { type: String, select: false },
    // ── Push Notifications ──────────────────────────────────────────────────
    fcmToken: { type: String }, // Legacy, keep for backward compatibility
    fcmTokens: [{ type: String }], // Array for multiple devices
    notificationEnabled: { type: Boolean, default: true },
    // ── Email & Phone Verification ──────────────────────────────────────────
    // ── Email & Phone Verification ──────────────────────────────────────────
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    phoneVerified: { type: Boolean, default: false },
    otp: { type: String, select: false }, // Legacy OTP if needed (we'll migrate to Otp model soon)
    otpExpires: { type: Date, select: false },
    otpCountToday: { type: Number, default: 0 }, // Cost control: Track OTP sends
    otpCountResetAt: { type: Date, default: () => new Date(new Date().setHours(24, 0, 0, 0)) }, // Resets at midnight

    // ── Third-Party Identity ────────────────────────────────────────────────
    firebaseUid: { type: String, unique: true, sparse: true, index: true },
    googleId: { type: String, unique: true, sparse: true, index: true },
    profileImage: { type: String, default: "" },
    // Role-specific
    storeId: { type: String },
    storeName: String,
    storeDescription: { type: String, default: "" },
    storePhone: { type: String, default: "" },
    deliveryRadius: { type: Number, default: 5 }, // km
    serviceRadius: { type: Number, default: 5000 }, // meters
    isOpen: { type: Boolean, default: false },
    businessHours: {
        open: { type: String, default: "09:00" },
        close: { type: String, default: "21:00" },
        days: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
    },
    supplierId: { type: String },
    companyName: { type: String },
    paymentTerms: { type: String, default: "" }, // e.g. "Net 14"
    city: { type: String, default: "" },
    payoutAccount: { type: String, default: "" },
    // ── Delivery Partner Fields ──────────────────────────────────────
    vehicle: String,
    vehicleType: { type: String, enum: ["bike", "scooter", "van", "mini_truck", "large_truck"], default: "bike" },
    weightCapacity: { type: Number, default: 20 }, // in KG
    licenseNo: String,
    isOnline: { type: Boolean, default: false },
    lastLocationUpdate: Date,
    lastActivityAt: { type: Date },        // Last meaningful action (accept, location update, etc.)
    shiftStartedAt: { type: Date },        // When rider went online
    shiftEndedAt: { type: Date },          // When rider went offline
    activeOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    maxActiveOrders: { type: Number, default: 3 },
    activeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    rating: { type: Number, default: 5.0 },
    department: { type: String },
    shift: { type: String, default: "" }, // e.g. "9:00 AM - 6:00 PM"
    accessLevel: { type: String },
    loyaltyPoints: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    resolvedToday: { type: Number, default: 0 },
    // ── Phase-6C: KYC & Payouts ──────────────────────────────────────
    kycStatus: { 
        type: String, 
        enum: ['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED'], 
        default: 'PENDING' 
    },
    kycSubmittedAt: { type: Date },
    kycVerifiedAt: { type: Date },
    kycDocuments: [{
        docType: { type: String, enum: ['AADHAAR', 'PAN', 'PASSPORT', 'GSTIN'] },
        documentIdentifier: { type: String }, // Pre-signed cloud storage key
        status: { type: String, enum: ['VERIFIED', 'REJECTED'] }
    }],
    payoutsEnabled: { type: Boolean, default: false } // Safety kill-switch
}, { timestamps: true });

// Hash password before save
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

// Generate avatar from name
userSchema.pre("save", function (next) {
    if (!this.avatar || this.isModified("name")) {
        this.avatar = this.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    }
    next();
});

// Strip password from JSON
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.__v;
    return obj;
};

// Indexes: email already indexed via `unique`, role via `index: true` in schema

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
