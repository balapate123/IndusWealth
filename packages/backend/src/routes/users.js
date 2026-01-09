const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../services/db');
const { generateToken, authenticateToken } = require('../middleware/auth');

// POST /users/signup
// Create a new user and return JWT token
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Password strength validation
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if user already exists
        const existingUser = await db.getUserByEmail(email.toLowerCase());
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Hash password with strong salt rounds
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const user = await db.createUser(email.toLowerCase(), passwordHash, name || 'User');

        // Generate JWT token
        const token = generateToken(user);

        console.log(`📥 [POST /users/signup] New user created: ${email}`);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: false,
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /users/login
// Authenticate user and return JWT token
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user (case-insensitive email)
        const user = await db.getUserByEmail(email.toLowerCase());
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = generateToken(user);

        console.log(`📥 [POST /users/login] User logged in: ${email}`);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: !!user.plaid_access_token,
            }
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// GET /users/me
// Get current authenticated user info (requires valid JWT)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        // User is already verified by authenticateToken middleware
        const user = await db.getUserById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: !!user.plaid_access_token,
                createdAt: user.created_at,
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /users/logout
// Client-side logout (just for logging, token invalidation would require blacklist)
router.post('/logout', authenticateToken, async (req, res) => {
    console.log(`📤 [POST /users/logout] User logged out: ${req.user.email}`);
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// PUT /users/profile
// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.id;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Name is required'
            });
        }

        // Update user in database
        await db.pool.query(
            'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2',
            [name.trim(), userId]
        );

        console.log(`📝 [PUT /users/profile] Profile updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// PUT /users/password
// Change password
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }

        // Get user with password hash
        const user = await db.getUserByEmail(req.user.email);

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await db.pool.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, userId]
        );

        console.log(`🔐 [PUT /users/password] Password changed for user ${userId}`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
