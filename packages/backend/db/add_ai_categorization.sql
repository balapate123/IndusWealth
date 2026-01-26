-- Migration: Add AI Categorization Support
-- Description: Creates tables for merchant category caching and AI usage tracking
-- Date: 2026-01-25

-- Table 1: Merchant Category Cache
-- Stores AI-categorized merchant → category mappings for fast lookup
CREATE TABLE IF NOT EXISTS merchant_category_cache (
    id SERIAL PRIMARY KEY,
    merchant_normalized VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL,
    category_icon VARCHAR(50),
    category_color VARCHAR(20),
    confidence_score DECIMAL(3,2),

    -- Metadata
    ai_model_used VARCHAR(50),
    categorized_at TIMESTAMP DEFAULT NOW(),
    cache_expires_at TIMESTAMP,
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,

    -- Learning fields (for Phase 2 user feedback)
    user_override_category VARCHAR(100),
    override_count INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for merchant_category_cache
CREATE INDEX IF NOT EXISTS idx_merchant_category_normalized ON merchant_category_cache(merchant_normalized);
CREATE INDEX IF NOT EXISTS idx_merchant_category_expires ON merchant_category_cache(cache_expires_at);
CREATE INDEX IF NOT EXISTS idx_merchant_category_usage ON merchant_category_cache(times_used DESC);

-- Table 2: AI Categorization Log
-- Tracks AI API calls for cost monitoring and analytics
CREATE TABLE IF NOT EXISTS ai_categorization_log (
    id SERIAL PRIMARY KEY,
    request_id UUID DEFAULT gen_random_uuid(),
    merchant_count INTEGER NOT NULL,
    token_count_input INTEGER,
    token_count_output INTEGER,
    ai_model_used VARCHAR(50),
    generation_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ai_categorization_log
CREATE INDEX IF NOT EXISTS idx_ai_categorization_date ON ai_categorization_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_categorization_request ON ai_categorization_log(request_id);

-- Comments for documentation
COMMENT ON TABLE merchant_category_cache IS 'Caches AI-generated merchant categorizations to reduce API costs';
COMMENT ON TABLE ai_categorization_log IS 'Logs AI API calls for cost monitoring and performance tracking';

COMMENT ON COLUMN merchant_category_cache.merchant_normalized IS 'Normalized merchant name (uppercase, no store numbers)';
COMMENT ON COLUMN merchant_category_cache.cache_expires_at IS 'NULL = never expires, otherwise TTL expiration timestamp';
COMMENT ON COLUMN merchant_category_cache.user_override_category IS 'User-corrected category (Phase 2 feature)';
COMMENT ON COLUMN merchant_category_cache.override_count IS 'Number of times users have corrected this category';
