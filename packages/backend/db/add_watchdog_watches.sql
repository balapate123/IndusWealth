-- ============================================================
-- Watchdog: did the cancellation actually work?
-- ============================================================
--
-- A watch is opened when the user says they cancelled or negotiated something,
-- and resolves on what their account does next. It is the only part of this
-- feature nobody else does well: cancellation instructions are a commodity,
-- being the thing that checks whether the charge stopped is not.
--
-- It is also what makes the savings figure honest. The old hero number summed
-- the amounts of everything a user had *marked* for cancellation plus a discount
-- percentage parsed out of a prose string -- money nobody had saved.
--
-- Idempotent: initDb re-runs the full list on every boot.

CREATE TABLE IF NOT EXISTS watchdog_watches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,

    action VARCHAR(20) NOT NULL CHECK (action IN ('stop', 'negotiate')),

    status VARCHAR(24) NOT NULL DEFAULT 'watching'
        CHECK (status IN ('watching', 'confirmed_stopped', 'charged_again', 'reduced', 'unchanged')),

    -- Charges on or before this date belong to the decision to act, not to its
    -- failure: someone who sees a bill land and cancels that same day was
    -- reacting to it.
    started_at DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Anchored to the detector's day-of-month prediction, not last-seen plus
    -- thirty. A subscription billing on the 14th expects the 14th.
    expected_charge_date DATE NOT NULL,
    cycle_days SMALLINT NOT NULL DEFAULT 30,

    baseline_amount DECIMAL(15, 2) NOT NULL,
    resolved_amount DECIMAL(15, 2),

    -- Only ever what we can show the working for. A watch that was charged
    -- again saved nothing; one still running has saved nothing yet.
    saved_monthly DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Retention credits often land on the following bill, so a negotiation gets
    -- two cycles before we call it a failure.
    cycles_observed SMALLINT NOT NULL DEFAULT 0,

    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Set when the outcome was actually shown to the user, never when it was
    -- merely fetched. Same two-phase protocol as goal milestones: a background
    -- read must not consume the one chance to tell them.
    presented_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- One open watch per expense. Without this, tapping Cancel twice opens two
-- watches and the same stopped charge is counted into confirmed savings twice.
-- Partial rather than a plain unique constraint, because a merchant can be
-- cancelled, resolved, resubscribed and cancelled again -- those are separate
-- cases and all but one of them are closed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchdog_watches_open_per_expense
    ON watchdog_watches (recurring_expense_id)
    WHERE status = 'watching';

CREATE INDEX IF NOT EXISTS idx_watchdog_watches_user_status
    ON watchdog_watches (user_id, status);

-- The unpresented-outcome query runs on every app open.
CREATE INDEX IF NOT EXISTS idx_watchdog_watches_unpresented
    ON watchdog_watches (user_id)
    WHERE presented_at IS NULL AND status <> 'watching';
