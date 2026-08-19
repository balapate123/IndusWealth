/**
 * Cancellation and negotiation guides, addressed by slug.
 *
 * Two bugs live in this module's history and both are worth stating, because
 * they are the same bug wearing different clothes.
 *
 * 1. `cancellation_guides.json` is keyed on the display name `Rogers`, while the
 *    detector produces `ROGERS` — `merchant_aliases.json` holds ROGERS WIRELESS
 *    and ROGERS CABLE but not the bare ROGERS that `ROGERS *MOBILE` reduces to
 *    once the `*` suffix is stripped. Five of the twelve guides never resolved,
 *    and four of those five (Rogers, Bell, Telus, Adobe) are the only merchants
 *    carrying negotiation scripts. Negotiate worked for GoodLife Fitness and
 *    nothing else.
 *
 * 2. When no guide matched, `recordAction` returned `guide: null` and the mobile
 *    sheet only opens `if (result?.data?.guide)`. So the button flipped a hidden
 *    database status and nothing appeared on screen.
 *
 * A merchant key is therefore a **slug**, never a display name — the discipline
 * `insight_identity.js` already applies to model-authored strings — and
 * `buildGuide` always returns an object. There are three tiers of quality and no
 * tier zero.
 */

const cancellationGuides = require('../data/cancellation_guides.json');
const merchantAliases = require('../data/merchant_aliases.json');

/**
 * Canonical form of a merchant name for lookup.
 *
 * `Rogers`, `ROGERS`, `Rogers Inc.` and `ROGERS *MOBILE` (post-normalisation)
 * all reduce to `rogers`.
 */
function merchantSlug(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * slug -> the key in cancellation_guides.json.
 *
 * Built from the guide keys, their displayName, and every alias that resolves to
 * a merchant we hold a guide for. The alias pass is what lets ROGERS WIRELESS
 * find the Rogers guide even before normalisation collapses it.
 */
const SLUG_INDEX = (() => {
    const index = {};
    const add = (name, key) => {
        const slug = merchantSlug(name);
        if (slug && !index[slug]) index[slug] = key;
    };

    for (const [key, guide] of Object.entries(cancellationGuides)) {
        add(key, key);
        if (guide.displayName) add(guide.displayName, key);
    }
    for (const [alias, target] of Object.entries(merchantAliases)) {
        if (cancellationGuides[target]) add(alias, target);
    }
    return index;
})();

/** The guide key for a merchant, or null. Stored so lookups stay stable. */
function guideKeyFor(merchantName) {
    return SLUG_INDEX[merchantSlug(merchantName)] || null;
}

/** The raw guide entry for a merchant, or null. */
function findGuide(merchantName) {
    const key = guideKeyFor(merchantName);
    return key ? cancellationGuides[key] : null;
}

/** Whether we hold a negotiation script. Gates the Negotiate button. */
function hasNegotiationScript(merchantName) {
    return Boolean(findGuide(merchantName)?.negotiation);
}

/**
 * How the merchant's name should read on screen.
 *
 * `normalizeMerchantName` yields the uppercase form the bank sent -- ROGERS,
 * ENBRIDGE, TD AUTO FINANCE -- and that string is the upsert key, so it cannot
 * change without orphaning every stored row. Display is resolved on read
 * instead: a merchant we hold a guide for gets the guide's proper casing, and
 * everything else is left exactly as it appears on the user's statement.
 *
 * Deliberately not title-cased. `TD AUTO FINANCE` becoming `Td Auto Finance` is
 * worse than leaving it, and no general rule gets acronyms right.
 */
function displayNameFor(merchantName) {
    return findGuide(merchantName)?.displayName || merchantName;
}

/** Brand colour for the row's logo tile, or null for the category ramp. */
function logoColorFor(merchantName) {
    return findGuide(merchantName)?.logoColor || null;
}

// ---------------------------------------------------------------------------
// Tier 2 — guidance by canonical category
// ---------------------------------------------------------------------------

/**
 * Keyed on CANONICAL_CATEGORIES from category_map.js, not on the old Watchdog
 * vocabulary. Generic, but true of essentially every merchant in the category,
 * which is what makes it better than an empty sheet.
 */
const CATEGORY_GUIDES = {
    'Subscriptions': {
        steps: [
            'Sign in on the company\'s own website, not the app.',
            'Look under Account, Membership, or Subscription.',
            'Choose to cancel, and follow through to a confirmation screen.',
            'Save the confirmation email.',
        ],
        tips: ['Your access usually runs to the end of the period you have already paid for.'],
    },
    'Entertainment': {
        steps: [
            'Sign in on the company\'s own website, not the app.',
            'Look under Account, Membership, or Subscription.',
            'Choose to cancel, and follow through to a confirmation screen.',
            'Save the confirmation email.',
        ],
        tips: ['Your access usually runs to the end of the period you have already paid for.'],
    },
    'Software & Tech': {
        steps: [
            'Sign in and open Account, then Plan or Billing.',
            'Choose to cancel or to stop auto-renewal.',
            'Save the confirmation email.',
        ],
        tips: ['Annual plans can charge a fee for leaving early — check before you confirm.'],
    },
    'Fitness': {
        steps: [
            'Check your agreement for how much notice is required.',
            'Ask the gym how they accept cancellations — many need it in writing.',
            'Ask for written confirmation and the date of your final payment.',
        ],
        tips: [
            'Ontario has specific rules for fitness contracts. Check your agreement for your cancellation rights.',
            'Keep the written confirmation. It is the only proof you cancelled.',
        ],
    },
    'Insurance': {
        steps: [
            'Call your insurer or broker and ask what they need to cancel.',
            'Expect to sign something — insurance rarely cancels by phone alone.',
            'Confirm the exact date coverage ends.',
        ],
        tips: [
            'Ask whether leaving mid-term costs a fee.',
            'Do not cancel coverage you are required to carry.',
        ],
    },
    'Utilities': {
        steps: [
            'Call the provider and ask for the retention or cancellations team.',
            'If you are moving service rather than ending it, say so — the process differs.',
            'Confirm the final billing date in writing.',
        ],
        tips: ['Lowering the bill is usually easier than leaving. Try that first.'],
    },
};

/** The one thing people miss, on every subscription. */
const APP_STORE_TIP = 'If you signed up through the App Store or Google Play, you have to '
    + 'cancel there — cancelling on the company\'s own site will not stop the billing.';

const SUBSCRIPTION_CATEGORIES = new Set(['Subscriptions', 'Entertainment', 'Software & Tech']);

// ---------------------------------------------------------------------------
// The guide the sheet actually renders
// ---------------------------------------------------------------------------

/**
 * Always returns a guide. Never null.
 *
 * Tier 1 is the merchant's own entry, tier 2 is its canonical category, tier 3
 * is the bare fallback. Every tier ends the same way, because the payload is not
 * the prose — it is that the user can now confirm and we start watching.
 *
 * `alternatives` is deliberately absent. It hardcoded competitor names and
 * prices that were already going stale, and it was the last place in the app
 * that recommended a named product off the user's own spending.
 */
function buildGuide({ merchantName, displayName, action, category }) {
    const entry = findGuide(merchantName);
    const name = entry?.displayName || displayName || merchantName;

    if (action === 'negotiate') {
        // Only offered where a script exists, so this branch is reached only
        // when the button was legitimately rendered.
        if (!entry?.negotiation) return null;
        return {
            tier: 'merchant',
            merchantName: name,
            steps: entry.cancellation?.steps || [],
            directUrl: entry.cancellation?.url || null,
            estimatedTime: entry.cancellation?.estimatedMinutes
                ? `${entry.cancellation.estimatedMinutes} minutes`
                : null,
            tips: entry.negotiation.tips || [],
            canPause: false,
            pauseNote: null,
            negotiationScript: entry.negotiation.script,
            retentionNumber: entry.negotiation.retentionNumber,
            expectedDiscount: entry.negotiation.expectedDiscount,
            bestTimeToCall: entry.negotiation.bestTimeToCall,
        };
    }

    const isSubscription = SUBSCRIPTION_CATEGORIES.has(category);

    if (entry?.cancellation) {
        const tips = [...(entry.cancellation.tips || [])];
        if (isSubscription) tips.push(APP_STORE_TIP);
        return {
            tier: 'merchant',
            merchantName: name,
            steps: entry.cancellation.steps || [],
            directUrl: entry.cancellation.url || null,
            estimatedTime: entry.cancellation.estimatedMinutes
                ? `${entry.cancellation.estimatedMinutes} minutes`
                : null,
            tips,
            canPause: Boolean(entry.cancellation.canPause),
            pauseNote: entry.cancellation.pauseNote || null,
            negotiationScript: null,
        };
    }

    const byCategory = CATEGORY_GUIDES[category];
    if (byCategory) {
        const tips = [...byCategory.tips];
        if (isSubscription) tips.push(APP_STORE_TIP);
        return {
            tier: 'category',
            merchantName: name,
            steps: byCategory.steps,
            directUrl: null,
            estimatedTime: null,
            tips,
            canPause: false,
            pauseNote: null,
            negotiationScript: null,
        };
    }

    return {
        tier: 'generic',
        merchantName: name,
        steps: [
            `Search "${name} cancel subscription" to find their cancellation page.`,
            'Or open your last email receipt from them — it usually has a link to manage or cancel.',
            'Follow through to a confirmation, and save it.',
        ],
        directUrl: null,
        estimatedTime: null,
        tips: ['We do not have step-by-step instructions for this one yet.'],
        canPause: false,
        pauseNote: null,
        negotiationScript: null,
    };
}

module.exports = {
    merchantSlug,
    guideKeyFor,
    findGuide,
    displayNameFor,
    hasNegotiationScript,
    logoColorFor,
    buildGuide,
    CATEGORY_GUIDES,
    APP_STORE_TIP,
};
