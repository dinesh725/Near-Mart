const { Queue, Worker } = require("bullmq");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");

// ── Define Queues ─────────────────────────────────────────────────────────────
const notificationQueue = new Queue("notifications", { connection: redisClient });
const cronQueue = new Queue("cronJobs", { connection: redisClient });

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

module.exports = {
    notificationQueue,
    cronQueue,
    addNotificationJob,
    addCronJobExec,
};
