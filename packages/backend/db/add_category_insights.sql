-- Cache for AI-generated Advanced Analytics category insights
-- One row per user per period; refreshed when cache_expires_at passes
CREATE TABLE IF NOT EXISTS category_ai_insights (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_days INTEGER NOT NULL,
    insights JSONB NOT NULL,
    ai_model_used VARCHAR(100),
    generated_at TIMESTAMP DEFAULT NOW(),
    cache_expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, period_days)
);
