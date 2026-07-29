-- Insight tracking: how long a recommendation has been outstanding, and what
-- it has cost to leave it outstanding.
--
-- Keyed on the fingerprint from services/insight_identity.js ("type:subject"),
-- NOT on the insight id, which the model reinvents every generation. Without a
-- stable key there is no such thing as "the same recommendation as last time",
-- which is why nothing here could exist before.
--
-- Idempotent: initDb() re-runs the whole migration list on every boot.

CREATE TABLE IF NOT EXISTS insight_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    fingerprint VARCHAR(120) NOT NULL,
    insight_type VARCHAR(40) NOT NULL,
    subject VARCHAR(40) NOT NULL,

    -- Latest title, so the pop-up and any history view can name the insight
    -- without re-running generation. Rewritten each sighting; it is display
    -- text, never an identifier.
    title VARCHAR(200),

    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    occurrence_count INTEGER NOT NULL DEFAULT 1,

    -- Two figures, because the model requotes the benefit each cycle as balances
    -- move. Cost of inaction uses the LOWER of the two (see db.js): quoting a
    -- number that grew last week and applying it to the whole elapsed period
    -- would overstate what the user actually gave up, and this figure only
    -- earns its place on screen if it is never inflated.
    first_annual_benefit DECIMAL(15,2) NOT NULL DEFAULT 0,
    annual_benefit DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Set when the user taps the insight's primary action. Stops the cost
    -- counter: we cannot verify they followed through, but we can stop implying
    -- they ignored it.
    acted_at TIMESTAMP WITH TIME ZONE,

    -- Set when the condition stops appearing in a generation, i.e. it resolved
    -- itself. Cleared if it comes back.
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Last time this specific insight was shown as a pop-up.
    spotlighted_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_insight_tracking_user
    ON insight_tracking (user_id);

-- The spotlight query wants "this user's unresolved, unacted insights, worst
-- first". Partial index because resolved/acted rows are exactly what it skips.
CREATE INDEX IF NOT EXISTS idx_insight_tracking_outstanding
    ON insight_tracking (user_id, annual_benefit DESC)
    WHERE resolved_at IS NULL AND acted_at IS NULL;

-- Per-user pop-up cooldown. Distinct from insight_tracking.spotlighted_at:
-- that one stops the same insight being shown twice, this one stops the user
-- being interrupted twice in a week regardless of which insight it is.
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS spotlight_last_shown_at TIMESTAMP WITH TIME ZONE;

-- Opt-out. The pop-up is an interruption, so it needs an off switch that is not
-- "uninstall the app".
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS spotlight_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON TABLE insight_tracking IS
    'Per-user recurrence of an insight condition, keyed on the stable type:subject fingerprint. Drives cost-of-inaction and the spotlight pop-up.';
