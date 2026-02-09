const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const db = require('../services/db');
const { encrypt, decrypt } = require('../services/encryption');
const { authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { ValidationError, AuthError } = require('../errors/AppError');

const logger = createLogger('2FA');

const RECOVERY_CODE_COUNT = 8;
const APP_NAME = 'IndusWealth';

/**
 * Generate recovery codes — 8 random 8-character codes.
 * @returns {{ codes: string[], hashes: string[] }} The raw codes and their SHA-256 hashes
 */
const generateRecoveryCodes = () => {
    const codes = [];
    const hashes = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const code = crypto.randomBytes(4).toString('hex'); // 8 hex chars
        codes.push(code);
        hashes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }
    return { codes, hashes };
};

// All 2FA routes require authentication
router.use(authenticateToken);

// GET /2fa/status
// Check if 2FA is enabled for the current user
router.get('/status', async (req, res, next) => {
    try {
        const record = await db.getTotpSecret(req.user.id);
        res.json({
            success: true,
            enabled: !!(record && record.is_verified),
            requestId: req.requestId,
        });
    } catch (error) {
        next(error);
    }
});

// POST /2fa/setup
// Generate a TOTP secret and return a QR code data URL
router.post('/setup', async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('2FA setup initiated', ctx);

    try {
        // Check if already enabled
        const existing = await db.getTotpSecret(req.user.id);
        if (existing && existing.is_verified) {
            throw new ValidationError('Two-factor authentication is already enabled. Disable it first to set up again.');
        }

        // Generate secret
        const secret = authenticator.generateSecret();

        // Build otpauth URI
        const otpauthUrl = authenticator.keyuri(req.user.email, APP_NAME, secret);

        // Generate QR code as data URL
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        // Store encrypted secret (unverified until confirmed)
        const encryptedSecret = encrypt(secret);
        await db.storeTotpSecret(req.user.id, encryptedSecret);

        logger.info('2FA secret generated', ctx);

        res.json({
            success: true,
            secret, // for manual entry
            qrCode: qrCodeDataUrl,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('2FA setup failed', { ...ctx, error });
        next(error);
    }
});

// POST /2fa/verify
// Verify a TOTP code to complete 2FA setup. Generates recovery codes.
router.post('/verify', async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('2FA verification attempt', ctx);

    try {
        const { code } = req.body;
        if (!code) {
            throw new ValidationError('Verification code is required', { field: 'code' });
        }

        const record = await db.getTotpSecret(req.user.id);
        if (!record) {
            throw new ValidationError('No 2FA setup in progress. Call POST /2fa/setup first.');
        }

        if (record.is_verified) {
            throw new ValidationError('Two-factor authentication is already verified.');
        }

        // Decrypt and verify
        const secret = decrypt(record.encrypted_secret);
        const isValid = authenticator.check(code, secret);

        if (!isValid) {
            logger.warn('2FA verification failed — invalid code', ctx);
            throw new AuthError('Invalid verification code. Please try again.', 'INVALID_2FA');
        }

        // Mark as verified
        await db.verifyTotpSetup(req.user.id);

        // Generate recovery codes
        const { codes, hashes } = generateRecoveryCodes();
        await db.storeRecoveryCodes(req.user.id, hashes);

        logger.info('2FA enabled successfully', ctx);

        res.json({
            success: true,
            message: 'Two-factor authentication enabled successfully',
            recoveryCodes: codes, // Show these once to the user
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('2FA verification failed', { ...ctx, error });
        next(error);
    }
});

// POST /2fa/disable
// Disable 2FA (requires password confirmation)
router.post('/disable', async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('2FA disable attempt', ctx);

    try {
        const { password } = req.body;
        if (!password) {
            throw new ValidationError('Password is required to disable 2FA', { field: 'password' });
        }

        // Verify password
        const user = await db.getUserByEmail(req.user.email);
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            logger.warn('2FA disable failed — invalid password', ctx);
            throw new AuthError('Incorrect password', 'INVALID_PASSWORD');
        }

        // Delete TOTP secret and recovery codes
        await db.deleteTotpSecret(req.user.id);

        logger.info('2FA disabled successfully', ctx);

        res.json({
            success: true,
            message: 'Two-factor authentication has been disabled',
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('2FA disable failed', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
