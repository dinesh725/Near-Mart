const mongoose = require("mongoose");

const deliveryTrackingLogSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    heading: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    accuracy: { type: Number },
    timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

// Geo index for spatial queries
deliveryTrackingLogSchema.index({ "location": "2dsphere" });

// Compound index for order-based lookups
deliveryTrackingLogSchema.index({ orderId: 1, timestamp: -1 });

// TTL index: auto-delete logs after 30 days
deliveryTrackingLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("DeliveryTrackingLog", deliveryTrackingLogSchema);
