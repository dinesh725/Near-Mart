const { Queue, Worker } = require("bullmq");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");

// ── Define Queues ─────────────────────────────────────────────────────────────
const notificationQueue = new Queue("notifications", { connection: redisClient });
const cronQueue = new Queue("cronJobs", { connection: redisClient });

const paymentQueue = new Queue("payments", { connection: redisClient });
const refundQueue = new Queue("refunds", { connection: redisClient });
const payoutQueue = new Queue("payouts", { connection: redisClient });

// ── Helper to schedule background jobs ────────────────────────────────────────
const addNotificationJob = async (type, payload) => {
    try {
        await notificationQueue.add(type, payload, {
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: true,
            removeOnFail: 100, // Keep last 100 failed jobs for inspection
        });
    } catch (err) {
        logger.error(`Failed to enqueue notification jobs: ${err.message}`);
    }
};

const addCronJobExec = async (type, payload, opts = {}) => {
    try {
        await cronQueue.add(type, payload, {
            removeOnComplete: true,
            removeOnFail: 10,
            ...opts
        });
    } catch (err) {
        logger.error(`Failed to enqueue cron task: ${err.message}`);
    }
};

const addPaymentJob = async (type, payload, opts = {}) => {
    try {
        await paymentQueue.add(type, payload, {
            attempts: 5,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: false, // Keep for audit
            ...opts
        });
    } catch (err) {
        logger.error(`Failed to enqueue payment job: ${err.message}`);
    }
};

const addRefundJob = async (payload, opts = {}) => {
    try {
        await refundQueue.add('execute_refund', payload, {
            attempts: 3,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: true,
            removeOnFail: false,
            ...opts
        });
    } catch (err) {
        logger.error(`Failed to enqueue refund job: ${err.message}`);
    }
};

const addPayoutJob = async (payload, opts = {}) => {
    try {
        await payoutQueue.add('execute_payout', payload, {
            attempts: 5, // Important for network retries
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
            removeOnFail: false, // Keep auditing trails
            ...opts
        });
    } catch (err) {
        logger.error(`Failed to enqueue payout job: ${err.message}`);
    }
};

module.exports = {
    notificationQueue,
    cronQueue,
    paymentQueue,
    refundQueue,
    payoutQueue,
    addNotificationJob,
    addCronJobExec,
    addPaymentJob,
    addRefundJob,
    addPayoutJob
};
