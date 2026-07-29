/**
 * Insight Persistence
 *
 * Turns the insight_tracking ledger into two things:
 *   - prompt text, so the model knows what it already told this user;
 *   - a `persistence` block on each insight, so the app can say how long a
 *     condition has been outstanding and approximately what it has cost.
 *
 * The cost figure is calculated here and in SQL — never by the model. Prompt
 * rule 30 forbids it from writing one, for the same reason it may not write a
 * URL: an invented number that contradicts the recorded one is worse than no
 * number at all. This is the enforcement half of that rule.
 */

const db = require('./db');
const { fingerprintOf } = require('./insight_identity');

/**
 * How long something must have been outstanding before we describe the delay in
 * words rather than just showing the count. Below this, "outstanding 3 days" is
 * noise; the condition may simply be new.
 */
const NARRATE_AFTER_DAYS = 14;

/**
 * The fingerprint of an insight, whether or not it was stamped at generation.
 *
 * Cached insight JSON written before this feature existed has no `fingerprint`
 * field, and those rows stay readable for up to the cache lifetime — plus the
 * stale-cache fallback can serve much older ones after an AI outage. Recomputing
 * from type+subject makes the old shape work instead of rendering a blank card.
 */
function fingerprintFor(insight) {
    if (insight && typeof insight.fingerprint === 'string' && insight.fingerprint) {
        return insight.fingerprint;
    }
    return fingerprintOf(insight);
}

/**
 * Render the outstanding ledger as prompt text.
 *
 * Subjects are listed explicitly because rule 27 asks the model to reuse them —
 * it cannot reuse a slug it was never shown, and a fresh slug for an old
 * condition silently resets the streak.
 */
function formatOutstandingForPrompt(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '(none — this is the first analysis)';
    }

    return rows
        .map((row) => {
            const days = Number(row.outstanding_days) || 0;
            const times = Number(row.occurrence_count) || 1;
            const title = row.title ? ` — last framed as "${row.title}"` : '';
            return `- type=${row.insight_type} subject=${row.subject}: outstanding ${days} day(s), shown ${times} time(s)${title}`;
        })
        .join('\n');
}

/** The prompt block, fetched and formatted. Never throws — a missing history is not a failure. */
async function buildOutstandingText(userId) {
    try {
        const rows = await db.getOutstandingInsights(userId);
        return formatOutstandingForPrompt(rows);
    } catch (error) {
        console.error('Could not load outstanding insights for the prompt:', error.message);
        return '(none — this is the first analysis)';
    }
}

/**
 * Attach the persistence block to one insight.
 *
 * `cost_of_inaction` arrives already gated by SQL (null until two sightings, two
 * weeks and a positive benefit), so a null here means "not worth stating yet",
 * not "zero".
 */
function _attachPersistence(insight, tracking) {
    if (!tracking) return insight;

    const days = Number(tracking.outstanding_days) || 0;
    const cost = tracking.cost_of_inaction === null || tracking.cost_of_inaction === undefined
        ? null
        : Number(tracking.cost_of_inaction);

    return {
        ...insight,
        persistence: {
            fingerprint: tracking.fingerprint,
            first_seen_at: tracking.first_seen_at,
            outstanding_days: days,
            occurrence_count: Number(tracking.occurrence_count) || 1,
            // Recurring means "we have told you this before", which is the
            // claim the UI makes. One sighting is not a pattern.
            is_recurring: (Number(tracking.occurrence_count) || 1) >= 2,
            acted_at: tracking.acted_at || null,
            cost_of_inaction: cost,
            // Present tense, no blame, no second-person accusation — this string
            // is rendered verbatim and is the one place the delay is put into
            // words. Prompt rule 31 bans the model from writing anything like
            // it; that ban is only honest if our own copy holds the same line.
            summary: days >= NARRATE_AFTER_DAYS
                ? `Outstanding ${days} days`
                : null,
        },
    };
}

/**
 * Prepare generated insights for a device: stamp persistence, drop dismissed.
 *
 * Runs on every read — cache hit as well as miss — so a dismissal takes effect
 * immediately instead of waiting out the remaining cache window, and the day
 * count is current rather than frozen at generation time.
 *
 * Dismissed insights are filtered here rather than at generation, so the ledger
 * keeps recording that the condition persists. Someone who snoozed a condition
 * for 30 days did not stop the money leaking; hiding the card is what they
 * asked for, falsifying the history is not.
 */
async function presentInsights(userId, insights) {
    if (!Array.isArray(insights) || insights.length === 0) return [];

    const withFingerprints = insights.map((insight) => ({
        ...insight,
        fingerprint: fingerprintFor(insight),
    }));

    let tracking = {};
    let dismissed = new Set();
    try {
        [tracking, dismissed] = await Promise.all([
            db.getInsightTracking(userId, withFingerprints.map((i) => i.fingerprint)),
            db.getActiveDismissals(userId),
        ]);
    } catch (error) {
        // Insights without their history are still useful; insights that fail to
        // load are not. Degrade rather than 500.
        console.error('Could not load insight tracking (serving undecorated):', error.message);
        return withFingerprints;
    }

    return withFingerprints
        .filter((insight) => !dismissed.has(insight.fingerprint))
        .map((insight) => _attachPersistence(insight, tracking[insight.fingerprint]));
}

/**
 * Record a generation against the ledger.
 *
 * Order matters: sightings first, then resolution. Doing it the other way round
 * would briefly mark a still-present condition resolved and reset its clock.
 */
async function recordGeneration(userId, insights) {
    const fingerprints = insights
        .map((insight) => insight.fingerprint)
        .filter(Boolean);

    if (fingerprints.length === 0) return;

    try {
        await db.recordInsightSightings(userId, insights);
        await db.markInsightsResolved(userId, fingerprints);
    } catch (error) {
        // Tracking is an enhancement. If it fails the user still gets insights.
        console.error('Could not record insight sightings:', error.message);
    }
}

module.exports = {
    NARRATE_AFTER_DAYS,
    fingerprintFor,
    formatOutstandingForPrompt,
    buildOutstandingText,
    presentInsights,
    recordGeneration,
    _attachPersistence,
};
