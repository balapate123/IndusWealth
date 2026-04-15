const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../services/db');
const { generateAccessToken, generateRefreshToken, rotateRefreshToken, revokeAllUserTokens, revokeSingleToken, authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { ValidationError, AuthError, NotFoundError } = require('../errors/AppError');
const { successResponse } = require('../utils/responseHelper');
const { validatePassword, getPasswordStrength } = require('../utils/passwordValidator');
const { checkAccountLock, recordFailedAttempt, recordSuccessfulLogin } = require('../utils/loginProtection');
const { encrypt, decrypt } = require('../services/encryption');
const emailService = require('../services/email');

const logger = createLogger('USERS');

// Generate a 6-digit numeric code for email verification / password reset
const generateSixDigitCode = () => {
    return crypto.randomInt(100000, 999999).toString();
};

// POST /users/signup
// Create a new user and return JWT token
router.post('/signup', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    const email = req.body.email?.toLowerCase();
    logger.info('User signup attempt', { ...ctx, email });

    try {
        const { password, name } = req.body;

        // Validation
        if (!email || !password) {
            throw new ValidationError('Email and password are required', {
                fields: ['email', 'password']
            });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ValidationError('Invalid email format', { field: 'email' });
        }

        // Password strength validation
        const passwordCheck = validatePassword(password);
        if (!passwordCheck.valid) {
            throw new ValidationError(passwordCheck.errors[0], { field: 'password', errors: passwordCheck.errors });
        }

        // Check if user already exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            logger.warn('Signup failed - email already exists', { ...ctx, email });
            throw new ValidationError('User with this email already exists', { field: 'email' });
        }

        // Hash password with strong salt rounds
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const user = await db.createUser(email, passwordHash, name || 'User');

        // Generate email verification code
        const verificationCode = generateSixDigitCode();
        const codeHash = crypto.createHash('sha256').update(verificationCode).digest('hex');
        const codeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await db.setEmailVerificationToken(user.id, codeHash, codeExpiry);

        // Send verification email (non-blocking — don't fail signup if email fails)
        emailService.sendVerificationEmail(email, name || 'User', verificationCode)
            .catch(err => logger.error('Failed to send verification email', { ...ctx, error: err }));

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const { token: refreshToken, hash: refreshHash, familyId } = generateRefreshToken();

        // Store refresh token
        const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await db.storeRefreshToken(refreshHash, user.id, familyId, refreshExpiry, req.ip);

        logger.info('User created successfully', { ...ctx, userId: user.id, email });

        res.status(201).json({
            success: true,
            message: 'Account created successfully. Please verify your email.',
            token: accessToken, // backward compat
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: false,
                emailVerified: false,
            },
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Signup failed', { ...ctx, email, error });
        next(error);
    }
});

// POST /users/login
// Authenticate user and return JWT + refresh token
router.post('/login', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    const email = req.body.email?.toLowerCase();
    logger.info('User login attempt', { ...ctx, email });

    try {
        const { password, twoFactorCode, recoveryCode } = req.body;

        if (!email || !password) {
            throw new ValidationError('Email and password are required', {
                fields: ['email', 'password']
            });
        }

        // Check account lockout
        const lockStatus = await checkAccountLock(email);
        if (lockStatus.locked) {
            logger.warn('Login blocked - account locked', { ...ctx, email });
            throw new AuthError(
                `Account locked. Try again in ${lockStatus.remainingMinutes} minute(s).`,
                'ACCOUNT_LOCKED'
            );
        }

        // Find user (case-insensitive email)
        const user = await db.getUserByEmail(email);
        if (!user) {
            await recordFailedAttempt(email, req.ip, req.headers['user-agent'], 'USER_NOT_FOUND');
            logger.warn('Login failed - user not found', { ...ctx, email });
            throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            await recordFailedAttempt(email, req.ip, req.headers['user-agent'], 'INVALID_PASSWORD');
            logger.warn('Login failed - invalid password', { ...ctx, email });
            throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
        }

        // Check 2FA if enabled
        const totpRecord = await db.getTotpSecret(user.id);
        if (totpRecord && totpRecord.is_verified) {
            // 2FA is enabled
            if (!twoFactorCode && !recoveryCode) {
                // No code provided — tell client 2FA is required
                return res.json({
                    success: false,
                    code: '2FA_REQUIRED',
                    message: 'Two-factor authentication code required',
                    requestId: req.requestId,
                });
            }

            if (recoveryCode) {
                // Try recovery code
                const { createHash } = require('crypto');
                const codeHash = createHash('sha256').update(recoveryCode.trim()).digest('hex');
                const used = await db.useRecoveryCode(user.id, codeHash);
                if (!used) {
                    await recordFailedAttempt(email, req.ip, req.headers['user-agent'], 'INVALID_RECOVERY_CODE');
                    throw new AuthError('Invalid recovery code', 'INVALID_2FA');
                }
            } else {
                // Verify TOTP code
                const { authenticator } = require('otplib');
                const decryptedSecret = decrypt(totpRecord.encrypted_secret);
                const isValidCode = authenticator.check(twoFactorCode, decryptedSecret);
                if (!isValidCode) {
                    await recordFailedAttempt(email, req.ip, req.headers['user-agent'], 'INVALID_2FA_CODE');
                    throw new AuthError('Invalid two-factor code', 'INVALID_2FA');
                }
            }
        }

        // Successful login — record and reset lockout
        await recordSuccessfulLogin(email, req.ip, req.headers['user-agent']);

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const { token: refreshToken, hash: refreshHash, familyId } = generateRefreshToken();

        // Store refresh token
        const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await db.storeRefreshToken(refreshHash, user.id, familyId, refreshExpiry, req.ip);

        logger.info('User logged in successfully', { ...ctx, userId: user.id, email });

        res.json({
            success: true,
            message: 'Login successful',
            token: accessToken, // backward compat
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: !!user.plaid_access_token,
            },
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Login failed', { ...ctx, email, error });
        next(error);
    }
});

// GET /users/me
// Get current authenticated user info (requires valid JWT)
router.get('/me', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.debug('Fetching user profile', ctx);

    try {
        // User is already verified by authenticateToken middleware
        const user = await db.getUserById(req.user.id);

        if (!user) {
            throw new NotFoundError('User');
        }

        logger.debug('User profile fetched', ctx);

        successResponse(res, {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                dateOfBirth: user.date_of_birth,
                hasPlaidLinked: !!user.plaid_access_token,
                emailVerified: !!user.email_verified,
                createdAt: user.created_at,
            }
        }, { timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Failed to fetch user profile', { ...ctx, error });
        next(error);
    }
});

// POST /users/logout
// Revoke refresh token on logout
router.post('/logout', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('User logged out', { ...ctx, email: req.user.email });

    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            await revokeSingleToken(refreshToken);
        }
    } catch (error) {
        // Log but don't fail logout if token revocation fails
        logger.warn('Failed to revoke refresh token during logout', { ...ctx, error: error.message });
    }

    res.json({
        success: true,
        message: 'Logged out successfully',
        requestId: req.requestId
    });
});

// PUT /users/profile
// Update user profile (name and/or date of birth)
router.put('/profile', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Updating user profile', ctx);

    try {
        const { name, dateOfBirth } = req.body;
        const userId = req.user.id;

        // At least one field must be provided
        if ((!name || name.trim().length === 0) && !dateOfBirth) {
            throw new ValidationError('At least name or date of birth is required', {
                fields: ['name', 'dateOfBirth']
            });
        }

        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name && name.trim().length > 0) {
            updates.push(`name = $${paramIndex}`);
            values.push(name.trim());
            paramIndex++;
        }

        if (dateOfBirth) {
            // Validate date format (YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(dateOfBirth)) {
                throw new ValidationError('Invalid date format. Use YYYY-MM-DD', {
                    field: 'dateOfBirth'
                });
            }
            // Validate it's a valid date
            const parsedDate = new Date(dateOfBirth);
            if (isNaN(parsedDate.getTime())) {
                throw new ValidationError('Invalid date', { field: 'dateOfBirth' });
            }
            // Validate reasonable age (between 13 and 120 years old)
            const today = new Date();
            const age = today.getFullYear() - parsedDate.getFullYear();
            if (age < 13 || age > 120) {
                throw new ValidationError('Please enter a valid date of birth', {
                    field: 'dateOfBirth'
                });
            }

            updates.push(`date_of_birth = $${paramIndex}`);
            values.push(dateOfBirth);
            paramIndex++;
        }

        updates.push('updated_at = NOW()');
        values.push(userId);

        // Update user in database
        await db.pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        logger.info('User profile updated', ctx);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Failed to update profile', { ...ctx, error });
        next(error);
    }
});

// PUT /users/password
// Change password
router.put('/password', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Password change attempt', ctx);

    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            throw new ValidationError('Current and new password are required', {
                fields: ['currentPassword', 'newPassword']
            });
        }

        const passwordCheck = validatePassword(newPassword);
        if (!passwordCheck.valid) {
            throw new ValidationError(passwordCheck.errors[0], {
                field: 'newPassword',
                errors: passwordCheck.errors
            });
        }

        // Get user with password hash
        const user = await db.getUserByEmail(req.user.email);

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
            logger.warn('Password change failed - invalid current password', ctx);
            throw new AuthError('Current password is incorrect', 'INVALID_PASSWORD');
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password and password_changed_at
        await db.pool.query(
            'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
            [newPasswordHash, userId]
        );

        // Revoke all refresh tokens for this user
        await revokeAllUserTokens(userId);

        // Issue new token pair
        const accessToken = generateAccessToken({ id: userId, email: req.user.email, name: req.user.name });
        const { token: refreshToken, hash: refreshHash, familyId } = generateRefreshToken();
        const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.storeRefreshToken(refreshHash, userId, familyId, refreshExpiry, req.ip);

        logger.info('Password changed successfully', ctx);

        res.json({
            success: true,
            message: 'Password changed successfully',
            token: accessToken,
            accessToken,
            refreshToken,
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Failed to change password', { ...ctx, error });
        next(error);
    }
});

// DELETE /users/account
// Permanently delete user account and all associated data
router.delete('/account', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Account deletion requested', ctx);

    try {
        const { password } = req.body;
        const userId = req.user.id;

        if (!password) {
            throw new ValidationError('Password is required to delete account', {
                field: 'password'
            });
        }

        // Get user with password hash
        const user = await db.getUserByEmail(req.user.email);

        if (!user) {
            throw new NotFoundError('User');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            logger.warn('Account deletion failed - invalid password', ctx);
            throw new AuthError('Incorrect password', 'INVALID_PASSWORD');
        }

        // Delete user - related data (accounts, transactions, sync_log) will be
        // automatically deleted via ON DELETE CASCADE foreign key constraints
        await db.pool.query('DELETE FROM users WHERE id = $1', [userId]);

        logger.info('Account deleted successfully', ctx);

        res.json({
            success: true,
            message: 'Account deleted successfully',
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Failed to delete account', { ...ctx, error });
        next(error);
    }
});

// POST /users/refresh
// Exchange a refresh token for a new access + refresh token pair
router.post('/refresh', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    logger.info('Token refresh attempt', ctx);

    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            throw new ValidationError('Refresh token is required', { field: 'refreshToken' });
        }

        const result = await rotateRefreshToken(refreshToken, req.ip);

        logger.info('Token refreshed successfully', { ...ctx, userId: result.userId });

        res.json({
            success: true,
            token: result.accessToken, // backward compat
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            requestId: req.requestId,
        });
    } catch (error) {
        logger.error('Token refresh failed', { ...ctx, error });
        next(error);
    }
});

// POST /users/password-strength
// Check password strength (public endpoint for mobile UI)
router.post('/password-strength', (req, res) => {
    const { password } = req.body;
    const strength = getPasswordStrength(password || '');
    res.json({ success: true, ...strength });
});

// POST /users/verify-email
// Verify email address with a 6-digit code
router.post('/verify-email', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    logger.info('Email verification attempt', ctx);

    try {
        const { code } = req.body;
        if (!code) {
            throw new ValidationError('Verification code is required', { field: 'code' });
        }

        const codeHash = crypto.createHash('sha256').update(code.toString().trim()).digest('hex');
        const result = await db.verifyEmail(codeHash);

        if (!result) {
            throw new AuthError('Invalid or expired verification code', 'INVALID_TOKEN');
        }

        // Send welcome email (non-blocking)
        emailService.sendWelcomeEmail(result.email, result.name)
            .catch(err => logger.error('Failed to send welcome email', { ...ctx, error: err }));

        logger.info('Email verified successfully', { ...ctx, userId: result.id });

        successResponse(res, { message: 'Email verified successfully' });
    } catch (error) {
        logger.error('Email verification failed', { ...ctx, error });
        next(error);
    }
});

// POST /users/resend-verification
// Resend email verification code (requires auth)
router.post('/resend-verification', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Resend verification email requested', ctx);

    try {
        const user = await db.getUserById(req.user.id);

        if (!user) {
            throw new NotFoundError('User');
        }

        if (user.email_verified) {
            throw new ValidationError('Email is already verified');
        }

        // Generate new code
        const verificationCode = generateSixDigitCode();
        const codeHash = crypto.createHash('sha256').update(verificationCode).digest('hex');
        const codeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await db.setEmailVerificationToken(user.id, codeHash, codeExpiry);

        // Send verification email
        await emailService.sendVerificationEmail(user.email, user.name, verificationCode);

        logger.info('Verification email resent', ctx);

        successResponse(res, { message: 'Verification email sent' });
    } catch (error) {
        logger.error('Failed to resend verification email', { ...ctx, error });
        next(error);
    }
});

// POST /users/forgot-password
// Request a password reset code (public, rate-limited)
router.post('/forgot-password', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    const email = req.body.email?.toLowerCase()?.trim();
    logger.info('Password reset requested', { ...ctx, email });

    try {
        if (!email) {
            throw new ValidationError('Email is required', { field: 'email' });
        }

        const user = await db.getUserByEmail(email);

        // Always return success to prevent email enumeration
        if (user) {
            const resetCode = generateSixDigitCode();
            const codeHash = crypto.createHash('sha256').update(resetCode).digest('hex');
            const codeExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await db.setPasswordResetToken(user.id, codeHash, codeExpiry);

            // Send reset email (non-blocking)
            emailService.sendPasswordResetEmail(email, user.name, resetCode)
                .catch(err => logger.error('Failed to send reset email', { ...ctx, error: err }));
        }

        logger.info('Password reset response sent (anti-enumeration)', ctx);

        successResponse(res, {
            message: 'If an account exists with this email, a reset code has been sent.'
        });
    } catch (error) {
        logger.error('Password reset request failed', { ...ctx, error });
        next(error);
    }
});

// POST /users/reset-password
// Reset password with a valid reset code
router.post('/reset-password', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    logger.info('Password reset attempt', ctx);

    try {
        const { code, newPassword } = req.body;

        if (!code || !newPassword) {
            throw new ValidationError('Reset code and new password are required', {
                fields: ['code', 'newPassword']
            });
        }

        // Validate password strength
        const passwordCheck = validatePassword(newPassword);
        if (!passwordCheck.valid) {
            throw new ValidationError(passwordCheck.errors[0], {
                field: 'newPassword',
                errors: passwordCheck.errors
            });
        }

        const codeHash = crypto.createHash('sha256').update(code.toString().trim()).digest('hex');
        const user = await db.getPasswordResetUser(codeHash);

        if (!user) {
            throw new AuthError('Invalid or expired reset code', 'INVALID_TOKEN');
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await db.pool.query(
            'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
            [newPasswordHash, user.id]
        );

        // Clear reset token
        await db.clearPasswordResetToken(user.id);

        // Revoke all existing sessions
        await revokeAllUserTokens(user.id);

        logger.info('Password reset successfully', { ...ctx, userId: user.id });

        successResponse(res, { message: 'Password reset successfully. Please log in with your new password.' });
    } catch (error) {
        logger.error('Password reset failed', { ...ctx, error });
        next(error);
    }
});

module.exports = router;
