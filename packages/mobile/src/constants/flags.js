/**
 * Flag picker constants — a port of packages/backend/src/services/flags.js, the
 * same way utils/categorization.js is a port of the backend categoriser.
 *
 * The server is authoritative: GET /flags publishes the icon allowlist and the
 * ramp size it will accept, and the picker prefers those. This list is the
 * fallback for the first paint, before that response lands. If the two ever
 * disagree, the server wins and the picker simply offers fewer icons.
 */

/** Hues in the theme's validated categorical ramp (constants/tokens.js). */
export const FLAG_RAMP_SIZE = 7;

export const FLAG_ICONS = [
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

/** What a brand-new flag starts as, matching the server's defaults. */
export const NEW_FLAG = { name: '', colorIndex: 0, icon: 'pricetag' };
