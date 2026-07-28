/**
 * Constants for user-defined transaction flags.
 *
 * The icon allowlist and ramp size are the contract between this API and the
 * mobile flag picker: the picker offers exactly these, and the API accepts
 * exactly these. An arbitrary string would pass validation and then render as a
 * missing glyph on the device, which is a bug you only find by looking.
 *
 * Mirrored in packages/mobile/src/constants/flags.js — same duplication pattern
 * as categorization.js, which is ported rather than shared.
 */

/** Number of hues in the theme's validated categorical ramp (tokens.js). */
const FLAG_RAMP_SIZE = 7;

/**
 * Ionicons names offered by the picker. Chosen to read clearly at 16px and to
 * cover the shapes people actually reach for when grouping their own spending.
 */
const FLAG_ICONS = [
    'home',
    'briefcase',
    'airplane',
    'people',
    'person',
    'car',
    'cart',
    'restaurant',
    'school',
    'heart',
    'gift',
    'paw',
    'construct',
    'barbell',
    'game-controller',
    'pricetag',
];

/**
 * Starter set created once per user, on their first read. Ordinary rows with no
 * special status — renameable and deletable like any other.
 *
 * Colour indices are spread across the ramp rather than sequential so the first
 * few flags a user sees are maximally distinguishable from each other.
 */
const DEFAULT_FLAGS = [
    { name: 'Home', colorIndex: 0, icon: 'home' },
    { name: 'Work', colorIndex: 2, icon: 'briefcase' },
    { name: 'Travel', colorIndex: 4, icon: 'airplane' },
    { name: 'Shared', colorIndex: 6, icon: 'people' },
    { name: 'Personal', colorIndex: 1, icon: 'person' },
];

module.exports = { FLAG_RAMP_SIZE, FLAG_ICONS, DEFAULT_FLAGS };
