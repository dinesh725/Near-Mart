const mongoose = require("mongoose");

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

const VALID_TRANSITIONS = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PREPARING", "CANCELLED"],
    PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
    READY_FOR_PICKUP: ["OUT_FOR_DELIVERY"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
};

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: "📦" },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    storeId: { type: String, default: "STORE-412" },
    storeName: { type: String, default: "Dark Store #412" },
    deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acceptedByPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    riderName: { type: String },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 30 },
    platformFee: { type: Number, default: 5 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING", index: true },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    paymentId: { type: String },
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
    // ── Delivery Reliability Metrics ─────────────────────────────────
    acceptedAt: { type: Date },          // When rider accepted
    pickedUpAt: { type: Date },          // When rider confirmed pickup
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
