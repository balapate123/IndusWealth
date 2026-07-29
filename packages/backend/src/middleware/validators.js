const { body, validationResult } = require('express-validator');
const { FLAG_ICONS, FLAG_RAMP_SIZE } = require('../services/flags');
const {
    GOAL_ICONS,
    GOAL_RAMP_SIZE,
    GOAL_TYPES,
    TRACKING_MODES,
    REMINDER_CADENCES,
    MILESTONES,
} = require('../services/goals');

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

/**
 * Validation chains for savings goals.
 *
 * Same reasoning as the flag chains: names are trimmed and capped but not
 * escaped, and icons are checked against the allowlist the picker offers rather
 * than a shape regex.
 *
 * The money cap is $100,000,000. It exists so a typo cannot overflow
 * DECIMAL(15,2) at the database and come back as a 500 the user cannot act on.
 */
const MAX_GOAL_AMOUNT = 100000000;

const goalName = (chain) => chain
    .trim()
    .isLength({ min: 1, max: 60 }).withMessage('Goal name must be 1-60 characters');

const goalAmount = (chain, field) => chain
    .isFloat({ gt: 0, max: MAX_GOAL_AMOUNT })
    .withMessage(`${field} must be greater than 0`)
    .toFloat();

const goalTargetDate = (chain) => chain
    .optional({ nullable: true })
    .isISO8601().withMessage('targetDate must be a date')
    .custom((value) => {
        // A target in the past cannot be worked toward, and a thousand-year
        // goal is a typo. Both produce nonsense pace maths downstream.
        const date = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) throw new Error('targetDate cannot be in the past');
        const max = new Date(today);
        max.setFullYear(max.getFullYear() + 50);
        if (date > max) throw new Error('targetDate must be within 50 years');
        return true;
    });

const goalColorIndex = (chain) => chain
    .isInt({ min: 0, max: GOAL_RAMP_SIZE - 1 })
    .withMessage(`colorIndex must be between 0 and ${GOAL_RAMP_SIZE - 1}`)
    .toInt();

const goalIcon = (chain) => chain
    .isIn(GOAL_ICONS).withMessage('icon must be one of the supported goal icons');

const goalReminder = [
    body('reminderCadence').optional({ nullable: true })
        .isIn(REMINDER_CADENCES).withMessage(`reminderCadence must be one of: ${REMINDER_CADENCES.join(', ')}`),
    body('reminderHour').optional({ nullable: true })
        .isInt({ min: 0, max: 23 }).withMessage('reminderHour must be 0-23').toInt(),
    body('reminderAmount').optional({ nullable: true })
        .isFloat({ gt: 0, max: MAX_GOAL_AMOUNT }).withMessage('reminderAmount must be greater than 0').toFloat(),
    // The valid range for reminderDay depends on the cadence: a weekday index
    // for weekly, a day of month for monthly. Capped at 28 so a monthly
    // reminder cannot silently skip February.
    body('reminderDay').optional({ nullable: true })
        .isInt({ min: 0, max: 28 }).withMessage('reminderDay is out of range').toInt(),
    body().custom((value) => {
        const { reminderCadence, reminderDay } = value || {};
        if (reminderCadence === 'weekly' && reminderDay !== undefined && reminderDay !== null
            && (reminderDay < 0 || reminderDay > 6)) {
            throw new Error('For a weekly reminder, reminderDay must be 0-6 (Sunday is 0)');
        }
        if (reminderCadence === 'monthly' && reminderDay !== undefined && reminderDay !== null
            && (reminderDay < 1 || reminderDay > 28)) {
            throw new Error('For a monthly reminder, reminderDay must be 1-28');
        }
        return true;
    }),
];

const validateGoalCreate = [
    goalName(body('name').notEmpty().withMessage('Goal name is required')),
    goalAmount(body('targetAmount'), 'targetAmount'),
    goalTargetDate(body('targetDate')),
    body('goalType').optional().isIn(GOAL_TYPES).withMessage(`goalType must be one of: ${GOAL_TYPES.join(', ')}`),
    body('trackingMode').optional().isIn(TRACKING_MODES).withMessage(`trackingMode must be one of: ${TRACKING_MODES.join(', ')}`),
    // The Plaid account id the client holds, not our numeric primary key —
    // GET /accounts hands out Plaid ids, same as it does for transactions.
    body('accountId').optional({ nullable: true })
        .isString().withMessage('accountId must be an account id')
        .bail()
        .isLength({ min: 1, max: 255 }).withMessage('accountId must be an account id'),
    body('countExistingBalance').optional().isBoolean().withMessage('countExistingBalance must be a boolean').toBoolean(),
    goalColorIndex(body('colorIndex').optional()),
    goalIcon(body('icon').optional()),
    ...goalReminder,
    body().custom((value) => {
        if (value?.trackingMode === 'account' && !value?.accountId) {
            throw new Error('An account-tracked goal needs an accountId');
        }
        return true;
    }),
    handleValidationErrors,
];

const GOAL_UPDATE_FIELDS = [
    'name', 'goalType', 'targetAmount', 'targetDate', 'colorIndex', 'icon',
    'reminderCadence', 'reminderDay', 'reminderHour', 'reminderAmount',
    'status', 'accountId', 'countExistingBalance',
];

const validateGoalUpdate = [
    goalName(body('name').optional()),
    body('targetAmount').optional().isFloat({ gt: 0, max: MAX_GOAL_AMOUNT })
        .withMessage('targetAmount must be greater than 0').toFloat(),
    goalTargetDate(body('targetDate')),
    body('goalType').optional().isIn(GOAL_TYPES).withMessage(`goalType must be one of: ${GOAL_TYPES.join(', ')}`),
    // The Plaid account id the client holds, not our numeric primary key —
    // GET /accounts hands out Plaid ids, same as it does for transactions.
    body('accountId').optional({ nullable: true })
        .isString().withMessage('accountId must be an account id')
        .bail()
        .isLength({ min: 1, max: 255 }).withMessage('accountId must be an account id'),
    body('countExistingBalance').optional().isBoolean().toBoolean(),
    goalColorIndex(body('colorIndex').optional()),
    goalIcon(body('icon').optional()),
    // 'achieved' is not settable by hand: it is a consequence of reaching the
    // target, recorded by the milestone endpoint, not a label to apply.
    body('status').optional().isIn(['active', 'archived']).withMessage('status must be active or archived'),
    ...goalReminder,
    body().custom((value) => {
        if (!GOAL_UPDATE_FIELDS.some((key) => value?.[key] !== undefined)) {
            throw new Error(`Provide at least one of: ${GOAL_UPDATE_FIELDS.join(', ')}`);
        }
        return true;
    }),
    handleValidationErrors,
];

const validateGoalContribution = [
    body('amount').exists().withMessage('amount is required')
        // Negative is allowed on purpose: a correction or a withdrawal is a
        // real event, and forcing it positive would make the total a fiction.
        .isFloat({ min: -MAX_GOAL_AMOUNT, max: MAX_GOAL_AMOUNT }).withMessage('amount must be a number')
        .custom((value) => {
            if (Number(value) === 0) throw new Error('amount cannot be zero');
            return true;
        })
        .toFloat(),
    body('note').optional({ nullable: true }).trim().isLength({ max: 140 }).withMessage('note must be at most 140 characters'),
    body('occurredOn').optional({ nullable: true }).isISO8601().withMessage('occurredOn must be a date'),
    handleValidationErrors,
];

const validateGoalMilestones = [
    body('milestones').isArray({ min: 1, max: MILESTONES.length })
        .withMessage('milestones must be a non-empty array')
        .custom((values) => {
            if (!values.every((m) => MILESTONES.includes(Number(m)))) {
                throw new Error(`milestones must be among: ${MILESTONES.join(', ')}`);
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
    validateGoalCreate,
    validateGoalUpdate,
    validateGoalContribution,
    validateGoalMilestones,
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
