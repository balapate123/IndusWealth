-- Savings goals with optional reminders.
--
-- A goal is a target the user is saving TOWARD, so progress accumulates upward.
-- Debt payoff is deliberately not a goal type: the Wealth tab already models
-- debt with APRs and payoff ordering, and folding a downward-counting target
-- into this table would mean every progress calculation carries a sign flip.

CREATE TABLE IF NOT EXISTS user_goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    goal_type VARCHAR(30) NOT NULL DEFAULT 'savings',
    target_amount DECIMAL(15, 2) NOT NULL CHECK (target_amount > 0),
    target_date DATE,

    -- How progress is measured. Explicit rather than inferred from account_id
    -- being null: accounts are ON DELETE SET NULL, so an inferred mode would
    -- silently flip an account-tracked goal to manual and report $0 saved.
    -- Stored explicitly, a goal whose account vanished can say so instead.
    tracking_mode VARCHAR(10) NOT NULL DEFAULT 'manual'
        CHECK (tracking_mode IN ('account', 'manual')),
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,

    -- Balance at the moment the account was linked. Progress is
    -- (current_balance - baseline), so an existing $4,000 balance does not
    -- instantly complete a $5,000 goal unless the user asks it to (baseline 0).
    baseline_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Index into the theme's 7-hue ramp, never a hex: dark and light resolve
    -- different ramps from the same index. Same convention as transaction_flags.
    color_index SMALLINT NOT NULL DEFAULT 0 CHECK (color_index >= 0),
    icon VARCHAR(40) NOT NULL DEFAULT 'flag',

    -- Reminders. NULL cadence means the goal is silent.
    reminder_cadence VARCHAR(10)
        CHECK (reminder_cadence IS NULL OR reminder_cadence IN ('daily', 'weekly', 'monthly')),
    reminder_day SMALLINT,                          -- weekly 0-6 (Sun=0), monthly 1-28
    reminder_hour SMALLINT NOT NULL DEFAULT 9 CHECK (reminder_hour BETWEEN 0 AND 23),
    reminder_amount DECIMAL(15, 2),                 -- "move $2 toward Emergency Fund"

    -- Percentages already announced, so a milestone fires once and not on every
    -- app open. Notifications are scheduled on-device, so the device asks this
    -- table what it has already said rather than keeping its own record.
    milestones_notified SMALLINT[] NOT NULL DEFAULT '{}',

    status VARCHAR(10) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'achieved', 'archived')),
    achieved_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- One goal per name per user, case-insensitively: "Emergency fund" and
-- "Emergency Fund" are the same goal to a human.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_goals_user_name
    ON user_goals (user_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_user_goals_user_status
    ON user_goals (user_id, status);

-- Manual contributions. Only consulted for tracking_mode = 'manual'; an
-- account-tracked goal reads its balance instead.
CREATE TABLE IF NOT EXISTS goal_contributions (
    id SERIAL PRIMARY KEY,
    goal_id INTEGER NOT NULL REFERENCES user_goals(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    note VARCHAR(140),
    occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal
    ON goal_contributions (goal_id, occurred_on DESC);

COMMENT ON TABLE user_goals IS 'User savings goals with optional local reminders';
COMMENT ON COLUMN user_goals.baseline_amount IS 'Account balance when linked; progress = current_balance - baseline';
COMMENT ON COLUMN user_goals.milestones_notified IS 'Milestone percentages already announced, so each fires once';
COMMENT ON TABLE goal_contributions IS 'Manual contributions for goals not tracked against an account';
