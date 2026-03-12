const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");
const EmailService = require("../services/emailService");
const pushService = require("../services/pushService");
const SmsService = require("../services/smsService");

const setupNotificationWorkers = () => {
    const notificationWorker = new Worker("notifications", async (job) => {
        const { type } = job.name; 
        // fallback to job.data.type if name is generic, but usually name is the queue action
        const actionType = job.name || job.data.type;
        const payload = job.data;
        
        try {
            switch (actionType) {
                case "email:verification":
                    await EmailService.sendVerificationEmail(payload.to, payload.actionUrl, payload.name);
                    break;
                case "email:reset_password":
                    await EmailService.sendPasswordResetEmail(payload.to, payload.actionUrl, payload.name);
                    break;
                case "push:sendToDevice":
                    await pushService.sendToDevice(payload.tokens, payload.messagePayload);
                    break;
                case "sms:sendOtp":
                    await SmsService.sendOtp(payload.phone, payload.otpCode);
                    break;
                default:
                    logger.warn(`[NotificationWorker] Unknown job type: ${actionType}`);
            }
        } catch (error) {
            logger.error(`[NotificationWorker] Error processing ${actionType}: ${error.message}`);
            throw error;
        }
    }, { connection: redisClient });

    notificationWorker.on("completed", (job) => logger.debug(`[NotificationWorker] Job ${job.id} completed`));
    notificationWorker.on("failed", (job, err) => logger.error(`[NotificationWorker] Job ${job.id} failed: ${err.message}`));

    return notificationWorker;
};

module.exports = { setupNotificationWorkers };
