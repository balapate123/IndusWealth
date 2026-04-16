-- ============================================================
-- Watchdog Subscription Tracking Tables
-- ============================================================

-- recurring_expenses: Detected recurring charges per user
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Merchant identification
    merchant_name VARCHAR(255) NOT NULL,
    merchant_raw_names TEXT[] DEFAULT '{}',

    -- Charge details
    amount DECIMAL(15, 2) NOT NULL,
    amount_history DECIMAL(15, 2)[] DEFAULT '{}',
    currency VARCHAR(10) DEFAULT 'CAD',

    -- Recurrence pattern
    frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
    interval_days INTEGER,
    confidence VARCHAR(10) NOT NULL DEFAULT 'medium',

    -- Category
    category VARCHAR(50) NOT NULL DEFAULT 'Other',

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    action VARCHAR(20) DEFAULT NULL,

    -- Dates
    first_seen DATE NOT NULL,
    last_seen DATE NOT NULL,
    next_expected DATE,
    snoozed_until DATE,

    -- Alert flags
    flags JSONB DEFAULT '[]',

    -- Metadata
    plaid_transaction_ids TEXT[] DEFAULT '{}',
    detection_metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, merchant_name)
);

-- subscription_actions: Audit trail of user actions on expenses
CREATE TABLE IF NOT EXISTS subscription_actions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,
    previous_status VARCHAR(20),
    notes TEXT,
    snooze_until DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- subscription_alerts: Proactive alerts/notifications
CREATE TABLE IF NOT EXISTS subscription_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_expense_id INTEGER REFERENCES recurring_expenses(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- watchdog_analysis_cache: Cache detection results
CREATE TABLE IF NOT EXISTS watchdog_analysis_cache (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    last_analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_transaction_date DATE,
    transaction_count INTEGER,
    analysis_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user ON recurring_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_status ON recurring_expenses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_actions_expense ON subscription_actions(recurring_expense_id);
CREATE INDEX IF NOT EXISTS idx_subscription_alerts_user ON subscription_alerts(user_id, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_watchdog_cache_user ON watchdog_analysis_cache(user_id);
