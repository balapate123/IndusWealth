const db = require('../services/db');
const { createLogger } = require('../services/logger');

const logger = createLogger('LOGIN_PROTECTION');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Check if an account is locked due to failed login attempts.
 * @param {string} email
 * @returns {Promise<{ locked: boolean, remainingMinutes?: number }>}
 */
const checkAccountLock = async (email) => {
    const user = await db.getUserByEmail(email);
    if (!user) {
        // Don't reveal whether user exists
        return { locked: false };
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        return { locked: true, remainingMinutes: remaining };
    }

    return { locked: false };
};

/**
 * Record a failed login attempt. Locks account after MAX_FAILED_ATTEMPTS.
 * @param {string} email
 * @param {string} ip
 * @param {string} userAgent
 * @param {string} reason
 */
const recordFailedAttempt = async (email, ip, userAgent, reason) => {
    // Record in login_attempts table
    await db.recordLoginAttempt(email, ip, userAgent, false, reason);

    // Check if user exists to update their lockout counter
    const user = await db.getUserByEmail(email);
    if (!user) return;

    const newCount = (user.failed_login_attempts || 0) + 1;

    if (newCount >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await db.updateUserLockStatus(user.id, newCount, lockedUntil);
        logger.warn('Account locked due to failed attempts', {
            email,
            attempts: newCount,
            lockedUntil: lockedUntil.toISOString(),
        });
    } else {
        await db.updateUserLockStatus(user.id, newCount, null);
    }
};

/**
 * Record a successful login. Resets failed attempt counter.
 * @param {string} email
 * @param {string} ip
 * @param {string} userAgent
 */
const recordSuccessfulLogin = async (email, ip, userAgent) => {
    await db.recordLoginAttempt(email, ip, userAgent, true);

    const user = await db.getUserByEmail(email);
    if (user && (user.failed_login_attempts > 0 || user.locked_until)) {
        await db.updateUserLockStatus(user.id, 0, null);
    }
};

module.exports = {
    checkAccountLock,
    recordFailedAttempt,
    recordSuccessfulLogin,
};
