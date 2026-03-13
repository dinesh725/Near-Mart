const cron = require("node-cron");
const logger = require("./logger");
const { addCronJobExec } = require("../services/queueService");

const startCronJobs = (app) => {
    // ── Every 1 Minute: Enqueue background tasks ──
    cron.schedule("* * * * *", async () => {
        try {
            logger.debug("[Cron] Dispatching 1-minute background tasks to BullMQ");
            
            await addCronJobExec("cronJobs", { type: "unassignDeadAssignments" });
            await addCronJobExec("cronJobs", { type: "escalateStarvingOrders" });
            await addCronJobExec("cronJobs", { type: "offlineGhostRiders" });
            // Phase-8: Stock reservation sweeper
            const { addStockReservationSweep } = require("../services/queueService");
            await addStockReservationSweep();
            // NOTE: cleanupAbandonedCarts runs on its own 5-min schedule in services/cronJobs.js

        } catch (error) {
            logger.error("[Cron Error] Failed to enqueue background tasks: " + error.message);
        }
    });

    // ── Phase-5: Every 5 Minutes: Snapshot Rider Durability ──
    cron.schedule("*/5 * * * *", async () => {
        try {
            await addCronJobExec("cronJobs", { type: "snapshotRiderDurability" });
        } catch (error) {
            logger.error("[Cron Error] Failed to enqueue snapshot task: " + error.message);
        }
    });
};

module.exports = { startCronJobs };
