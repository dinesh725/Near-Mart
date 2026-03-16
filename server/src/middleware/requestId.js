const crypto = require("crypto");

/**
 * Assigns a unique correlation ID to every inbound request.
 * - Sets `req.id` for internal use (logging, error tracking)
 * - Sets `X-Request-Id` response header for client-side correlation
 */
const requestId = (req, res, next) => {
    const id = req.headers["x-request-id"] || crypto.randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
};

module.exports = requestId;
