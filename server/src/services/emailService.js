const { Resend } = require("resend");
const config = require("../config");
const logger = require("../utils/logger");

class EmailService {
    constructor() {
        this.resend = config.resend.apiKey ? new Resend(config.resend.apiKey) : null;
        // Resend requires a verified domain. Use onboarding@resend.dev for testing.
        this.from = process.env.EMAIL_FROM || "onboarding@resend.dev";
    }

    getFrontendUrl() {
        return (config.corsOrigin || "http://localhost:3000").split(",")[0].trim();
    }

    async sendVerificationEmail(to, actionUrl, name) {
        if (!this.resend) {
            logger.warn(`[EmailService] RESEND_API_KEY not configured. Skipping verification email to ${to}. URL: ${actionUrl}`);
            return true;
        }

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #6366f1;">Welcome to NearMart, ${name}!</h2>
                <p>Please verify your email address to activate your account and start ordering.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify Email</a>
                </div>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666; font-size: 14px;">${actionUrl}</p>
                <p style="margin-top: 40px; font-size: 12px; color: #999;">If you didn't create an account, you can safely ignore this email.</p>
            </div>
        `;

        try {
            const { data, error } = await this.resend.emails.send({
                from: `NearMart <${this.from}>`,
                to: [to],
                subject: "Verify your Email — NearMart",
                html,
            });

            if (error) throw error;

            logger.info(`[EmailService] Verification email sent to ${to} (ID: ${data?.id})`);
            return true;
        } catch (error) {
            logger.error(`[EmailService] Failed to send email to ${to}:`, error);
            throw new Error(error.message || 'Failed to send email via Resend');
        }
    }

    async sendPasswordResetEmail(to, actionUrl, name) {
        if (!this.resend) {
            logger.warn(`[EmailService] RESEND_API_KEY not configured. Skipping reset email to ${to}. URL: ${actionUrl}`);
            return true;
        }

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #6366f1;">Reset Your Password, ${name || 'User'}</h2>
                <p>We received a request to reset your password for NearMart.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666; font-size: 14px;">${actionUrl}</p>
                <p style="margin-top: 40px; font-size: 12px; color: #999;">If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
        `;

        try {
            const { data, error } = await this.resend.emails.send({
                from: `NearMart <${this.from}>`,
                to: [to],
                subject: "Reset your Password — NearMart",
                html,
            });

            if (error) throw error;

            logger.info(`[EmailService] Password reset email sent to ${to} (ID: ${data?.id})`);
            return true;
        } catch (error) {
            logger.error(`[EmailService] Failed to send password reset to ${to}:`, error);
            throw new Error(error.message || 'Failed to send email via Resend');
        }
    }
}

module.exports = new EmailService();
