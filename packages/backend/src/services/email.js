const { createLogger } = require('./logger');

const logger = createLogger('EMAIL');

// HTML-escape user input to prevent XSS/phishing in emails
const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

// Email configuration
// The from-domain (induswealth.app) must be verified in the Resend dashboard
// (DNS: SPF + DKIM records) or every send is rejected with a 403
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'IndusWealth <hello@induswealth.app>';
const APP_NAME = 'IndusWealth';

let resend = null;

// Initialize Resend client (lazy)
const getClient = () => {
    if (!resend && RESEND_API_KEY) {
        const { Resend } = require('resend');
        resend = new Resend(RESEND_API_KEY);
    }
    return resend;
};

/**
 * Send an email via Resend. In dev mode (no API key), logs to console.
 */
const sendEmail = async ({ to, subject, html }) => {
    const client = getClient();

    if (!client) {
        // Dev mode — log email to console
        logger.info('📧 DEV MODE — Email not sent (no RESEND_API_KEY)', {
            to, subject, preview: html.substring(0, 200) + '...'
        });
        return { id: 'dev-mode', to, subject };
    }

    try {
        const result = await client.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
        });
        logger.info('Email sent successfully', { to, subject, id: result.data?.id });
        return result.data;
    } catch (error) {
        logger.error('Failed to send email', { to, subject, error });
        throw error;
    }
};

// ============ HTML EMAIL TEMPLATE ============

const emailTemplate = (title, bodyContent) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#000000; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000; padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1E293B; border-radius:16px; border:1px solid rgba(212,175,55,0.3); overflow:hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #D4AF37, #C5A028); padding:30px; text-align:center;">
                            <h1 style="margin:0; color:#1E293B; font-size:28px; font-weight:700;">${APP_NAME}</h1>
                            <p style="margin:4px 0 0; color:rgba(30,41,59,0.7); font-size:11px; letter-spacing:3px;">M O D E R N &nbsp; T R U S T</p>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding:40px 30px;">
                            ${bodyContent}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding:20px 30px; border-top:1px solid #334155; text-align:center;">
                            <p style="margin:0; color:#64748B; font-size:12px;">
                                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                            </p>
                            <p style="margin:8px 0 0; color:#475569; font-size:11px;">
                                This is an automated message. Please do not reply directly.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

// ============ EMAIL FUNCTIONS ============

/**
 * Send email verification email with a 6-digit code
 */
const sendVerificationEmail = async (to, name, code) => {
    const html = emailTemplate('Verify Your Email', `
        <h2 style="margin:0 0 16px; color:#FFFFFF; font-size:22px;">Verify Your Email</h2>
        <p style="color:#94A3B8; font-size:15px; line-height:1.6; margin:0 0 24px;">
            Hi ${escapeHtml(name) || 'there'},<br><br>
            Welcome to ${APP_NAME}! Please use the code below to verify your email address.
        </p>
        <div style="background-color:#0F172A; border:2px solid #D4AF37; border-radius:12px; padding:24px; text-align:center; margin:0 0 24px;">
            <p style="margin:0 0 8px; color:#94A3B8; font-size:13px;">Your verification code</p>
            <p style="margin:0; color:#D4AF37; font-size:36px; font-weight:700; letter-spacing:8px;">${code}</p>
        </div>
        <p style="color:#64748B; font-size:13px; margin:0;">
            This code expires in <strong style="color:#FFFFFF;">24 hours</strong>. If you didn't create an account, you can safely ignore this email.
        </p>
    `);

    return sendEmail({ to, subject: `${APP_NAME} — Verify Your Email`, html });
};

/**
 * Send password reset email with a 6-digit code
 */
const sendPasswordResetEmail = async (to, name, code) => {
    const html = emailTemplate('Reset Your Password', `
        <h2 style="margin:0 0 16px; color:#FFFFFF; font-size:22px;">Reset Your Password</h2>
        <p style="color:#94A3B8; font-size:15px; line-height:1.6; margin:0 0 24px;">
            Hi ${escapeHtml(name) || 'there'},<br><br>
            We received a request to reset your password. Use the code below to set a new one.
        </p>
        <div style="background-color:#0F172A; border:2px solid #D4AF37; border-radius:12px; padding:24px; text-align:center; margin:0 0 24px;">
            <p style="margin:0 0 8px; color:#94A3B8; font-size:13px;">Your reset code</p>
            <p style="margin:0; color:#D4AF37; font-size:36px; font-weight:700; letter-spacing:8px;">${code}</p>
        </div>
        <p style="color:#64748B; font-size:13px; margin:0 0 16px;">
            This code expires in <strong style="color:#FFFFFF;">1 hour</strong>. If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color:#EF4444; font-size:13px; margin:0;">
            If you didn't make this request, we recommend changing your password immediately.
        </p>
    `);

    return sendEmail({ to, subject: `${APP_NAME} — Reset Your Password`, html });
};

/**
 * Send welcome email after verification
 */
const sendWelcomeEmail = async (to, name) => {
    const html = emailTemplate('Welcome to IndusWealth', `
        <h2 style="margin:0 0 16px; color:#FFFFFF; font-size:22px;">Welcome Aboard!</h2>
        <p style="color:#94A3B8; font-size:15px; line-height:1.6; margin:0 0 24px;">
            Hi ${escapeHtml(name) || 'there'},<br><br>
            Your email has been verified and your ${APP_NAME} account is ready to go!
        </p>
        <div style="background-color:#0F172A; border-radius:12px; padding:24px; margin:0 0 24px;">
            <h3 style="margin:0 0 16px; color:#D4AF37; font-size:16px;">Get Started</h3>
            <ul style="margin:0; padding:0 0 0 20px; color:#94A3B8; font-size:14px; line-height:2;">
                <li>Connect your bank account securely via Plaid</li>
                <li>View your spending insights powered by AI</li>
                <li>Track and attack your debt with our tools</li>
                <li>Enable two-factor authentication for extra security</li>
            </ul>
        </div>
        <p style="color:#64748B; font-size:13px; margin:0;">
            Questions? Reach us at <a href="mailto:hello@induswealth.app" style="color:#D4AF37;">hello@induswealth.app</a>
        </p>
    `);

    return sendEmail({ to, subject: `Welcome to ${APP_NAME}!`, html });
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail,
};
