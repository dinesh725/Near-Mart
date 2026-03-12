const { Worker } = require('bullmq');
const redisClient = require('../config/redis');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const { processTransaction } = require('../services/ledgerService');
const logger = require('../utils/logger');

const setupPaymentWorker = (app) => {
    const paymentWorker = new Worker('payments', async job => {
        const { eventType, data, eventId } = job.data;
        
        // 1. Replay Protection
        const exists = await Transaction.findOne({ gatewayEventId: eventId });
        if (exists) return logger.warn(`[Webhook Worker] Ignored Replay: ${eventId}`);

        // Extract Intent ID correctly depending on the Stripe event root object
        const intentId = eventType === 'charge.refunded' ? data.payment_intent : data.id;

        const order = await Order.findOne({ gatewayPaymentId: intentId });
        if (!order) throw new Error(`Order not found for Intent: ${intentId}`);

        // State Machine Constraints
        const states = ['PENDING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED'];
        const currentIndex = states.indexOf(order.paymentStatus);

        if (eventType === 'payment_intent.succeeded') {
            // Guard 1: Event Regression
            if (currentIndex >= states.indexOf('CAPTURED')) {
                 return logger.warn(`[Webhook Worker] Ignored Out-Of-Order Succeeded event for Order ${order._id}`);
            }

            // Guard 2: Amount Validation
            const receivedAmount = data.amount_received / 100;
            if (receivedAmount < order.total) { 
                order.paymentStatus = 'PARTIALLY_REFUNDED';
                order.flagged = true;
                await order.save();
                throw new Error(`[Webhook Worker] Amount Mismatch! Expected ${order.total}, Got ${receivedAmount}`);
            }

            // Guard 3: Double Entry Ledger Lock
            await processTransaction({
                 idempotencyKey: `charge_${data.id}`,
                 orderId: order._id,
                 type: 'PAYMENT_CAPTURE',
                 gatewayPaymentId: data.id,
                 gatewayEventId: eventId
            }, [
                 { walletType: 'CUSTOMER', ownerId: order.customerId, amount: -order.total }, 
                 { walletType: 'ESCROW', ownerId: null, amount: order.total }
            ]);

            // Guard 4: Escrow Secure, Unlock Logistics Layer
            order.paymentStatus = 'CAPTURED';
            order.escrowCapturedAt = new Date();
            
            // Only push to dispatch if it was waiting
            if (order.status === 'PENDING_PAYMENT') {
                order.status = 'READY_FOR_PICKUP'; 
            }
            await order.save();

            // Notify UI real-time
            const io = app.get("io"); 
            if (io) {
                io.to(`order_${order._id}`).emit('payment_success', { orderId: order._id });
                io.emit("orderStatusChanged", { orderId: order._id, status: order.status, customerId: order.customerId });
            }
            
            logger.info(`[Webhook Worker] CAPTURED & Escrowed Order ${order._id}`);
            
        } else if (eventType === 'payment_intent.payment_failed') {
            order.paymentStatus = 'FAILED';
            order.status = 'CANCELLED';
            await order.save();
            
            // Refund Phase 6B: Release tied-up inventory automatically
            for (const item of order.items) {
                const Product = require('../models/Product');
                let updateQuery = {};
                
                if (item.selectedVariant && item.selectedVariant.variantId) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId }, updateQuery, 
                        { arrayFilters: [{ "v.variantId": item.selectedVariant.variantId }] }
                    );
                } else {
                    updateQuery = { $inc: { stock: item.qty } };
                    await Product.findOneAndUpdate({ _id: item.productId }, updateQuery);
                }
            }
            logger.info(`[Webhook Worker] FAILED Payment for ${order._id}, released stock`);
            
        } else if (eventType === 'charge.refunded') {
            // Secure Ledger Double Entry - Move funds from Escrow BACK to Customer Gateway
            await processTransaction({
                 idempotencyKey: `refund_${data.id}`,
                 orderId: order._id,
                 type: 'REFUND',
                 gatewayRefundId: data.id, // Usually starts with re_
                 gatewayEventId: eventId
            }, [
                 { walletType: 'ESCROW', ownerId: null, amount: -order.total }, 
                 { walletType: 'CUSTOMER', ownerId: order.customerId, amount: order.total }
            ]);

            order.paymentStatus = 'REFUNDED';
            // We do NOT change order.status because it may have already been REJECTED or CANCELLED
            await order.save();
            logger.info(`[Webhook Worker] REFUNDED successfully for ${order._id}`);
        }
    }, { connection: redisClient });

    paymentWorker.on('failed', (job, err) => {
        logger.error(`[Webhook Worker ERROR] Job ${job.id} failed: ${err.message}`);
    });

    logger.info(`✅ Payment Webhook Worker running`);
};

module.exports = { setupPaymentWorker };
