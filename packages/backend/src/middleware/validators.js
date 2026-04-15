const { body, validationResult } = require('express-validator');

/**
 * Middleware to check validation results and return errors.
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            message: errors.array()[0].msg,
            details: { errors: errors.array() },
            requestId: req.requestId,
        });
    }
    next();
};

/**
 * Validation chains for login endpoint.
 */
const validateLogin = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required'),
    handleValidationErrors,
];

/**
 * Validation chains for signup endpoint.
 */
const validateSignup = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Name must be 100 characters or less')
        .escape(),
    handleValidationErrors,
];

/**
 * Validation chains for profile update.
 */
const validateProfileUpdate = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters')
        .escape(),
    body('dateOfBirth')
        .optional()
        .isISO8601().withMessage('Invalid date format. Use YYYY-MM-DD'),
    handleValidationErrors,
];

/**
 * Validation chains for password change.
 */
const validatePasswordChange = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    handleValidationErrors,
];

/**
 * Validation chains for transaction notes.
 */
const validateTransactionNotes = [
    body('notes')
        .isString().withMessage('Notes must be a string')
        .isLength({ max: 500 }).withMessage('Notes must be 500 characters or less')
        .trim(),
    handleValidationErrors,
];

/**
 * Validation chains for email verification.
 */
const validateVerifyEmail = [
    body('code')
        .notEmpty().withMessage('Verification code is required')
        .isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
    handleValidationErrors,
];

/**
 * Validation chains for forgot password.
 */
const validateForgotPassword = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    handleValidationErrors,
];

/**
 * Validation chains for password reset.
 */
const validateResetPassword = [
    body('code')
        .notEmpty().withMessage('Reset code is required'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    handleValidationErrors,
];

module.exports = {
    handleValidationErrors,
    validateLogin,
    validateSignup,
    validateProfileUpdate,
    validatePasswordChange,
    validateTransactionNotes,
    validateVerifyEmail,
    validateForgotPassword,
    validateResetPassword,
};
