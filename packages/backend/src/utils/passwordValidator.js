/**
 * Password validation and strength scoring.
 *
 * Rules for new passwords:
 *  - Minimum 8 characters
 *  - At least 1 uppercase letter
 *  - At least 1 number
 *
 * Existing weak passwords are grandfathered — these rules apply only to new/changed passwords.
 */

/**
 * Validate a password against the strength requirements.
 * @param {string} password
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validatePassword = (password) => {
    const errors = [];

    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters');
    }

    if (password && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (password && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};

/**
 * Get a password strength score (0-4) for UI display.
 *  0 = Very Weak  (< 8 chars)
 *  1 = Weak       (8+ chars, missing uppercase or number)
 *  2 = Fair       (8+ chars, has uppercase and number)
 *  3 = Strong     (12+ chars, has uppercase, number, and special char)
 *  4 = Very Strong (16+ chars, all criteria)
 *
 * @param {string} password
 * @returns {{ score: number, label: string }}
 */
const getPasswordStrength = (password) => {
    if (!password || password.length === 0) {
        return { score: 0, label: 'Very Weak' };
    }

    let score = 0;

    // Length checks
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character diversity
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Normalize to 0-4 scale
    const normalized = Math.min(4, Math.floor(score * 4 / 6));

    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    return { score: normalized, label: labels[normalized] };
};

module.exports = {
    validatePassword,
    getPasswordStrength,
};
