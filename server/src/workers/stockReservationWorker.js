const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const StockReservation = require("../models/StockReservation");
const Product = require("../models/Product");
const Order = require("../models/Order");
const logger = require("../utils/logger");

const setupStockReservationWorker = () => {
    const worker = new Worker("stockReservation", async (job) => {
        if (job.name !== "sweep_expired") return;

        logger.info("[StockSweeper] Running expired reservation sweep...");

        const now = new Date();
        const expiredReservations = await StockReservation.find({
            status: "RESERVED",
            expiresAt: { $lt: now },
        });

        if (expiredReservations.length === 0) {
            logger.debug("[StockSweeper] No expired reservations found.");
            return;
        }

        logger.info(`[StockSweeper] Found ${expiredReservations.length} expired reservations.`);

        for (const reservation of expiredReservations) {
            try {
                // Release stock back to product
                if (reservation.selectedVariant?.variantId) {
                    await Product.findOneAndUpdate(
                        { _id: reservation.productId },
                        { $inc: { "variants.$[v].stock": reservation.qty } },
                        { arrayFilters: [{ "v.variantId": reservation.selectedVariant.variantId }] }
                    );
                } else if (reservation.selectedVariant?.name) {
                    await Product.findOneAndUpdate(
                        { _id: reservation.productId },
                        { $inc: { "variants.$[v].stock": reservation.qty } },
                        { arrayFilters: [{ "v.name": reservation.selectedVariant.name }] }
                    );
                } else {
                    await Product.findByIdAndUpdate(reservation.productId, {
                        $inc: { stock: reservation.qty },
                    });
                }

                // Mark reservation as expired
                reservation.status = "EXPIRED";
                await reservation.save();

                logger.info(`[StockSweeper] Released ${reservation.qty}x product ${reservation.productId} (group: ${reservation.paymentGroupId})`);
            } catch (err) {
                logger.error(`[StockSweeper] Failed to release reservation ${reservation._id}: ${err.message}`);
            }
        }

        // Cancel associated PENDING_PAYMENT orders for these payment groups
        const uniqueGroups = [...new Set(expiredReservations.map(r => r.paymentGroupId))];
        for (const paymentGroupId of uniqueGroups) {
            const pendingOrders = await Order.find({
                paymentGroupId,
                status: "PENDING_PAYMENT",
            });

            for (const order of pendingOrders) {
                order.status = "CANCELLED";
                order.paymentStatus = "failed";
                order.cancelReason = "Stock reservation expired (payment timeout)";
                order.events.push({
                    status: "CANCELLED",
                    note: "Phase-8 StockSweeper: Reservation expired after 10 minutes",
                });
                await order.save();
                logger.info(`[StockSweeper] Cancelled order ${order._id} (group: ${paymentGroupId})`);
            }
        }

        logger.info(`[StockSweeper] Sweep complete. Released ${expiredReservations.length} reservations.`);
    }, {
        connection: redisClient,
        concurrency: 1,
    });

    worker.on("completed", (job) => {
        logger.debug(`[StockSweeper] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
        logger.error(`[StockSweeper] Job ${job.id} failed: ${err.message}`);
    });

    logger.info("✅ Stock Reservation Sweeper Worker initialized.");
    return worker;
};

module.exports = { setupStockReservationWorker };
