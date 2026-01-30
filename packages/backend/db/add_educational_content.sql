-- Educational Content System Database Schema
-- Creates tables for storing educational articles, bookmarks, and insight-article associations

-- Table: educational_articles
-- Cached educational articles with metadata extracted from URLs
CREATE TABLE IF NOT EXISTS educational_articles (
    id SERIAL PRIMARY KEY,
    external_url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    source_name TEXT,
    category TEXT,  -- 'budgeting', 'investing', 'debt', 'taxes', 'savings', 'general'
    read_time_minutes INTEGER,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_educational_articles_category ON educational_articles(category);
CREATE INDEX IF NOT EXISTS idx_educational_articles_expires ON educational_articles(expires_at);

-- Table: user_article_bookmarks
-- User bookmarks for saved articles
CREATE TABLE IF NOT EXISTS user_article_bookmarks (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    article_id INTEGER REFERENCES educational_articles(id) ON DELETE CASCADE,
    bookmarked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_article_bookmarks(user_id);

-- Table: insight_articles
-- Links insight types to related educational articles
CREATE TABLE IF NOT EXISTS insight_articles (
    insight_type TEXT NOT NULL,  -- matches insight category from AI
    article_id INTEGER REFERENCES educational_articles(id) ON DELETE CASCADE,
    relevance_score FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (insight_type, article_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_articles_type ON insight_articles(insight_type);

-- Add comments for documentation
COMMENT ON TABLE educational_articles IS 'Cached educational articles with metadata for Wealth Academy';
COMMENT ON TABLE user_article_bookmarks IS 'User-saved articles for later reading';
COMMENT ON TABLE insight_articles IS 'Links AI insight types to relevant educational content';
