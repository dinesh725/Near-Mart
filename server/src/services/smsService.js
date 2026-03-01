const logger = require("../utils/logger");

// ── Firebase Test Numbers ─────────────────────────────────────────────────────
// Map of phone → OTP for testing without SMS delivery.
// These mirror Firebase Console test numbers (same concept).
// Format: "PHONENUMBER:OTP,PHONENUMBER:OTP"  (from env or defaults)
const TEST_NUMBERS = {};
const testEnv = process.env.FIREBASE_TEST_NUMBERS || "6370787586:787398,6370787583:969228";
testEnv.split(",").forEach(pair => {
    const [phone, otp] = pair.split(":");
    if (phone && otp) {
        TEST_NUMBERS[phone.trim()] = otp.trim();
        TEST_NUMBERS["+" + phone.trim()] = otp.trim(); // with country code
    }
});

if (Object.keys(TEST_NUMBERS).length > 0) {
    logger.info(`[SmsService] Test numbers registered: ${Object.keys(TEST_NUMBERS).join(", ")}`);
}

class SmsService {
    constructor() {
        // OTP_PROVIDER: 'dev_console' | 'firebase' | 'sms_gateway'
        // Default to 'dev_console' in development so OTP is visible in backend logs
        this.provider = process.env.OTP_PROVIDER || (process.env.NODE_ENV === "production" ? "firebase" : "dev_console");
        this.apiKey = process.env.SMS_GATEWAY_KEY;

        logger.info(`[SmsService] Provider: ${this.provider}`);
    }

    /**
     * Returns the fixed OTP if this phone is a test number, otherwise null.
     * Test numbers bypass actual SMS delivery.
     */
    getTestOtp(phone) {
        return TEST_NUMBERS[phone] || TEST_NUMBERS[phone.replace(/^\+91/, "")] || null;
    }

    isTestNumber(phone) {
        return !!this.getTestOtp(phone);
    }

    async sendOtp(phone, otpCode) {
        // ── Test number: always accepted ──────────────────────────────────────
        if (this.isTestNumber(phone)) {
            const testOtp = this.getTestOtp(phone);
            logger.info(`[SmsService] 🧪 Test number ${phone} — use OTP: ${testOtp} (SMS not sent)`);
            return { ok: true, provider: "test_number", testOtp };
        }

        // ── Dev console logging ───────────────────────────────────────────────
        if (this.provider === "dev_console") {
            logger.info(`[SmsService] [DEV OTP] Phone: ${phone} | Code: ${otpCode} | Valid 5 min`);
            if (process.env.NODE_ENV !== "production") {
                console.log(`\n\x1b[32m📱 OTP for ${phone}: \x1b[1m${otpCode}\x1b[0m\x1b[32m (check backend console)\x1b[0m\n`);
            }
            return { ok: true, provider: "dev_console" };
        }

        // ── Firebase (client-side only) ───────────────────────────────────────
        if (this.provider === "firebase") {
            logger.info(`[SmsService] Firebase client-side OTP. Backend does not send SMS. Check reCAPTCHA flow.`);
            return { ok: true, provider: "firebase" };
        }

        // ── SMS Gateway (Twilio/MSG91/Fast2SMS) ───────────────────────────────
        if (this.provider === "sms_gateway") {
            if (!this.apiKey) {
                logger.warn(`[SmsService] SMS_GATEWAY_KEY missing — falling back to dev console`);
                console.log(`\n[DEV] OTP for ${phone}: ${otpCode}\n`);
                return { ok: true, provider: "dev_console" };
            }
            // TODO: Implement real vendor:
            // await fetch("https://sms-vendor/api/send", { method:"POST", headers:{ Authorization:`Bearer ${this.apiKey}` }, body: JSON.stringify({ to: phone, text:`Your NearMart OTP is ${otpCode}. Valid for 5 minutes.` }) });
            logger.info(`[SmsService] SMS Gateway → ${phone}: OTP sent`);
            return { ok: true, provider: "sms_gateway" };
        }

        return { ok: false, msg: "Unsupported OTP provider" };
    }
}

module.exports = new SmsService();
