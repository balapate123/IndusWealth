const { body, validationResult } = require('express-validator');
const { FLAG_ICONS, FLAG_RAMP_SIZE } = require('../services/flags');

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

/**
 * Validation chains for watchdog action endpoint.
 */
const validateWatchdogAction = [
    body('expenseId')
        .notEmpty().withMessage('expenseId is required')
        .isInt({ min: 1 }).withMessage('expenseId must be a positive integer'),
    body('action')
        .notEmpty().withMessage('action is required')
        .isIn(['negotiate', 'stop', 'keep', 'snooze', 'undo']).withMessage('action must be one of: negotiate, stop, keep, snooze, undo'),
    body('notes')
        .optional()
        .isString().withMessage('notes must be a string')
        .isLength({ max: 500 }).withMessage('notes must be 500 characters or less'),
    body('snoozeUntil')
        .optional()
        .isISO8601().withMessage('snoozeUntil must be a valid date')
        .custom((value, { req }) => {
            if (req.body.action === 'snooze' && !value) {
                throw new Error('snoozeUntil is required for snooze action');
            }
            if (value) {
                const snoozeDate = new Date(value);
                const now = new Date();
                if (snoozeDate <= now) {
                    throw new Error('snoozeUntil must be a future date');
                }
                const maxDate = new Date(now);
                maxDate.setDate(maxDate.getDate() + 90);
                if (snoozeDate > maxDate) {
                    throw new Error('snoozeUntil must be within 90 days');
                }
            }
            return true;
        }),
    handleValidationErrors,
];

/**
 * Validation chains for transaction flags.
 *
 * Names are trimmed and length-capped but deliberately NOT .escape()d: the only
 * consumer is React Native, which renders text as text, and escaping would turn
 * a flag called "Bob's place" into "Bob&#x27;s place" on the device.
 *
 * The icon is checked against the allowlist the picker offers rather than a
 * shape regex. A well-formed name that is not a real Ionicon passes a regex and
 * then renders as an invisible glyph, which is a bug you only find by looking.
 */
const flagName = (chain) => chain
    .trim()
    .isLength({ min: 1, max: 40 }).withMessage('Flag name must be 1-40 characters');

const flagColorIndex = (chain) => chain
    .isInt({ min: 0, max: FLAG_RAMP_SIZE - 1 })
    .withMessage(`colorIndex must be between 0 and ${FLAG_RAMP_SIZE - 1}`)
    .toInt();

const flagIcon = (chain) => chain
    .isIn(FLAG_ICONS).withMessage('icon must be one of the supported flag icons');

const validateFlagCreate = [
    flagName(body('name').notEmpty().withMessage('Flag name is required')),
    flagColorIndex(body('colorIndex').optional()),
    flagIcon(body('icon').optional()),
    handleValidationErrors,
];

const validateFlagUpdate = [
    flagName(body('name').optional()),
    flagColorIndex(body('colorIndex').optional()),
    flagIcon(body('icon').optional()),
    body().custom((value) => {
        if (!['name', 'colorIndex', 'icon'].some((key) => value?.[key] !== undefined)) {
            throw new Error('Provide at least one of: name, colorIndex, icon');
        }
        return true;
    }),
    handleValidationErrors,
];

/** Bulk attach/detach. Bounded so one request cannot be an unbounded write. */
const MAX_FLAG_ASSIGNMENTS = 1000;

const assignmentList = (chain) => chain
    .optional()
    .isArray({ max: MAX_FLAG_ASSIGNMENTS })
    .withMessage(`Send at most ${MAX_FLAG_ASSIGNMENTS} transaction ids at a time`)
    .custom((ids) => {
        if (!ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 255)) {
            throw new Error('Transaction ids must be non-empty strings');
        }
        return true;
    });

const validateFlagAssignment = [
    assignmentList(body('add')),
    assignmentList(body('remove')),
    body().custom((value) => {
        if (!value?.add?.length && !value?.remove?.length) {
            throw new Error('Provide at least one transaction id in add or remove');
        }
        return true;
    }),
    handleValidationErrors,
];

module.exports = {
    handleValidationErrors,
    validateFlagCreate,
    validateFlagUpdate,
    validateFlagAssignment,
    validateLogin,
    validateSignup,
    validateProfileUpdate,
    validatePasswordChange,
    validateTransactionNotes,
    validateVerifyEmail,
    validateForgotPassword,
    validateResetPassword,
    validateWatchdogAction,
};
