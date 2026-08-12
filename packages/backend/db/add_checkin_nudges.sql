-- The weekly check-in nudge.
--
-- Cooldown bookkeeping only: what a nudge SAYS is computed on read from live
-- goals and debts, never stored. A stored nudge would go stale between being
-- written and being read, which is the same reason the spotlight decorates on
-- read rather than at generation time.

-- Per-user cooldown. Distinct from the per-nudge one below: without it, a user
-- with several eligible nudges gets a different one every single day.
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS checkin_last_shown_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS checkin_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Per-nudge cooldown, keyed on the nudge's stable key (kind:targetId). Same
-- principle as insight identity: the key is computed server-side from things
-- that do not change, so "have we said this before" survives a restart.
CREATE TABLE IF NOT EXISTS nudge_history (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nudge_key VARCHAR(120) NOT NULL,
    last_shown_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    shown_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, nudge_key)
);

CREATE INDEX IF NOT EXISTS idx_nudge_history_user
    ON nudge_history (user_id, last_shown_at DESC);

COMMENT ON TABLE nudge_history IS
    'Per-nudge cooldown for the weekly check-in; keyed on kind:targetId, written when a nudge is SHOWN';
COMMENT ON COLUMN user_preferences.checkin_last_shown_at IS
    'Per-user cooldown — one check-in nudge per week regardless of how many are eligible';
