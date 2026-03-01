const nodemailer = require("nodemailer");
const config = require("../config");
const logger = require("../utils/logger");

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.port === 465, // true for 465, false for other ports
            auth: {
                user: config.smtp.user,
                pass: config.smtp.pass,
            },
            connectionTimeout: 10000, // 10s connection timeout
            greetingTimeout: 10000,   // 10s greeting timeout
            socketTimeout: 15000,     // 15s socket timeout
            tls: { rejectUnauthorized: false }, // allow self-signed certs on cloud
        });

        this.from = process.env.EMAIL_FROM || "noreply@nearmart.local";
    }

    async sendVerificationEmail(to, token, name) {
        if (!config.smtp.host || config.smtp.host === "smtp.mailtrap.io") {
            logger.warn(`[EmailService] SMTP not configured. Skipping email to ${to}. Token: ${token}`);
            return true;
        }

        const verificationUrl = `${config.corsOrigin}/auth/verify-email?token=${token}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #6366f1;">Welcome to NearMart, ${name}!</h2>
                <p>Please verify your email address to activate your account and start ordering.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify Email</a>
                </div>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666; font-size: 14px;">${verificationUrl}</p>
                <p style="margin-top: 40px; font-size: 12px; color: #999;">If you didn't create an account, you can safely ignore this email.</p>
            </div>
        `;

        try {
            await this.transporter.sendMail({
                from: `"NearMart" <${this.from}>`,
                to,
                subject: "Verify your Email — NearMart",
                html,
            });
            logger.info(`[EmailService] Verification email sent to ${to}`);
            return true;
        } catch (error) {
            logger.error(`[EmailService] Failed to send email to ${to}:`, error);
            throw new Error("Failed to send verification email");
        }
    }
}

module.exports = new EmailService();
