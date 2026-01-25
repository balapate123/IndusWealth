-- AI Insights System Database Schema
-- Creates tables for storing AI-generated financial insights with caching

-- Table: user_insights
-- Stores generated AI insights with caching metadata
CREATE TABLE IF NOT EXISTS user_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insights JSONB NOT NULL,                    -- Array of insight objects
  summary TEXT,                               -- "5 insights from your last 90 days"
  generated_at TIMESTAMP DEFAULT NOW(),
  cache_expires_at TIMESTAMP,                 -- NOW() + 6 hours
  generation_trigger VARCHAR(50),             -- 'manual_refresh', 'scheduled', 'new_transactions'
  token_count_input INTEGER,                  -- For cost tracking
  token_count_output INTEGER,
  ai_model_used VARCHAR(50),                  -- 'gemini-flash-2.0', 'claude-haiku-4.5'
  generation_time_ms INTEGER,                 -- Performance tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_user_insights_user_cache ON user_insights(user_id, cache_expires_at);
CREATE INDEX IF NOT EXISTS idx_user_insights_expires ON user_insights(cache_expires_at);

-- Table: user_insight_dismissals
-- Tracks which insights users have dismissed to avoid re-showing
CREATE TABLE IF NOT EXISTS user_insight_dismissals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_type VARCHAR(100) NOT NULL,         -- 'tfsa_opportunity', 'subscription_audit'
  insight_fingerprint VARCHAR(255),           -- Hash of key data points
  dismissed_at TIMESTAMP DEFAULT NOW(),
  dismiss_reason VARCHAR(50),                 -- 'not_interested', 'already_done', 'remind_later'
  remind_after TIMESTAMP,                     -- For "remind me in 30 days"

  UNIQUE(user_id, insight_type, insight_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_dismissals_user_type ON user_insight_dismissals(user_id, insight_type);

-- Table: user_preferences
-- Store user preferences for insight personalization
CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  first_time_homebuyer BOOLEAN,               -- null = unknown, true/false = known
  investment_risk_tolerance VARCHAR(20),      -- 'conservative', 'moderate', 'aggressive'
  interested_in_investing BOOLEAN DEFAULT true,
  interested_in_crypto BOOLEAN DEFAULT false,
  preferred_savings_account_type VARCHAR(20), -- 'tfsa', 'rrsp', 'fhsa', 'non_registered'
  email_insights_enabled BOOLEAN DEFAULT false,
  push_insights_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: insight_actions
-- Track which actions users take on insights (analytics)
CREATE TABLE IF NOT EXISTS insight_actions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_id VARCHAR(100) NOT NULL,           -- From insights JSON
  insight_type VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,           -- 'clicked_primary', 'clicked_secondary', 'dismissed'
  action_timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_actions_user ON insight_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_actions_type ON insight_actions(insight_type);

-- Add comment for documentation
COMMENT ON TABLE user_insights IS 'Stores AI-generated financial insights with 6-hour cache duration';
COMMENT ON TABLE user_insight_dismissals IS 'Tracks dismissed insights to prevent re-showing';
COMMENT ON TABLE user_preferences IS 'User preferences for personalizing insight generation';
COMMENT ON TABLE insight_actions IS 'Analytics: tracks user interactions with insights';
