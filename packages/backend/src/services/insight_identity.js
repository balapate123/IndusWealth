/**
 * Insight Identity
 *
 * Answers one question: "is this the same recommendation I showed you last time?"
 *
 * Why it is needed: an insight's `id` is invented by the model on every
 * generation ("unique_id" in the schema), and its `type` is free text — the
 * comment on FALLBACK_ROUTES in ai_insights.js says as much: "insight `type` is
 * model-authored and never quite matches an enum". So the same underlying
 * condition ("$8k idle in chequing") arrived every six hours wearing a different
 * name. That made three things impossible:
 *
 *   - dismissals, which key on (user_id, insight_type, insight_fingerprint) and
 *     were storing the throwaway id as the fingerprint, so a dismissed insight
 *     returned under a new id the next cycle;
 *   - recurrence, i.e. "you have been told this for 47 days";
 *   - cost of inaction, which is recurrence times money.
 *
 * The fix is the same shape as link_registry: stop trusting model-authored
 * strings as identifiers. The model picks a `type` from a fixed enum and a
 * `subject` slug, and the server derives the fingerprint. If the model drifts,
 * normalization pulls it back; if it drifts past that, the failure mode is a
 * lost streak — never a wrong one attributed to the wrong condition.
 */

/**
 * The closed set of insight types.
 *
 * Deliberately coarse. These are buckets for "what kind of thing is this",
 * used for routing and grouping; the `subject` carries what it is actually
 * about. A finer enum would just push the model into picking inconsistently.
 */
const INSIGHT_TYPES = {
    TAX_ADVANTAGED_ACCOUNTS: 'tax_advantaged_accounts',
    SPENDING_OPTIMIZATION: 'spending_optimization',
    DEBT_PAYOFF: 'debt_payoff',
    SAVINGS_ACCELERATION: 'savings_acceleration',
    CASH_FLOW: 'cash_flow',
    INVESTMENT_READINESS: 'investment_readiness',
    MILESTONE: 'milestone',
    TAX_OPTIMIZATION: 'tax_optimization',
    WEALTH_BUILDING: 'wealth_building',
    COMPARATIVE_SPENDING: 'comparative_spending',
    OPPORTUNITY_COST: 'opportunity_cost',
    SEASONAL: 'seasonal',
    OTHER: 'other',
};

const TYPE_VALUES = Object.values(INSIGHT_TYPES);

/** One-line descriptions, used to build the prompt's type list. */
const TYPE_DESCRIPTIONS = {
    [INSIGHT_TYPES.TAX_ADVANTAGED_ACCOUNTS]: 'Unused TFSA/FHSA/RRSP contribution room',
    [INSIGHT_TYPES.SPENDING_OPTIMIZATION]: 'A category or merchant where spending can be reduced',
    [INSIGHT_TYPES.DEBT_PAYOFF]: 'Paying debt down faster or more cheaply',
    [INSIGHT_TYPES.SAVINGS_ACCELERATION]: 'Building the emergency fund or automating savings',
    [INSIGHT_TYPES.CASH_FLOW]: 'Timing, budgeting, credit utilisation, overdraft',
    [INSIGHT_TYPES.INVESTMENT_READINESS]: 'Whether their position suggests they are ready to start — never what to buy',
    [INSIGHT_TYPES.MILESTONE]: 'Something they have achieved',
    [INSIGHT_TYPES.TAX_OPTIMIZATION]: 'Deductions and marginal-rate savings',
    [INSIGHT_TYPES.WEALTH_BUILDING]: 'Long-run habits when cash flow is positive',
    [INSIGHT_TYPES.COMPARATIVE_SPENDING]: 'Their spending against the Canadian average',
    [INSIGHT_TYPES.OPPORTUNITY_COST]: 'Money earning far less than it could in another account type',
    [INSIGHT_TYPES.SEASONAL]: 'Only when a deadline is genuinely near',
    [INSIGHT_TYPES.OTHER]: 'Anything that fits none of the above',
};

/**
 * Free text to enum.
 *
 * Ordered most specific first, because these overlap by design: "tax_savings"
 * is tax_optimization, not savings_acceleration, and only the ordering says so.
 * Anything unmatched becomes `other` rather than being discarded — a coarse
 * bucket costs a slightly worse grouping, dropping the insight costs the user
 * something real.
 */
const TYPE_RULES = [
    { type: INSIGHT_TYPES.MILESTONE, match: /milestone|celebrat|congrat|achieved|paid_off/ },
    { type: INSIGHT_TYPES.SEASONAL, match: /seasonal|deadline|timely|year_end|season/ },
    { type: INSIGHT_TYPES.DEBT_PAYOFF, match: /debt|loan|payoff|avalanche|snowball|balance_transfer|apr/ },
    { type: INSIGHT_TYPES.TAX_OPTIMIZATION, match: /tax_optim|tax_saving|deduction|marginal|bracket|refund|write_off/ },
    { type: INSIGHT_TYPES.TAX_ADVANTAGED_ACCOUNTS, match: /tfsa|rrsp|fhsa|resp|registered|contribution_room/ },
    { type: INSIGHT_TYPES.OPPORTUNITY_COST, match: /opportunity_cost|idle|sitting|uninvested|forgone|low_yield|low_interest/ },
    { type: INSIGHT_TYPES.COMPARATIVE_SPENDING, match: /comparative|comparison|versus|benchmark|average|peer/ },
    { type: INSIGHT_TYPES.SPENDING_OPTIMIZATION, match: /spend|subscription|dining|grocer|merchant|recurring|overspend|discretionary/ },
    { type: INSIGHT_TYPES.SAVINGS_ACCELERATION, match: /saving|emergency_fund|automat|sinking_fund|set_aside/ },
    { type: INSIGHT_TYPES.CASH_FLOW, match: /cash_flow|utilization|utilisation|budget|bill|overdraft|income|surplus/ },
    { type: INSIGHT_TYPES.INVESTMENT_READINESS, match: /invest|portfolio|readiness|contribute/ },
    { type: INSIGHT_TYPES.WEALTH_BUILDING, match: /wealth|net_worth|habit|long_term/ },
];

/**
 * Subjects the model is told to reuse verbatim.
 *
 * The point is not coverage, it is repeatability: a fixed menu the model draws
 * from returns the same slug next cycle far more often than free invention does.
 * It may still invent one when nothing fits, and that is fine.
 */
const COMMON_SUBJECTS = [
    'chequing_idle_cash',
    'emergency_fund',
    'tfsa_room',
    'rrsp_room',
    'fhsa_room',
    'dining_out',
    'groceries',
    'subscriptions',
    'transportation',
    'entertainment',
    'shopping',
    'credit_card_debt',
    'credit_utilization',
    'high_interest_debt',
    'savings_rate',
    'monthly_surplus',
    'recurring_charges',
    'bill_timing',
];

/**
 * Drift the model reliably produces for a subject already on the list.
 *
 * Without this, "dining" one cycle and "dining_out" the next look like two
 * different conditions and the streak resets to day one — which reads to the
 * user as the app forgetting, and quietly zeroes the cost-of-inaction figure.
 */
const SUBJECT_ALIASES = {
    dining: 'dining_out',
    restaurants: 'dining_out',
    restaurant_spending: 'dining_out',
    eating_out: 'dining_out',
    food_delivery: 'dining_out',
    grocery: 'groceries',
    grocery_spending: 'groceries',
    subscription: 'subscriptions',
    subscription_audit: 'subscriptions',
    streaming: 'subscriptions',
    idle_cash: 'chequing_idle_cash',
    chequing_balance: 'chequing_idle_cash',
    checking_idle_cash: 'chequing_idle_cash',
    excess_cash: 'chequing_idle_cash',
    emergency_savings: 'emergency_fund',
    rainy_day_fund: 'emergency_fund',
    tfsa: 'tfsa_room',
    tfsa_contribution_room: 'tfsa_room',
    rrsp: 'rrsp_room',
    rrsp_contribution_room: 'rrsp_room',
    fhsa: 'fhsa_room',
    credit_card: 'credit_card_debt',
    card_debt: 'credit_card_debt',
    utilization: 'credit_utilization',
    utilisation: 'credit_utilization',
    gas: 'transportation',
    fuel: 'transportation',
    transport: 'transportation',
};

const MAX_SUBJECT_LENGTH = 40;

/** Lowercase, underscore-separated, alphanumeric. Returns '' for unusable input. */
function _slugify(raw) {
    if (typeof raw !== 'string') return '';
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, MAX_SUBJECT_LENGTH)
        .replace(/_+$/g, '');
}

/**
 * Normalize a model-authored type onto the enum.
 * Exact enum values pass through untouched; everything else goes through the rules.
 */
function normalizeType(raw) {
    const slug = _slugify(raw);
    if (!slug) return INSIGHT_TYPES.OTHER;
    if (TYPE_VALUES.includes(slug)) return slug;

    const hit = TYPE_RULES.find((rule) => rule.match.test(slug));
    return hit ? hit.type : INSIGHT_TYPES.OTHER;
}

/**
 * Normalize a model-authored subject slug.
 *
 * Falls back to 'general' rather than to something derived from the title:
 * titles are rewritten every generation, so a title-derived subject would look
 * stable in code and never actually match. 'general' at least collapses
 * consistently onto the type.
 */
function normalizeSubject(raw) {
    const slug = _slugify(raw);
    if (!slug) return 'general';
    return SUBJECT_ALIASES[slug] || slug;
}

/**
 * The stable identity of an insight: `type:subject`.
 *
 * Left readable rather than hashed. It contains no user data — only which of
 * twelve buckets and which of a few dozen subjects — so there is nothing to
 * obscure, and an opaque digest would make both the database and the logs
 * impossible to reason about when a streak looks wrong.
 */
function fingerprintOf(insight) {
    const type = normalizeType(insight?.type);
    const subject = normalizeSubject(insight?.subject);
    return `${type}:${subject}`;
}

/**
 * Normalize a batch: stamp each insight with its canonical type and fingerprint,
 * and collapse duplicates.
 *
 * Deduping matters more than it looks. Two insights sharing a fingerprint in one
 * batch would each bump `occurrence_count`, so a single generation would read as
 * two sightings and the user would be told they had been ignoring something
 * twice as long as they had.
 */
function identifyInsights(insights) {
    if (!Array.isArray(insights)) return [];

    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const byFingerprint = new Map();

    for (const insight of insights) {
        if (!insight || typeof insight !== 'object') continue;

        const type = normalizeType(insight.type);
        const subject = normalizeSubject(insight.subject);
        const fingerprint = `${type}:${subject}`;
        const stamped = { ...insight, type, subject, fingerprint };

        const existing = byFingerprint.get(fingerprint);
        if (!existing) {
            byFingerprint.set(fingerprint, stamped);
            continue;
        }

        // Keep the stronger of the two: priority first, then quoted benefit.
        const rank = (i) => [
            priorityWeight[i.priority] || 0,
            Number(i.potential_benefit?.annual_savings) || 0,
        ];
        const [existingPriority, existingBenefit] = rank(existing);
        const [candidatePriority, candidateBenefit] = rank(stamped);

        if (
            candidatePriority > existingPriority
            || (candidatePriority === existingPriority && candidateBenefit > existingBenefit)
        ) {
            byFingerprint.set(fingerprint, stamped);
        }
    }

    return [...byFingerprint.values()];
}

/** The type enum as prompt text. */
function getTypesForPrompt() {
    return TYPE_VALUES
        .filter((type) => type !== INSIGHT_TYPES.OTHER)
        .map((type) => `- ${type}: ${TYPE_DESCRIPTIONS[type]}`)
        .join('\n');
}

/** The canonical subject list as prompt text. */
function getSubjectsForPrompt() {
    return COMMON_SUBJECTS.join(', ');
}

module.exports = {
    INSIGHT_TYPES,
    TYPE_VALUES,
    COMMON_SUBJECTS,
    SUBJECT_ALIASES,
    MAX_SUBJECT_LENGTH,
    normalizeType,
    normalizeSubject,
    fingerprintOf,
    identifyInsights,
    getTypesForPrompt,
    getSubjectsForPrompt,
};
