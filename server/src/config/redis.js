const Redis = require("ioredis");
const logger = require("../utils/logger");
const config = require("./index");

const redisUrl = config.redisUrl || "redis://localhost:6379";

const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,

    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },

    reconnectOnError(err) {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
            return true;
        }
        return false;
    }
});

redisClient.on("connect", () => {
    logger.info("Redis connection established");
});

redisClient.on("ready", () => {
    logger.info("Redis ready to accept commands");
});

redisClient.on("error", (err) => {
    if (err.code !== "ECONNRESET") {
        logger.error("Redis error", { error: err.message });
    }
});

redisClient.on("close", () => {
    logger.warn("Redis connection closed");
});

redisClient.on("reconnecting", () => {
    logger.warn("Redis reconnecting...");
});

module.exports = redisClient;
