const cron = require("node-cron");
const User = require("../models/User");
const pushService = require("./pushService");
const logger = require("../utils/logger");

// Run every day at 12:01 AM
cron.schedule("1 0 * * *", async () => {
    logger.info("[Cron] Running daily OTP quota reset check...");
    try {
        const now = new Date();

        // Find users who have hit the limit (10+) and their reset time has passed
        const usersToReset = await User.find({
            otpCountToday: { $gte: 10 },
            otpCountResetAt: { $lt: now }
        });

        if (usersToReset.length === 0) return;

        // Reset them
        const userIds = usersToReset.map(u => u._id);
        const midnightTonight = new Date(now);
        midnightTonight.setHours(24, 0, 0, 0);

        await User.updateMany(
            { _id: { $in: userIds } },
            {
                $set: {
                    otpCountToday: 0,
                    otpCountResetAt: midnightTonight
                }
            }
        );

        // Dispatch notifications to those with devices
        const usersWithDevices = usersToReset.filter(u => u.fcmTokens && u.fcmTokens.length > 0);

        for (const user of usersWithDevices) {
            await pushService.sendMulticast(
                user.fcmTokens,
                "Phone Verification Unlocked 🔓",
                "Your daily phone verification limit has reset. You can now use your number for faster login.",
                { type: "auth_reset" }
            );
        }

        logger.info(`[Cron] Reset OTP quotas for ${usersToReset.length} users and sent ${usersWithDevices.length} push notifications.`);
    } catch (error) {
        logger.error("[Cron] Error resetting OTP quotas:", error);
    }
});

// ── Sweep stale PENDING_PAYMENT orders (every 5 minutes) ────────────────────
// IMPORTANT: This task is now fully handled by BullMQ cronWorkers.
// The inline cron below only enqueues the task — actual execution
// happens in workers/cronWorkers.js to prevent double stock restoration.
const { addCronJobExec } = require("./queueService");

cron.schedule("*/5 * * * *", async () => {
    try {
        await addCronJobExec("cronJobs", { type: "cleanupAbandonedCarts" });
    } catch (error) {
        logger.error("[Cron] Error enqueuing stale-order sweep: " + error.message);
    }
});
