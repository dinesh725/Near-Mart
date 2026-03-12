const { Worker } = require('bullmq');
const redisClient = require('../config/redis');
const Withdrawal = require('../models/Withdrawal');
const { executeTransfer } = require('../services/payoutService');
const { processTransaction } = require('../services/ledgerService');
const logger = require('../utils/logger');

const setupPayoutWorker = (app) => {
    const worker = new Worker('payouts', async job => {
        const { withdrawalId } = job.data;
        
        logger.info(`[Payout Worker] Starting processing for withdrawal: ${withdrawalId}`);
        const withdrawal = await Withdrawal.findById(withdrawalId).populate('walletId');
        
        if (!withdrawal) throw new Error('Withdrawal record not found');
        
        if (withdrawal.status !== 'REQUESTED') {
            logger.warn(`[Payout Worker] Skipping withdrawal ${withdrawalId} - already ${withdrawal.status}`);
            return; // Only process fresh requests
        }

        // 1. Mark status Processing to prevent duplicate pick-ups
        withdrawal.status = 'PROCESSING';
        await withdrawal.save();

        // 2. Extract Token
        const payoutAccountId = withdrawal.walletId.payoutAccountId;
        if (!payoutAccountId) throw new Error('Wallet has no payoutAccountId token');

        // 3. Execute via Gateway API Context
        const amountInPaise = Math.round(withdrawal.amount * 100);
        const { ok, id, error } = await executeTransfer(amountInPaise, payoutAccountId, withdrawal.idempotencyKey);
        
        if (!ok) {
            // Reversal Flow: Network or Bank Failed Hard
            logger.error(`[Payout Worker] Transfer Failed: ${error}`);
            withdrawal.status = 'FAILED';
            withdrawal.failureReason = error;
            await withdrawal.save();
            
            // Re-credit Seller ledger
            await processTransaction({
                idempotencyKey: `payout_refund_${withdrawal._id}`,
                orderId: null,
                type: 'PAYOUT_REVERSAL'
            }, [
                { walletType: 'PAYOUT_RESERVE', ownerId: null, amount: -withdrawal.amount, balanceType: 'balance' },
                { walletType: 'SELLER', ownerId: withdrawal.sellerId, amount: withdrawal.amount, balanceType: 'availableBalance' }
            ]);
            
            throw new Error(`Refunded to Seller: ${error}`);
        }

        withdrawal.gatewayPayoutId = id;
        await withdrawal.save();
        logger.info(`[Payout Worker] Success. Gateway ID: ${id}`);
        
        // Wait for webhook for 'PAID' status
    }, { connection: redisClient });

    worker.on('failed', (job, err) => {
        logger.error(`[Payout Worker ERROR] Job ${job.id} completely failed: ${err.message}`);
    });

    logger.info(`✅ Payout Worker initialized... listening for bank intent requests.`);
};

module.exports = { setupPayoutWorker };
