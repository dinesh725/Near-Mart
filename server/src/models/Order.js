const mongoose = require("mongoose");

// ── Phase-7: Production-Grade Order Statuses ─────────────────────────────────
const ORDER_STATUSES = [
    "PENDING_PAYMENT", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP",
    "RIDER_ASSIGNED", "ARRIVED_AT_STORE", "PICKED_UP",
    "ON_THE_WAY", "ARRIVED_AT_CUSTOMER", "OUT_FOR_DELIVERY",
    "DELIVERED", "CANCELLED", "REJECTED",
    // ── Return & Exchange Lifecycle ──
    "RETURN_REQUESTED", "RETURN_APPROVED", "RETURN_PICKED", "RETURN_COMPLETED",
    "EXCHANGE_REQUESTED", "EXCHANGE_APPROVED",
];

// ── Phase-7: Payment-Aware State Transitions ─────────────────────────────────
// Transitions from PENDING_PAYMENT to CONFIRMED are ONLY allowed by payment
// handlers (wallet deduction, Razorpay verify, webhook). Seller endpoints
// enforce paymentStatus === "paid" before allowing any action.
const VALID_TRANSITIONS = {
    PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PREPARING", "CANCELLED", "REJECTED"],
    PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
    READY_FOR_PICKUP: ["RIDER_ASSIGNED", "OUT_FOR_DELIVERY", "CANCELLED"],
    RIDER_ASSIGNED: ["ARRIVED_AT_STORE", "PICKED_UP", "CANCELLED"],
    ARRIVED_AT_STORE: ["PICKED_UP", "CANCELLED"],
    PICKED_UP: ["ON_THE_WAY", "OUT_FOR_DELIVERY"],
    ON_THE_WAY: ["ARRIVED_AT_CUSTOMER", "DELIVERED"],
    OUT_FOR_DELIVERY: ["ARRIVED_AT_CUSTOMER", "DELIVERED"],
    ARRIVED_AT_CUSTOMER: ["DELIVERED"],
    DELIVERED: ["RETURN_REQUESTED", "EXCHANGE_REQUESTED"],
    CANCELLED: [],
    REJECTED: [],
    // ── Return Lifecycle ──
    RETURN_REQUESTED: ["RETURN_APPROVED", "DELIVERED"], // DELIVERED = return denied (reverted)
    RETURN_APPROVED: ["RETURN_PICKED"],
    RETURN_PICKED: ["RETURN_COMPLETED"],
    RETURN_COMPLETED: [],
    // ── Exchange Lifecycle ──
    EXCHANGE_REQUESTED: ["EXCHANGE_APPROVED", "DELIVERED"],
    EXCHANGE_APPROVED: [],
};

// ── Unified Payment Status Enum ──────────────────────────────────────────────
// Merged from legacy ("pending","paid","failed","refunded") + Phase-6
// All payment routes now write to this single field.
const PAYMENT_STATUSES = [
    "pending",          // Initial state (awaiting payment)
    "paid",             // Payment confirmed (wallet or gateway)
    "failed",           // Payment failed
    "refunded",         // Full refund completed
    "PENDING_PAYMENT",  // Phase-6 alias (backward compat — used by some legacy checks)
    "AUTHORIZED",       // Gateway authorized but not captured
    "CAPTURED",         // Gateway captured
    "FAILED",           // Gateway failed (uppercase alias)
    "REFUNDED",         // Gateway refunded (uppercase alias)
    "PARTIALLY_REFUNDED",
    "DISPUTED",
];

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: "📦" },
    imageUrl: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    // ── Phase 2: Variants & Add-Ons ─────────────────────────────────
    selectedVariant: {
        variantId: { type: String },
        name: { type: String },
        price: { type: Number }
    },
    selectedAddOns: {
        type: [{
            addOnId: { type: String },
            name: { type: String },
            price: { type: Number }
        }],
        default: []
    },
}, { _id: false });

const orderSchema = new mongoose.Schema({
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    storeId: { type: String, default: "STORE-412" },
    storeName: { type: String, default: "Dark Store #412" },
    customerPhone: { type: String, default: "" },
    sellerPhone: { type: String, default: "" },
    deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acceptedByPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    offeredToPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    offerExpiresAt: { type: Date },
    rejectedByPartnerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    riderName: { type: String },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 30 },
    platformFee: { type: Number, default: 5 },
    discount: { type: Number, default: 0 },
    discountShare: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    sellerSubtotal: { type: Number, default: 0 },
    platformCommission: { type: Number, default: 0 },
    sellerNetEarnings: { type: Number, default: 0 },
    distanceSnapshot: { type: Number, default: 0 },
    events: [{
        status: { type: String, enum: ORDER_STATUSES },
        timestamp: { type: Date, default: Date.now },
        note: { type: String }
    }],
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING_PAYMENT", index: true },

    // ── UNIFIED Payment Status (Phase-7 — single definition) ─────────
    paymentStatus: {
        type: String,
        enum: PAYMENT_STATUSES,
        default: "pending"
    },

    escrowCapturedAt: { type: Date },
    gatewayPaymentId: { type: String, index: true },
    paymentId: { type: String, index: true },
    paymentGroupId: { type: String, index: true },
    razorpayOrderId: { type: String },
    disputeReason: { type: String },

    address: { type: String, default: "" },
    pickupLocation: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], index: "2dsphere" },
        lat: { type: Number },
        lng: { type: Number },
        address: { type: String }
    },
    dropLocation: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], index: "2dsphere" },
        lat: { type: Number },
        lng: { type: Number },
        address: { type: String }
    },
    assignedRadius: { type: Number, default: 3000 },
    liveDeliveryLocation: {
        lat: { type: Number },
        lng: { type: Number },
        heading: { type: Number }
    },
    routePolyline: { type: String },
    batchId: { type: String, default: null, index: true },
    estimatedArrivalTime: Date,
    distanceRemaining: Number,
    paymentMethod: { type: String, default: "Wallet" },

    flagged: { type: Boolean, default: false },
    cancelReason: { type: String },
    sellerNote: { type: String },
    // Prep tracking
    prepTime: { type: Number, default: 0 },
    prepStartedAt: { type: Date },
    confirmedAt: { type: Date },
    // Geofence validation
    geofencePickupValidated: { type: Boolean, default: false },
    geofenceDeliveryValidated: { type: Boolean, default: false },
    deliveryOtp: { type: String, select: false },
    deliveryIssue: { type: String },
    // ── Delivery Reliability Metrics ─────────────────────────────────
    acceptedAt: { type: Date },
    arrivedAtStoreAt: { type: Date },
    pickedUpAt: { type: Date },
    arrivedAtCustomerAt: { type: Date },
    deliveredAt: { type: Date },
    pickupDelayMs: { type: Number },
    deliveryDurationMs: { type: Number },
    riderAcceptanceMs: { type: Number },
    rejectionCount: { type: Number, default: 0 },
    failedAssignmentCount: { type: Number, default: 0 },
    escalationRequired: { type: Boolean, default: false },
    // ── Dispatch Monitoring (Phase-8) ────────────────────────────────
    offerCount: { type: Number, default: 0 },
    retryCount: { type: Number, default: 0 },
    dispatchStartTime: { type: Date },
    currentDispatchRadius: { type: Number, default: 10 }, // km — adaptive expansion
    dispatchLog: [{
        riderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        action: { type: String },
        timestamp: { type: Date, default: Date.now },
    }],
    // ── Customer Rating & Review ──────────────────────────────────────
    customerRating: { type: Number, min: 1, max: 5 },
    customerReview: { type: String, maxlength: 1000 },
    ratedAt: { type: Date },

    // ── Refund Tracking ──────────────────────────────────────────────
    refundStatus: { type: String, enum: ["none", "requested", "processing", "completed", "failed"], default: "none" },
    refundAmount: { type: Number, default: 0 },
    refundedAt: { type: Date },

    // ── Return & Exchange Tracking (Phase-7) ─────────────────────────
    returnStatus: { type: String, enum: ["none", "requested", "approved", "picked", "completed", "denied"], default: "none" },
    returnReason: { type: String },
    returnRequestedAt: { type: Date },
    returnApprovedAt: { type: Date },
    returnPickedAt: { type: Date },
    returnCompletedAt: { type: Date },
    exchangeStatus: { type: String, enum: ["none", "requested", "approved", "denied"], default: "none" },
    exchangeReason: { type: String },

    // Phase-6C: Settlement Flag
    isSettled: { type: Boolean, default: false }
}, { timestamps: true });

// ── Payment-Aware Transition Check ───────────────────────────────────────────
orderSchema.methods.canTransitionTo = function (newStatus) {
    return (VALID_TRANSITIONS[this.status] || []).includes(newStatus);
};

// ── Helper: Is payment confirmed? ────────────────────────────────────────────
orderSchema.methods.isPaymentConfirmed = function () {
    return ["paid", "CAPTURED"].includes(this.paymentStatus);
};

// ── Helper: Is COD order? ────────────────────────────────────────────────────
orderSchema.methods.isCOD = function () {
    return this.paymentMethod === "Cash" || this.paymentMethod === "COD";
};

orderSchema.index({ customerId: 1, status: 1 });
orderSchema.index({ sellerId: 1, status: 1 });
orderSchema.index({ deliveryPartnerId: 1, status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, acceptedByPartnerId: 1, offeredToPartnerId: 1 });

module.exports = mongoose.model("Order", orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.VALID_TRANSITIONS = VALID_TRANSITIONS;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
