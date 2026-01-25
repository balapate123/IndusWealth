const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../services/db');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { createLogger } = require('../services/logger');
const { ValidationError, AuthError, NotFoundError } = require('../errors/AppError');
const { successResponse } = require('../utils/responseHelper');

const logger = createLogger('USERS');

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
        if (password.length < 6) {
            throw new ValidationError('Password must be at least 6 characters', { field: 'password' });
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

        // Generate JWT token
        const token = generateToken(user);

        logger.info('User created successfully', { ...ctx, userId: user.id, email });

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: false,
            },
            requestId: req.requestId
        });
    } catch (error) {
        logger.error('Signup failed', { ...ctx, email, error });
        next(error);
    }
});

// POST /users/login
// Authenticate user and return JWT token
router.post('/login', async (req, res, next) => {
    const ctx = { requestId: req.requestId };
    const email = req.body.email?.toLowerCase();
    logger.info('User login attempt', { ...ctx, email });

    try {
        const { password } = req.body;

        if (!email || !password) {
            throw new ValidationError('Email and password are required', {
                fields: ['email', 'password']
            });
        }

        // Find user (case-insensitive email)
        const user = await db.getUserByEmail(email);
        if (!user) {
            logger.warn('Login failed - user not found', { ...ctx, email });
            throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            logger.warn('Login failed - invalid password', { ...ctx, email });
            throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
        }

        // Generate JWT token
        const token = generateToken(user);

        logger.info('User logged in successfully', { ...ctx, userId: user.id, email });

        res.json({
            success: true,
            message: 'Login successful',
            token,
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
                createdAt: user.created_at,
            }
        }, { timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Failed to fetch user profile', { ...ctx, error });
        next(error);
    }
});

// POST /users/logout
// Client-side logout (just for logging, token invalidation would require blacklist)
router.post('/logout', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('User logged out', { ...ctx, email: req.user.email });

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

        if (newPassword.length < 6) {
            throw new ValidationError('New password must be at least 6 characters', {
                field: 'newPassword'
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

        // Update password
        await db.pool.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, userId]
        );

        logger.info('Password changed successfully', ctx);

        res.json({
            success: true,
            message: 'Password changed successfully',
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

module.exports = router;
