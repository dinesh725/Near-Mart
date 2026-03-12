const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const logger = require("../utils/logger");

// ── Initialize Core System Wallets on boot ──
const ensureSystemWallets = async () => {
    try {
        await Wallet.updateOne({ walletType: "ESCROW", ownerId: null }, { $setOnInsert: { balance: 0 } }, { upsert: true });
        await Wallet.updateOne({ walletType: "PLATFORM", ownerId: null }, { $setOnInsert: { balance: 0 } }, { upsert: true });
    } catch (e) {
        logger.error(`[Ledger] System wallets failed to initialize: ${e.message}`);
    }
};

// Ensure basic wallets on startup
ensureSystemWallets();

const getOrCreateWallet = async (ownerId, walletType, session = null) => {
    // Atomic Upsert to prevent E11000 Duplicate Key errors on parallel generation
    const wallet = await Wallet.findOneAndUpdate(
        { ownerId, walletType },
        { $setOnInsert: { ownerId, walletType, balance: 0 } },
        { upsert: true, new: true, session }
    );
    return wallet;
};

// ── Process a Double-Entry Transaction Atomically ──
const processTransaction = async (metadata, entriesData) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Validate Double Entry sum is 0
        const sum = entriesData.reduce((acc, entry) => acc + entry.amount, 0);
        if (Math.abs(sum) > 0.01) throw new Error(`Transaction imbalanced. Sum: ${sum}`);

        const entries = [];

        // Apply ledger changes & update cached balances atomically
        for (const data of entriesData) {
            let wallet;
            
            // Allow targeting system-wide wallets directly
            if (!data.ownerId) {
                wallet = await Wallet.findOne({ walletType: data.walletType, ownerId: null }).session(session);
                if (!wallet) throw new Error(`System wallet ${data.walletType} missing`);
            } else {
                wallet = await getOrCreateWallet(data.ownerId, data.walletType, session);
            }

            // Lock and update wallet balance using atomic increment
            // Underflow Protection for Debits
            const balanceField = data.balanceType || "balance";
            const query = { _id: wallet._id };
            if (data.amount < 0) {
                query[balanceField] = { $gte: Math.abs(data.amount) };
            }

            const updatedWallet = await Wallet.findOneAndUpdate(
                query,
                { $inc: { [balanceField]: data.amount } },
                { session, new: true }
            );

            if (!updatedWallet && data.amount < 0) {
                throw new Error(`Insufficient Funds in Wallet: ${data.walletType || wallet._id}`);
            }

            entries.push({
                walletId: wallet._id,
                amount: data.amount,
                currency: data.currency || "INR",
                balanceType: balanceField
            });
        }

        const tx = new Transaction({
            ...metadata,
            entries,
            status: "COMPLETED",
            processedAt: new Date()
        });

        await tx.save({ session });

        await session.commitTransaction();
        session.endSession();
        return { ok: true, transaction: tx };

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error(`[Ledger ERROR] ${metadata.idempotencyKey || metadata.type}: ${error.message}`);
        // Log a failed transaction loosely (no session) if it was an error
        try {
            await Transaction.create({ ...metadata, status: "FAILED", entries: [], metadata: { error: error.message } });
        } catch (e) {}
        throw error; // Re-throw to caller
    }
};

module.exports = {
    getOrCreateWallet,
    processTransaction
};
