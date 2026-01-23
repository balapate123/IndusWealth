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
// Update user profile
router.put('/profile', authenticateToken, async (req, res, next) => {
    const ctx = { requestId: req.requestId, userId: req.user.id };
    logger.info('Updating user profile', ctx);

    try {
        const { name } = req.body;
        const userId = req.user.id;

        if (!name || name.trim().length === 0) {
            throw new ValidationError('Name is required', { field: 'name' });
        }

        // Update user in database
        await db.pool.query(
            'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2',
            [name.trim(), userId]
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

module.exports = router;
