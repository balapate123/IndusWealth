const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../services/db');
const { createLogger } = require('../services/logger');
const { AuthError } = require('../errors/AppError');

const logger = createLogger('AUTH');

// JWT Secret - must be set in environment for production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
    }
    logger.warn('JWT_SECRET not set - using insecure default for development only');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret';

// Access token expiry — configurable for transition period (default: 15m, use 7d for backward compat)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

/**
 * Generate a short-lived access token (JWT).
 * @param {Object} user - User object with id, email, name
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
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
 * Generate a refresh token (opaque, random).
 * Returns the raw token (to send to client), its SHA-256 hash (to store in DB),
 * and a family ID (for rotation-based reuse detection).
 * @returns {{ token: string, hash: string, familyId: string }}
 */
const generateRefreshToken = () => {
    const token = crypto.randomBytes(48).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const familyId = crypto.randomUUID();
    return { token, hash, familyId };
};

/**
 * Rotate a refresh token: validate the old token, revoke it, and issue a new pair.
 * Implements reuse detection — if a revoked token is reused, the entire family is revoked.
 * @param {string} oldToken - The raw refresh token from the client
 * @param {string} ipAddress - Client IP for logging
 * @returns {Promise<{ accessToken: string, refreshToken: string, userId: number }>}
 */
const rotateRefreshToken = async (oldToken, ipAddress) => {
    const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');
    const storedToken = await db.getRefreshToken(oldHash);

    if (!storedToken) {
        throw new AuthError('Invalid refresh token', 'TOKEN_INVALID');
    }

    // Reuse detection: if the token has already been revoked, revoke the entire family
    if (storedToken.revoked_at) {
        logger.warn('Refresh token reuse detected — revoking family', {
            familyId: storedToken.family_id,
            userId: storedToken.user_id,
        });
        await db.revokeTokenFamily(storedToken.family_id);
        throw new AuthError('Refresh token has been revoked (possible token theft)', 'TOKEN_REUSED');
    }

    // Check expiry
    if (new Date(storedToken.expires_at) < new Date()) {
        throw new AuthError('Refresh token has expired', 'TOKEN_EXPIRED');
    }

    // Get user
    const user = await db.getUserById(storedToken.user_id);
    if (!user) {
        throw new AuthError('User no longer exists', 'USER_NOT_FOUND');
    }

    // Generate new pair (keep the same family)
    const newRefreshRaw = crypto.randomBytes(48).toString('base64url');
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshRaw).digest('hex');

    // Revoke old token and link to new
    await db.revokeRefreshToken(oldHash, newRefreshHash);

    // Store new token in the same family
    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.storeRefreshToken(newRefreshHash, user.id, storedToken.family_id, refreshExpiry, ipAddress);

    // Generate new access token
    const accessToken = generateAccessToken(user);

    return {
        accessToken,
        refreshToken: newRefreshRaw,
        userId: user.id,
    };
};

/**
 * Revoke all refresh tokens for a user (e.g., on password change).
 * @param {number} userId
 */
const revokeAllUserTokens = async (userId) => {
    await db.revokeAllUserTokens(userId);
    logger.info('All refresh tokens revoked for user', { userId });
};

/**
 * Revoke a single refresh token (e.g., on logout).
 * @param {string} rawToken - The raw refresh token
 */
const revokeSingleToken = async (rawToken) => {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.revokeRefreshToken(hash);
};

/**
 * Verify and decode a JWT access token.
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
 * Authentication middleware.
 * Verifies JWT token from Authorization header and attaches user to request.
 */
const authenticateToken = async (req, res, next) => {
    const ctx = { requestId: req.requestId };

    try {
        // Get token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

        if (!token) {
            logger.debug('No token provided', ctx);
            throw new AuthError('Access token required', 'TOKEN_REQUIRED');
        }

        // Verify token
        const decoded = verifyToken(token);
        if (!decoded) {
            logger.debug('Invalid token', ctx);
            throw new AuthError('Invalid or expired token', 'TOKEN_INVALID');
        }

        // Verify user still exists in database
        const user = await db.getUserById(decoded.userId);
        if (!user) {
            logger.warn('User not found for valid token', { ...ctx, userId: decoded.userId });
            throw new AuthError('User no longer exists', 'USER_NOT_FOUND');
        }

        // Refusing unverified accounts at the login door only stops new sessions.
        // Signup used to hand out tokens before any code was entered, so accounts
        // created then still hold valid ones — this is what actually ends them.
        // The user record is already loaded above, so it costs no extra query.
        if (!user.email_verified) {
            logger.warn('Request rejected - email not verified', { ...ctx, userId: decoded.userId });
            throw new AuthError('Please verify your email address to continue.', 'EMAIL_NOT_VERIFIED');
        }

        // Attach user info to request
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name,
            plaidAccessToken: user.plaid_access_token,
            // Carried so a sync can tell an already-recorded connection from one
            // still missing its item id, and skip the recovery call.
            plaidItemId: user.plaid_item_id,
        };

        logger.debug('User authenticated', { ...ctx, userId: req.user.id });
        next();
    } catch (error) {
        // Pass AuthErrors to global error handler
        if (error instanceof AuthError) {
            return next(error);
        }

        // Log unexpected errors and pass to global handler
        logger.error('Unexpected auth middleware error', { ...ctx, error });
        next(error);
    }
};

/**
 * Optional authentication middleware.
 * Attaches user to request if token is valid, but doesn't require it.
 */
const optionalAuth = async (req, res, next) => {
    const ctx = { requestId: req.requestId };

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
                    logger.debug('Optional auth: user authenticated', { ...ctx, userId: req.user.id });
                }
            }
        }

        next();
    } catch (error) {
        // Continue without auth on error - this is optional auth
        logger.debug('Optional auth failed, continuing without auth', { ...ctx, error: error.message });
        next();
    }
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    rotateRefreshToken,
    revokeAllUserTokens,
    revokeSingleToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    JWT_SECRET: EFFECTIVE_JWT_SECRET,
    JWT_EXPIRES_IN,
};
