const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, // Null for Platform/Escrow Wallets
    walletType: { 
        type: String, 
        enum: ["ESCROW", "SELLER", "RIDER", "PLATFORM", "CUSTOMER", "PAYOUT_RESERVE"], 
        required: true 
    },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["ACTIVE", "FROZEN", "CLOSED"], default: "ACTIVE" },
    // Legacy generic balance field (used by ESCROW, PLATFORM, CUSTOMER)
    balance: { type: Number, default: 0 },

    // Phase-6C Refactor: Explicit settlement states for Sellers/Riders
    pendingBalance: { type: Number, default: 0 },   // Uncleared funds (T+2 window)
    availableBalance: { type: Number, default: 0 }, // Fully cleared, withdrawable
    
    payoutAccountId: { type: String } // Tokenized Bank Account ID from Gateway
}, { timestamps: true });

// Prevent multiple wallets of the same type for a single user (except system wallets)
walletSchema.index({ ownerId: 1, walletType: 1 }, { unique: true, partialFilterExpression: { ownerId: { $ne: null } } });

module.exports = mongoose.model("Wallet", walletSchema);
