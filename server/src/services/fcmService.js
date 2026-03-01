const admin = require("firebase-admin");
const logger = require("../utils/logger");

/**
 * FCM Push Notification Service — Firebase Admin SDK
 * Uses firebase-admin (sendEachForMulticast) instead of deprecated legacy HTTP key.
 * Firebase Admin is initialized once in pushService.js.
 */

function getMessaging() {
    if (!admin.apps.length) {
        logger.warn("[FCM] Firebase Admin not initialized. Push will be skipped.");
        return null;
    }
    return admin.messaging();
}

/**
 * Send push to a single FCM device token.
 */
async function sendPush(fcmToken, title, body, data = {}) {
    const messaging = getMessaging();
    if (!messaging) return { sent: false, reason: "fcm_not_initialized" };
    if (!fcmToken) return { sent: false, reason: "no_token" };

    try {
        const msgId = await messaging.send({
            token: fcmToken,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: { priority: "high", notification: { sound: "default", channelId: "nearmart_default" } },
            apns: { payload: { aps: { sound: "default", badge: 1 } } },
        });
        logger.info(`[FCM] ✅ Sent "${title}" → token:...${fcmToken.slice(-8)} (msgId: ${msgId})`);
        return { sent: true, msgId };
    } catch (err) {
        logger.error(`[FCM] ❌ Failed for token ...${fcmToken.slice(-8)}:`, err.message);
        return { sent: false, reason: err.code || err.message };
    }
}

/**
 * Send push to a specific user by userId.
 */
async function sendToUser(userId, title, body, data = {}) {
    const User = require("../models/User");
    const user = await User.findById(userId);
    if (!user?.fcmToken || !user.notificationEnabled) {
        return { sent: false, reason: "user_no_token_or_disabled" };
    }
    return sendPush(user.fcmToken, title, body, data);
}

/**
 * Send push to all users of a given role.
 */
async function sendToRole(role, title, body, data = {}) {
    const User = require("../models/User");
    const messaging = getMessaging();
    if (!messaging) return { sent: 0, total: 0 };

    const users = await User.find({
        role,
        fcmToken: { $exists: true, $ne: null },
        notificationEnabled: true,
    }).select("fcmToken");

    if (!users.length) return { sent: 0, total: 0 };

    const tokens = users.map(u => u.fcmToken).filter(Boolean);

    try {
        const response = await messaging.sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: { priority: "high", notification: { sound: "default", channelId: "nearmart_default" } },
            apns: { payload: { aps: { sound: "default", badge: 1 } } },
        });
        logger.info(`[FCM] Sent to ${response.successCount}/${tokens.length} ${role}s`);
        return { sent: response.successCount, total: tokens.length };
    } catch (err) {
        logger.error(`[FCM] sendToRole error:`, err.message);
        return { sent: 0, total: tokens.length, error: err.message };
    }
}

module.exports = { sendPush, sendToUser, sendToRole };
