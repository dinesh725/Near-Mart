const { Forbidden } = require("../utils/errors");

/**
 * Blocks suspended users from protected routes (orders, payments, wallet).
 * Must be placed AFTER authenticate middleware.
 */
const requireActive = (req, res, next) => {
    if (!req.user) return next();

    if (req.user.status === "suspended") {
        return next(new Forbidden("Account suspended. Contact support."));
    }

    next();
};

module.exports = requireActive;
