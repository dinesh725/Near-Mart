const config = require("../config");

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT = config.nodeEnv === "production" ? LOG_LEVELS.info : LOG_LEVELS.debug;

const SENSITIVE_KEYS = ["password", "token", "secret", "key", "authorization", "cookie"];

const redact = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    try {
        const copy = { ...obj };
        for (const k of Object.keys(copy)) {
            if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) {
                copy[k] = "[REDACTED]";
            } else if (typeof copy[k] === 'object' && copy[k] !== null) {
                // shallow 1-level deep redact to avoid circular structures
                const innerCopy = { ...copy[k] };
                let modified = false;
                for (const ik of Object.keys(innerCopy)) {
                    if (SENSITIVE_KEYS.some(sk => ik.toLowerCase().includes(sk))) {
                        innerCopy[ik] = "[REDACTED]";
                        modified = true;
                    }
                }
                if (modified) copy[k] = innerCopy;
            }
        }
        return copy;
    } catch (e) {
        return "[Un-serializable object]";
    }
};

const fmt = (level, msg, meta) => {
    const ts = new Date().toISOString();
    const base = `[${ts}] ${level.toUpperCase()}: ${msg}`;
    return meta ? `${base} ${JSON.stringify(redact(meta))}` : base;
};

module.exports = {
    error: (msg, meta) => LOG_LEVELS.error <= CURRENT && console.error(fmt("error", msg, meta)),
    warn: (msg, meta) => LOG_LEVELS.warn <= CURRENT && console.warn(fmt("warn", msg, meta)),
    info: (msg, meta) => LOG_LEVELS.info <= CURRENT && console.log(fmt("info", msg, meta)),
    debug: (msg, meta) => LOG_LEVELS.debug <= CURRENT && console.log(fmt("debug", msg, meta)),
};
