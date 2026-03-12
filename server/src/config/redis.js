const Redis = require("ioredis");
const logger = require("../utils/logger");
const config = require("./index");

const redisUrl = config.redisUrl || "redis://localhost:6379";

const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
        // Retry connection roughly every second
        return Math.min(times * 50, 2000);
    }
});

redisClient.on("connect", () => {
    logger.info("✅ Redis connected successfully");
});

redisClient.on("error", (err) => {
    logger.error(`⚠️ Redis error: ${err.message}`);
});

module.exports = redisClient;
