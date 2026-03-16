const logger = require("../utils/logger");

/**
 * In-memory IP abuse tracker.
 * Tracks suspicious activity patterns per IP and temporarily blocks repeat offenders.
 *
 * Tracked events: auth failures, validation errors, rate limit hits.
 * Threshold: 50 suspicious events in 10 minutes → 30 min block.
 */
const ipTracker = new Map();
const WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const BLOCK_MS = 30 * 60 * 1000;   // 30 minutes
const THRESHOLD = 50;

function cleanupEntry(entry) {
    const now = Date.now();
    entry.events = entry.events.filter(ts => now - ts < WINDOW_MS);
}

/**
 * Record a suspicious event for an IP address.
 * Call this from error handlers or auth failure paths.
 */
function recordSuspiciousEvent(ip, reason) {
    if (!ip) return;

    const now = Date.now();
    let entry = ipTracker.get(ip);

    if (!entry) {
        entry = { events: [], blockedUntil: null };
        ipTracker.set(ip, entry);
    }

    cleanupEntry(entry);
    entry.events.push(now);

    if (entry.events.length >= THRESHOLD && !entry.blockedUntil) {
        entry.blockedUntil = now + BLOCK_MS;
        logger.warn("IP blocked due to abuse", { ip, reason, eventCount: entry.events.length });
    }
}

/**
 * Middleware that checks if an IP is temporarily blocked.
 */
const abuseDetector = (req, res, next) => {
    const ip = req.ip;
    const entry = ipTracker.get(ip);

    if (entry && entry.blockedUntil) {
        if (Date.now() < entry.blockedUntil) {
            logger.warn("Request blocked — IP abuse detected", { ip, endpoint: req.originalUrl });
            return res.status(429).json({
                ok: false,
                error: "Your IP has been temporarily blocked due to suspicious activity.",
            });
        }
        // Block expired — clean up
        entry.blockedUntil = null;
        entry.events = [];
    }

    next();
};

// Periodic cleanup to prevent memory leaks (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipTracker.entries()) {
        cleanupEntry(entry);
        if (entry.events.length === 0 && (!entry.blockedUntil || now > entry.blockedUntil)) {
            ipTracker.delete(ip);
        }
    }
}, 5 * 60 * 1000);

module.exports = { abuseDetector, recordSuspiciousEvent };
