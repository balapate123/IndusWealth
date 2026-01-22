-- IndusWealth Database Migration: Custom Debts
-- This adds support for manually entered debts that aren't linked to Plaid

-- Custom debts table for user-entered debts
CREATE TABLE IF NOT EXISTS custom_debts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    debt_type VARCHAR(50) DEFAULT 'other', -- 'credit_card', 'line_of_credit', 'personal_loan', 'student_loan', 'other'
    balance DECIMAL(15, 2) NOT NULL,
    apr DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
    min_payment DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_custom_debts_user_id ON custom_debts(user_id);

-- APR overrides for Plaid-linked accounts (so users can edit the APR)
CREATE TABLE IF NOT EXISTS debt_apr_overrides (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plaid_account_id VARCHAR(255) NOT NULL,
    apr DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, plaid_account_id)
);

CREATE INDEX IF NOT EXISTS idx_debt_apr_overrides_user_id ON debt_apr_overrides(user_id);
