const admin = require("firebase-admin");
const logger = require("../utils/logger");

// ── Firebase Admin SDK Initialization ────────────────────────────────────────
// Reads credentials from environment variables (preferred) or falls back to
// the JSON file in development only.
let isFcmInitialized = false;

try {
    let credential;

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        // ── Production: use env vars ─────────────────────────────────────────
        credential = admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        });
        logger.info("[PushService] Using Firebase credentials from environment variables");
    } else {
        // ── Development fallback: try JSON file ──────────────────────────────
        const serviceAccount = require("../config/firebase-service-account.json");
        credential = admin.credential.cert(serviceAccount);
        logger.info("[PushService] Using Firebase credentials from JSON file (dev fallback)");
    }

    if (!admin.apps.length) {
        admin.initializeApp({ credential });
    }

    isFcmInitialized = true;
    logger.info("[PushService] ✅ Firebase Admin SDK initialized");
} catch (e) {
    logger.warn("[PushService] ⚠️  Firebase Admin SDK not initialized:", e.message);
    logger.warn("[PushService]    Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in env");
}

class PushService {
    /**
     * Send a push notification to one or more FCM device tokens.
     * @param {string|string[]} tokens - FCM device token(s)
     * @param {{ title: string, body: string, data?: object }} payload
     */
    async sendToDevice(tokens, payload) {
        if (!isFcmInitialized) {
            logger.warn("[PushService] Skipped push — Firebase Admin SDK not initialized");
            return { ok: false, reason: "fcm_not_initialized" };
        }

        const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
        const validTokens = tokenArray.filter(Boolean);

        if (validTokens.length === 0) {
            return { ok: false, reason: "no_tokens" };
        }

        try {
            const message = {
                notification: {
                    title: payload.title,
                    body: payload.body,
                },
                data: payload.data
                    ? Object.fromEntries(
                        Object.entries(payload.data).map(([k, v]) => [k, String(v)])
                    )
                    : {},
                android: {
                    priority: "high",
                    notification: {
                        sound: "default",
                        channelId: "nearmart_default",
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            sound: "default",
                            badge: 1,
                        },
                    },
                },
                tokens: validTokens,
            };

            const response = await admin.messaging().sendEachForMulticast(message);

            // Log and handle invalid tokens
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    logger.error(`[PushService] Failed token [${validTokens[idx].slice(-8)}]:`, resp.error?.message);
                    failedTokens.push(validTokens[idx]);
                }
            });

            logger.info(`[PushService] ✉️  Sent "${payload.title}" → ${response.successCount}/${validTokens.length} devices`);
            return { ok: true, successCount: response.successCount, failedTokens };
        } catch (error) {
            logger.error("[PushService] Error sending push:", error.message);
            return { ok: false, error: error.message };
        }
    }
}

module.exports = new PushService();
