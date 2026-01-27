-- Add alias column to accounts table
-- This allows users to set custom names for their accounts

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS alias VARCHAR(255);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_alias ON accounts(alias);
