const { Worker } = require('bullmq');
const redisClient = require('../config/redis');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const { processTransaction } = require('../services/ledgerService');
const logger = require('../utils/logger');

const sweepSettlements = async () => {
    try {
        const thresholdDate = new Date();
        thresholdDate.setHours(thresholdDate.getHours() - 48); // T+2
        
        // Find orders delivered more than 48 hr ago that haven't been 'settled'
        const orders = await Order.find({ 
            status: 'DELIVERED', 
            deliveredAt: { $lte: thresholdDate },
            isSettled: { $ne: true } // Need to add isSettled tracking flag
        });
        
        for (const order of orders) {
            // Find the ESCROW settlement transaction (where seller got paid)
            const sellerEarnings = order.sellerNetEarnings;
            if (sellerEarnings > 0) {
                // Transfer from pending -> available
                // To do this we log a meta transaction explicitly
                const ok = await processTransaction({
                    idempotencyKey: `settle_maturate_${order._id}`,
                    orderId: order._id,
                    type: 'SETTLEMENT_MATURITY'
                }, [
                    { walletType: 'SELLER', ownerId: order.sellerId, amount: -sellerEarnings, balanceType: 'pendingBalance' },
                    { walletType: 'SELLER', ownerId: order.sellerId, amount: sellerEarnings, balanceType: 'availableBalance' }
                ]);
                
                if (ok) {
                    order.isSettled = true;
                    await order.save();
                    logger.info(`[Settlement Worker] Matured ₹${sellerEarnings} to available for Seller ${order.sellerId}`);
                }
            }
        }
    } catch (e) {
        logger.error(`[Settlement Worker] Sweep failed: ${e.message}`);
    }
};

const setupSettlementWorker = (app) => {
    const worker = new Worker('cron', async job => {
        if (job.data.task === 'sweep_settlements') {
            await sweepSettlements();
        }
    }, { connection: redisClient });

    worker.on('failed', (job, err) => {
        logger.error(`[Settlement Worker ERROR] Job failed: ${err.message}`);
    });

    logger.info(`✅ Settlement Maturity Worker activated.`);
};

module.exports = { setupSettlementWorker, sweepSettlements };
