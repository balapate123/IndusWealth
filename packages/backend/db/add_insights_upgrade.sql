-- AI Insights Upgrade Migration
-- Adds health score tracking, ETF interactions, and enhanced article support

-- 1. Add health score columns to user_insights
ALTER TABLE user_insights
    ADD COLUMN IF NOT EXISTS health_score INTEGER,
    ADD COLUMN IF NOT EXISTS health_score_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS health_score_trend VARCHAR(20);

-- 2. Add source_type to educational_articles
ALTER TABLE educational_articles
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'ai_generated',
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'beginner',
    ADD COLUMN IF NOT EXISTS url_status VARCHAR(20) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- Index for source_type filtering
CREATE INDEX IF NOT EXISTS idx_educational_articles_source_type
    ON educational_articles(source_type);

-- 3. ETF interaction tracking (for analytics)
CREATE TABLE IF NOT EXISTS etf_interactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    etf_ticker VARCHAR(10) NOT NULL,
    interaction_type VARCHAR(30) NOT NULL,
    source VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etf_interactions_user ON etf_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_etf_interactions_ticker ON etf_interactions(etf_ticker);

-- 4. Health score history (for trend tracking)
CREATE TABLE IF NOT EXISTS health_score_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    grade VARCHAR(2) NOT NULL,
    breakdown JSONB NOT NULL,
    calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_score_user ON health_score_history(user_id, calculated_at);

-- 5. Add new preference columns
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS age_range VARCHAR(20),
    ADD COLUMN IF NOT EXISTS investment_experience VARCHAR(20) DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS annual_income_range VARCHAR(20);

-- Comments
COMMENT ON TABLE etf_interactions IS 'Tracks user interactions with ETF recommendations for analytics';
COMMENT ON TABLE health_score_history IS 'Historical financial health scores for trend analysis';
