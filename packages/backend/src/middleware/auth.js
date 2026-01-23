const jwt = require('jsonwebtoken');
const db = require('../services/db');

// JWT Secret - must be set in environment for production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
    }
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using insecure default for development only.');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object with id, email, name
 * @returns {string} JWT token
 */
const generateToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.email,
        name: user.name,
    };

    return jwt.sign(payload, EFFECTIVE_JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'induswealth-api',
    });
};

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload or null if invalid
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, EFFECTIVE_JWT_SECRET);
    } catch (error) {
        return null;
    }
};

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header and attaches user to request
 */
const authenticateToken = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required',
                code: 'TOKEN_REQUIRED',
            });
        }

        // Verify token
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token',
                code: 'TOKEN_INVALID',
            });
        }

        // Optionally verify user still exists in database
        const user = await db.getUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User no longer exists',
                code: 'USER_NOT_FOUND',
            });
        }

        // Attach user info to request
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name,
            plaidAccessToken: user.plaid_access_token,
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error',
        });
    }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = verifyToken(token);
            if (decoded) {
                const user = await db.getUserById(decoded.userId);
                if (user) {
                    req.user = {
                        id: decoded.userId,
                        email: decoded.email,
                        name: decoded.name,
                        plaidAccessToken: user.plaid_access_token,
                    };
                }
            }
        }

        next();
    } catch (error) {
        // Continue without auth on error
        next();
    }
};

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    JWT_SECRET: EFFECTIVE_JWT_SECRET,
    JWT_EXPIRES_IN,
};
