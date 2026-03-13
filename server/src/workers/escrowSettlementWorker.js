const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const Order = require("../models/Order");
const { processTransaction } = require("../services/ledgerService");
const logger = require("../utils/logger");

const setupEscrowSettlementWorker = () => {
    const worker = new Worker("escrowSettlement", async (job) => {
        const { orderId, riderId, sellerId, deliveryFee, subtotal, platformFee } = job.data;
        
        logger.info(`[EscrowSettlement] Processing job for Order ${orderId} (attempt ${job.attemptsMade + 1}/10)`);

        const order = await Order.findById(orderId);
        if (!order) {
            logger.warn(`[EscrowSettlement] Order ${orderId} not found — skipping`);
            return; // Non-retryable
        }

        // Idempotency: skip if already settled
        if (order.isSettled) {
            logger.info(`[EscrowSettlement] Order ${orderId} already settled — skipping`);
            return;
        }

        const riderFee = deliveryFee || 0;
        const commission = (subtotal || 0) * 0.15; // 15% Commission
        const sellerOwed = (subtotal || 0) - commission;
        const platformCut = commission + (platformFee || 0);

        // Force the escrow debit to exactly match the credits to obey the ledger rule
        const escrowDebit = riderFee + sellerOwed + platformCut;

        const idempotencyKey = `deliver_${orderId}`;

        await processTransaction({
            idempotencyKey,
            orderId,
            type: "ESCROW_RELEASE",
            metadata: { details: "Order Delivery Payouts (Phase-8 Queue)" }
        }, [
            { walletType: "ESCROW", ownerId: null, amount: -escrowDebit },
            { walletType: "RIDER", ownerId: riderId, amount: riderFee },
            { walletType: "SELLER", ownerId: sellerId, amount: sellerOwed },
            { walletType: "PLATFORM", ownerId: null, amount: platformCut }
        ]);

        // Mark order as settled
        await Order.findByIdAndUpdate(orderId, { $set: { isSettled: true } });

        logger.info(`[EscrowSettlement] ✅ Order ${orderId} settled — Rider: ₹${riderFee}, Seller: ₹${sellerOwed.toFixed(2)}, Platform: ₹${platformCut.toFixed(2)}`);
    }, {
        connection: redisClient,
        concurrency: 5,
    });

    worker.on("completed", (job) => {
        logger.debug(`[EscrowSettlement] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
        logger.error(`[EscrowSettlement] Job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`);
    });

    logger.info("✅ Escrow Settlement Worker initialized (10 retries, exponential backoff).");
    return worker;
};

module.exports = { setupEscrowSettlementWorker };
