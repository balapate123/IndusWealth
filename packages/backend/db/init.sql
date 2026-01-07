-- IndusWealth Database Schema
-- This file is auto-executed when PostgreSQL container starts

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    plaid_access_token TEXT,
    plaid_item_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table (linked bank accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plaid_account_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    official_name VARCHAR(255),
    type VARCHAR(50),
    subtype VARCHAR(50),
    mask VARCHAR(10),
    current_balance DECIMAL(15, 2),
    available_balance DECIMAL(15, 2),
    iso_currency_code VARCHAR(10) DEFAULT 'CAD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, plaid_account_id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    plaid_transaction_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    merchant_name VARCHAR(255),
    amount DECIMAL(15, 2) NOT NULL,
    date DATE NOT NULL,
    category VARCHAR(255)[],
    pending BOOLEAN DEFAULT FALSE,
    iso_currency_code VARCHAR(10) DEFAULT 'CAD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, plaid_transaction_id)
);

-- Sync log table (tracks last Plaid sync per user)
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    last_transaction_sync TIMESTAMP WITH TIME ZONE,
    last_account_sync TIMESTAMP WITH TIME ZONE,
    last_balance_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Create a test user for development (password: test123)
-- Password hash is bcrypt of 'test123'
INSERT INTO users (email, password_hash, name) 
VALUES ('test@induswealth.com', '$2b$10$rPQvVJ.SqC0zqQHXJxGq8uXQzgYkpV0KQzXZJGxvQY5QwXvVLRZQm', 'Test User')
ON CONFLICT (email) DO NOTHING;

-- Insert sync_log for test user
INSERT INTO sync_log (user_id, last_transaction_sync, last_account_sync)
SELECT id, NULL, NULL FROM users WHERE email = 'test@induswealth.com'
ON CONFLICT (user_id) DO NOTHING;
