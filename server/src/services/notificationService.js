const Notification = require("../models/Notification");
const logger = require("../utils/logger");

/**
 * Create a notification for a specific role (broadcast) or user.
 */
const notify = async (forRole, msg, type = "info", userId = null) => {
    try {
        await Notification.create({ forRole, msg, type, userId });
        logger.debug(`Notification → [${forRole}] ${type}: ${msg}`);
    } catch (err) {
        logger.error("Failed to create notification", { error: err.message });
    }
};

/**
 * Create notifications for multiple roles at once.
 */
const notifyMany = async (notifications) => {
    try {
        await Notification.insertMany(notifications);
    } catch (err) {
        logger.error("Failed to create notifications", { error: err.message });
    }
};

module.exports = { notify, notifyMany };
