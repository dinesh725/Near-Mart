const Order = require("../models/Order");
const logger = require("../utils/logger");

/**
 * Order Velocity Check — prevents automated order abuse.
 * Counts orders by the current user in the last 10 minutes.
 * If > 5 orders exist, rejects with HTTP 429.
 */
const orderVelocityCheck = async (req, res, next) => {
    try {
        if (!req.user) return next();

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentOrderCount = await Order.countDocuments({
            customerId: req.user._id,
            createdAt: { $gte: tenMinutesAgo },
        });

        if (recentOrderCount >= 5) {
            logger.warn("Order velocity limit hit", {
                userId: req.user._id.toString(),
                recentOrders: recentOrderCount,
                ip: req.ip,
            });
            return res.status(429).json({
                ok: false,
                error: "Too many orders placed in a short time. Please try again later.",
            });
        }

        next();
    } catch (err) {
        // Fail open — don't block checkout if velocity check errors
        logger.error("Order velocity check error (Fail-Open)", { 
            error: err.message,
            userId: req.user ? req.user._id.toString() : "anonymous",
            ip: req.ip,
            route: req.originalUrl
        });
        next();
    }
};

module.exports = orderVelocityCheck;
