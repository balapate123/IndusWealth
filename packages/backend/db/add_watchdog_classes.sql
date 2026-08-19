-- ============================================================
-- Watchdog: expense classes, slug guide keys, and stored evidence
-- ============================================================
--
-- The screen splits into three sections whose subheads state the action model:
--   Subscriptions    "You can cancel these."
--   Bills            "You can often lower these."
--   Fixed payments   "Here so you can plan around them."
--
-- The class is stored explicitly rather than inferred from the category, for
-- the same reason user_goals.tracking_mode is a column: an inferred class
-- silently flips when the data behind it changes, and a Cancel button rendered
-- next to a mortgage payment is not a defect anyone reports, they just stop
-- trusting the screen.
--
-- Idempotent — initDb re-runs the full migration list on every boot.

ALTER TABLE recurring_expenses
    ADD COLUMN IF NOT EXISTS expense_class VARCHAR(20) NOT NULL DEFAULT 'subscription';

-- The slug that finds this merchant's cancellation guide. Stored so the lookup
-- is stable even if the display name is re-normalised later; NULL means we hold
-- no merchant-specific guide and the sheet falls back to category or generic
-- guidance. It never falls back to nothing.
ALTER TABLE recurring_expenses
    ADD COLUMN IF NOT EXISTS guide_key VARCHAR(80);

-- The plain-language line shown under the merchant name, replacing the
-- unlabelled confidence dots: "Charged on the 14th, 4 months running".
ALTER TABLE recurring_expenses
    ADD COLUMN IF NOT EXISTS evidence VARCHAR(120);

-- The day of the month the charge is anchored to. The detector matches on this
-- rather than on an interval band, and the watch loop predicts the next charge
-- from it -- last date plus thirty days lands on Aug 13 for a subscription that
-- bills on the 14th, and would resolve the watch a day early.
ALTER TABLE recurring_expenses
    ADD COLUMN IF NOT EXISTS day_of_month SMALLINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'recurring_expenses_class_check'
    ) THEN
        ALTER TABLE recurring_expenses
            ADD CONSTRAINT recurring_expenses_class_check
            CHECK (expense_class IN ('subscription', 'bill', 'fixed'));
    END IF;
END $$;

-- Sections are rendered in class order, then by amount.
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_class
    ON recurring_expenses (user_id, expense_class);
