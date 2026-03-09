const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    from: { type: String, enum: ["customer", "agent", "system"], default: "agent" },
    text: { type: String, required: true },
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: { type: String },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    
    // Advanced Item-Level Tracking
    problemItems: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String },
        qty: { type: Number, default: 1 }
    }],
    reasonCategory: { 
        type: String, 
        enum: ["missing_item", "damaged_item", "wrong_item", "quality_issue", "delivery_delay", "other"],
        default: "other"
    },
    images: [{ type: String }], // Array of uploaded image URLs (Cloudinary)
    
    issue: { type: String, required: true },
    status: { type: String, enum: ["open", "in_progress", "resolved", "escalated"], default: "open", index: true },
    priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
    messages: [messageSchema],
}, { timestamps: true });

module.exports = mongoose.model("Ticket", ticketSchema);
