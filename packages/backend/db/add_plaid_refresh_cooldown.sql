-- Migration: Add last_plaid_refresh column to sync_log
-- Purpose: Track when a user last triggered a manual Plaid refresh (force-sync)
-- so we can enforce a per-user cooldown and avoid excessive Transactions Refresh API charges ($0.12/call)

ALTER TABLE sync_log
    ADD COLUMN IF NOT EXISTS last_plaid_refresh TIMESTAMPTZ;
