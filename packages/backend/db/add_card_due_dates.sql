-- Payment due dates for credit cards and other revolving debt.
--
-- WHY THIS IS USER-ENTERED RATHER THAN FETCHED
--
-- The authoritative source for a card's due date is Plaid's `liabilities`
-- product (credit[].next_payment_due_date). That product is not enabled on our
-- account — services/plaid.js requests `transactions` only, and routes/debt.js
-- already swallows the unsupported-product error and carries on with an empty
-- liabilities object. So there is no due date available to read today.
--
-- When liabilities is granted, the Plaid date takes precedence and what is
-- stored here becomes the fallback. It stays useful either way: liabilities
-- coverage across Canadian institutions is partial, next_payment_due_date is
-- frequently null even where the product works, and a user may want a reminder
-- for a card they have not linked at all.

CREATE TABLE IF NOT EXISTS card_due_dates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- What this reminder is attached to. Explicit rather than inferred from
    -- which of the two columns below is null — the same lesson as
    -- user_goals.tracking_mode. A Plaid account can be disconnected, and an
    -- inferred type would silently re-read the row as a custom debt and point
    -- the reminder at the wrong balance.
    target_type VARCHAR(16) NOT NULL
        CHECK (target_type IN ('plaid_account', 'custom_debt')),

    -- Addressed by the Plaid string id, matching GET /accounts and the flag and
    -- goal endpoints. The numeric accounts.id stays inside the join.
    plaid_account_id VARCHAR(255),
    custom_debt_id INTEGER REFERENCES custom_debts(id) ON DELETE CASCADE,

    -- Day of month the payment is due. Capped at 28 for the same reason as
    -- goal reminders: 29-31 do not exist in every month, and a repeating
    -- monthly trigger on a missing day silently never fires.
    due_day SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 28),

    -- How many days ahead to warn. 0 means only on the due date itself.
    -- Bounded at 14 because a warning further out than half a cycle collides
    -- with the previous month's reminder.
    lead_days SMALLINT NOT NULL DEFAULT 3 CHECK (lead_days BETWEEN 0 AND 14),

    reminder_hour SMALLINT NOT NULL DEFAULT 9 CHECK (reminder_hour BETWEEN 0 AND 23),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Exactly one target, and it must match the declared type. Without this a
    -- row can name both a card and a custom debt, and the join decides which
    -- one wins by accident.
    CONSTRAINT card_due_dates_target_matches_type CHECK (
        (target_type = 'plaid_account' AND plaid_account_id IS NOT NULL AND custom_debt_id IS NULL)
        OR
        (target_type = 'custom_debt' AND custom_debt_id IS NOT NULL AND plaid_account_id IS NULL)
    )
);

-- One reminder per card. Partial unique indexes rather than one over both
-- columns, because NULL is not equal to itself in a unique index and a single
-- combined index would happily allow duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_due_dates_plaid
    ON card_due_dates (user_id, plaid_account_id)
    WHERE plaid_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_due_dates_custom
    ON card_due_dates (user_id, custom_debt_id)
    WHERE custom_debt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_card_due_dates_user
    ON card_due_dates (user_id);

COMMENT ON TABLE card_due_dates IS
    'User-entered credit card payment due dates; source of local due-date reminders';
COMMENT ON COLUMN card_due_dates.target_type IS
    'Explicit target discriminator — never infer it from which FK is null';
COMMENT ON COLUMN card_due_dates.due_day IS
    'Day of month, capped at 28 so a monthly repeating trigger cannot skip February';
