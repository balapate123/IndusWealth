-- When measurement of a goal started.
--
-- Pace is (what has gone in) / (how long we have been watching), and until now
-- nothing recorded the second half. `created_at` is the obvious stand-in and it
-- is wrong in exactly the case that matters: relinking an account re-snapshots
-- `baseline_amount`, so `saved` restarts from roughly zero while `created_at`
-- still points months back. The goal would read as having saved almost nothing
-- over a long period — a confident, badly wrong "you have stalled".
--
-- Set together with `baseline_amount`, always. Anything that moves the baseline
-- moves the clock: linking an account, relinking a different one, and unlinking
-- back to manual all restart measurement, because after any of them the saved
-- figure is measured from a new zero.
--
-- Manual goals never move their baseline, so for them this stays equal to
-- `created_at` for the goal's whole life.

ALTER TABLE user_goals
    ADD COLUMN IF NOT EXISTS baseline_at TIMESTAMP WITH TIME ZONE;

-- Existing rows: measurement began when the goal did. For manual goals that is
-- exactly right. For account-tracked goals it is right unless they have been
-- relinked, which we have no record of — the pace shown for those will be
-- conservative until their next relink resets it honestly.
UPDATE user_goals
   SET baseline_at = COALESCE(created_at, CURRENT_TIMESTAMP)
 WHERE baseline_at IS NULL;

ALTER TABLE user_goals
    ALTER COLUMN baseline_at SET DEFAULT CURRENT_TIMESTAMP;

-- Safe to re-run: SET NOT NULL on an already-NOT NULL column is a no-op, and
-- the backfill above guarantees there is nothing left to reject.
ALTER TABLE user_goals
    ALTER COLUMN baseline_at SET NOT NULL;

COMMENT ON COLUMN user_goals.baseline_at IS
    'When measurement started; moves with baseline_amount. Denominator of the actual savings pace.';
