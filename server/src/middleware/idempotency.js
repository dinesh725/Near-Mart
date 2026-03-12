const redisClient = require("../config/redis");
const logger = require("../utils/logger");

const idempotencyGuard = async (req, res, next) => {
    const key = req.headers["x-idempotency-key"] || req.body?.idempotencyKey;
    if (!key) return res.status(400).json({ ok: false, msg: "Idempotency key required for financial operations" });

    try {
        // Option NX locks it. If it exists, returns 0/null
        const acquired = await redisClient.setnx(`idempotency:${key}`, "LOCKED");
        if (!acquired) {
            // Already processing or completed.
            const cachedResponse = await redisClient.get(`idempotency:res:${key}`);
            if (cachedResponse) {
                logger.debug(`[Idempotency] Returning cached response for ${key}`);
                return res.status(200).json(JSON.parse(cachedResponse));
            }
            logger.warn(`[Idempotency] Request ${key} is currently processing, blocking duplicate.`);
            return res.status(409).json({ ok: false, msg: "Request is currently processing. Please wait." });
        }
        
        // 24-hour expiration for the lock
        await redisClient.expire(`idempotency:${key}`, 86400);

        // Hijack res.json to cache successful responses
        const originalJson = res.json;
        res.json = function(body) {
            // Only cache if successful (2XX)
            if (res.statusCode >= 200 && res.statusCode < 300) {
                redisClient.setex(`idempotency:res:${key}`, 86400, JSON.stringify(body))
                    .catch(e => logger.error(`Idempotency cache failure: ${e.message}`));
            } else {
                // If it failed cleanly, remove lock so it can be retried safely
                redisClient.del(`idempotency:${key}`)
                    .catch(e => logger.error(`Idempotency unlock failure: ${e.message}`));
            }
            // Execute actual write
            originalJson.call(this, body);
        };
        
        next();
    } catch (e) {
        logger.error(`[Idempotency] Middleware Error: ${e.message}`);
        next(e);
    }
};

module.exports = idempotencyGuard;
