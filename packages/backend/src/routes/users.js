const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../services/db');

// POST /users/signup
// Create a new user
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Check if user already exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await db.createUser(email, passwordHash, name || 'User');

        console.log(`📥 [POST /users/signup] New user created: ${email}`);

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /users/login
// Authenticate user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await db.getUserByEmail(email);
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

        console.log(`📥 [POST /users/login] User logged in: ${email}`);

        // In a real app, you'd generate a JWT token here
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                hasPlaidLinked: !!user.plaid_access_token,
            },
            // For MVP, we'll use the user ID as a simple token
            token: `user_${user.id}`
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// GET /users/me
// Get current user info (requires user_id header for MVP)
router.get('/me', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const user = await db.getUserById(parseInt(userId));
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
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
