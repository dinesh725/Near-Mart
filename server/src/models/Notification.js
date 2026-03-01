const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    forRole: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: { type: String, enum: ["order", "update", "ticket", "demand", "alert", "success", "info", "stock", "payment", "error"], default: "info" },
    msg: { type: String, required: true },
    read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ forRole: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
