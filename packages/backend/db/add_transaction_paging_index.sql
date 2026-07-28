-- Supports the paged transaction list: filter by user, window by date, order by
-- date DESC then id DESC, and count the matching rows.
--
-- The existing indexes are on user_id and on date separately, so neither can
-- serve that combination — Postgres falls back to scanning one and filtering the
-- rest, which the COUNT(*) behind "load more" pays for on every page.
--
-- id is part of the key because it is the ORDER BY tiebreaker. Without it, two
-- transactions on the same date have no defined order between pages, and a row
-- can be shown twice or skipped as the offset moves past them.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_id
    ON transactions (user_id, date DESC, id DESC);
