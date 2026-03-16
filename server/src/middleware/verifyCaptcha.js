const logger = require("../utils/logger");

/**
 * CAPTCHA verification middleware.
 * Validates a captchaToken from the request body against a CAPTCHA provider.
 *
 * Graceful degradation: if CAPTCHA_SECRET_KEY is not configured, the middleware
 * is skipped (logs a warning) so the system remains functional without CAPTCHA.
 *
 * Supports Google reCAPTCHA v3 and hCaptcha.
 */
const verifyCaptcha = async (req, res, next) => {
    const secretKey = process.env.CAPTCHA_SECRET_KEY;
    const provider = process.env.CAPTCHA_PROVIDER || "recaptcha"; // "recaptcha" or "hcaptcha"

    // Graceful degradation — skip if not configured
    if (!secretKey) {
        return next();
    }

    const { captchaToken } = req.body;
    if (!captchaToken) {
        return res.status(400).json({ ok: false, error: "CAPTCHA verification required." });
    }

    try {
        const verifyUrl = provider === "hcaptcha"
            ? "https://hcaptcha.com/siteverify"
            : "https://www.google.com/recaptcha/api/siteverify";

        const params = new URLSearchParams({
            secret: secretKey,
            response: captchaToken,
            remoteip: req.ip,
        });

        const response = await fetch(verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });

        const data = await response.json();

        if (!data.success) {
            logger.warn("CAPTCHA verification failed", { ip: req.ip, provider, errors: data["error-codes"] });
            return res.status(403).json({ ok: false, error: "CAPTCHA verification failed. Please try again." });
        }

        // For reCAPTCHA v3, enforce minimum score
        if (provider === "recaptcha" && data.score !== undefined && data.score < 0.5) {
            logger.warn("CAPTCHA score too low", { ip: req.ip, score: data.score });
            return res.status(403).json({ ok: false, error: "Suspicious activity detected. Please try again." });
        }

        next();
    } catch (err) {
        logger.error("CAPTCHA verification error", { error: err.message });
        // Fail open — don't block users if CAPTCHA service is down
        next();
    }
};

module.exports = verifyCaptcha;
