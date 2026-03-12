const { Worker } = require('bullmq');
const redisClient = require('../config/redis');
const Order = require('../models/Order');
const { createRefund } = require('../services/paymentGateway');
const logger = require('../utils/logger');

const setupRefundWorker = (app) => {
    const refundWorker = new Worker('refunds', async job => {
        const { orderId, amountInPaise } = job.data;
        
        const order = await Order.findById(orderId);
        if (!order) throw new Error(`Order ${orderId} not found for Refund Job`);

        if (!order.gatewayPaymentId) {
             throw new Error(`Order ${orderId} has no gateway Intent ID to refund`);
        }

        logger.info(`[Refund Worker] Requesting refund of ${amountInPaise} paise for order ${order._id}`);
        
        // Exclusively call Gateway API, do NOT mutate the local DB.
        // Wait for gateway webhook `charge.refunded` to arrive at `paymentWorker.js` to mutate local database
        const gatewayRes = await createRefund(order.gatewayPaymentId, amountInPaise);
        
        if (!gatewayRes.ok) {
             throw new Error(`Refund intent failed at gateway: ${gatewayRes.error}`);
        }

        logger.info(`[Refund Worker] Refund injected into Gateway networks for ${order._id}`);
        
    }, { connection: redisClient });

    refundWorker.on('failed', (job, err) => {
        logger.error(`[Refund Worker ERROR] Job ${job.id} failed: ${err.message}`);
    });

    logger.info(`✅ Refund Worker running`);
};

module.exports = { setupRefundWorker };
