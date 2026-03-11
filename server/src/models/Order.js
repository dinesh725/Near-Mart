const mongoose = require("mongoose");

const ORDER_STATUSES = [
    "PENDING_PAYMENT", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", 
    "RIDER_ASSIGNED", "ARRIVED_AT_STORE", "PICKED_UP", 
    "ON_THE_WAY", "ARRIVED_AT_CUSTOMER", "OUT_FOR_DELIVERY", 
    "DELIVERED", "CANCELLED", "REJECTED"
];

const VALID_TRANSITIONS = {
    PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PREPARING", "CANCELLED", "REJECTED"],
    PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
    READY_FOR_PICKUP: ["RIDER_ASSIGNED", "OUT_FOR_DELIVERY", "CANCELLED"], // Kept classic OUT_FOR_DELIVERY for backwards app compatibility
    RIDER_ASSIGNED: ["ARRIVED_AT_STORE", "PICKED_UP", "CANCELLED"],
    ARRIVED_AT_STORE: ["PICKED_UP", "CANCELLED"],
    PICKED_UP: ["ON_THE_WAY", "OUT_FOR_DELIVERY"],
    ON_THE_WAY: ["ARRIVED_AT_CUSTOMER", "DELIVERED"],
    OUT_FOR_DELIVERY: ["ARRIVED_AT_CUSTOMER", "DELIVERED"], // Legacy support loop
    ARRIVED_AT_CUSTOMER: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
    REJECTED: [],
};

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: "📦" },
    imageUrl: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
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
    distanceSnapshot: { type: Number, default: 0 }, // Store fixed distance parameter
    events: [{
        status: { type: String, enum: ORDER_STATUSES },
        timestamp: { type: Date, default: Date.now },
        note: { type: String }
    }],
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING_PAYMENT", index: true },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    paymentId: { type: String },
    paymentGroupId: { type: String, index: true }, // Ties multiple sub-orders together for a single checkout
    razorpayOrderId: { type: String },
    address: { type: String, default: "" },
    pickupLocation: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], index: "2dsphere" }, // [lng, lat]
        lat: { type: Number },
        lng: { type: Number },
        address: { type: String }
    },
    dropLocation: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], index: "2dsphere" }, // [lng, lat]
        lat: { type: Number },
        lng: { type: Number },
        address: { type: String }
    },
    assignedRadius: { type: Number, default: 3000 }, // Auto-assigned visibility bounding radius in meters
    liveDeliveryLocation: {
        lat: { type: Number },
        lng: { type: Number },
        heading: { type: Number }
    },
    routePolyline: { type: String },
    batchId: { type: String, default: null, index: true }, // Identifier for multi-pickup grouped orders
    estimatedArrivalTime: Date,
    distanceRemaining: Number, // km
    paymentMethod: { type: String, default: "Wallet" },
    flagged: { type: Boolean, default: false },
    cancelReason: { type: String },
    sellerNote: { type: String },
    // Prep tracking
    prepTime: { type: Number, default: 0 }, // minutes
    prepStartedAt: { type: Date },
    confirmedAt: { type: Date },
    // Geofence validation
    geofencePickupValidated: { type: Boolean, default: false },
    geofenceDeliveryValidated: { type: Boolean, default: false },
    deliveryOtp: { type: String, select: false }, // Secure drop-off code hidden from riders
    deliveryIssue: { type: String }, // To track delivery disputes
    // ── Delivery Reliability Metrics ─────────────────────────────────
    acceptedAt: { type: Date },          // When rider accepted
    arrivedAtStoreAt: { type: Date },    // ARRIVED_AT_STORE
    pickedUpAt: { type: Date },          // When rider confirmed pickup
    arrivedAtCustomerAt: { type: Date }, // ARRIVED_AT_CUSTOMER
    deliveredAt: { type: Date },         // When rider confirmed delivery
    pickupDelayMs: { type: Number },     // Time from READY_FOR_PICKUP → actual pickup
    deliveryDurationMs: { type: Number },// Time from pickup → delivery
    riderAcceptanceMs: { type: Number }, // Time from READY_FOR_PICKUP → rider accept
    rejectionCount: { type: Number, default: 0 },        // Times riders rejected/ignored
    failedAssignmentCount: { type: Number, default: 0 },  // Times auto-assignment failed
    escalationRequired: { type: Boolean, default: false }, // Needs admin intervention
    dispatchLog: [{
        riderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        action: { type: String }, // "assigned", "rejected", "timeout", "manual_dispatch"
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
}, { timestamps: true });

orderSchema.methods.canTransitionTo = function (newStatus) {
    return (VALID_TRANSITIONS[this.status] || []).includes(newStatus);
};

orderSchema.index({ customerId: 1, status: 1 });
orderSchema.index({ sellerId: 1, status: 1 });
orderSchema.index({ deliveryPartnerId: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.VALID_TRANSITIONS = VALID_TRANSITIONS;
