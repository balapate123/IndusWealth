-- Plaid reports three balances per account, and we were storing only two.
--
-- For a credit card or line of credit the third is the one that matters:
--   balances.current   = what is owed
--   balances.available = credit still available to spend
--   balances.limit     = the credit limit          <- was dropped on the floor
--
-- Without the limit there is no way to show how much of the card is used, which
-- is the number people actually look for on a credit account.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15, 2);

COMMENT ON COLUMN accounts.credit_limit IS
    'Plaid balances.limit — the credit limit for credit/loan accounts; NULL for depository';
