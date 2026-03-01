const config = require("../config");

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT = config.nodeEnv === "production" ? LOG_LEVELS.info : LOG_LEVELS.debug;

const fmt = (level, msg, meta) => {
    const ts = new Date().toISOString();
    const base = `[${ts}] ${level.toUpperCase()}: ${msg}`;
    return meta ? `${base} ${JSON.stringify(meta)}` : base;
};

module.exports = {
    error: (msg, meta) => LOG_LEVELS.error <= CURRENT && console.error(fmt("error", msg, meta)),
    warn: (msg, meta) => LOG_LEVELS.warn <= CURRENT && console.warn(fmt("warn", msg, meta)),
    info: (msg, meta) => LOG_LEVELS.info <= CURRENT && console.log(fmt("info", msg, meta)),
    debug: (msg, meta) => LOG_LEVELS.debug <= CURRENT && console.log(fmt("debug", msg, meta)),
};
