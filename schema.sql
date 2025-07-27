-- CCC Facebook Generator Database Schema
-- Run with: wrangler d1 execute <database-name> --file=schema.sql

-- Content table for storing generated content metadata
CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('image', 'video', 'text', 'meme', 'story')),
    source TEXT, -- Original source if scraped content
    source_url TEXT,
    prompt TEXT,
    generated_content_url TEXT, -- R2 URL for generated media
    caption TEXT,
    hashtags TEXT, -- JSON array of hashtags
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'approved', 'rejected', 'scheduled', 'posted', 'failed')),
    ai_provider TEXT, -- openai, anthropic, runway, etc.
    generation_metadata TEXT, -- JSON metadata from AI generation
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    scheduled_at DATETIME,
    posted_at DATETIME
);

-- Performance metrics for tracking engagement
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    fb_post_id TEXT,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    reactions_love INTEGER DEFAULT 0,
    reactions_haha INTEGER DEFAULT 0,
    reactions_wow INTEGER DEFAULT 0,
    reactions_sad INTEGER DEFAULT 0,
    reactions_angry INTEGER DEFAULT 0,
    engagement_rate REAL DEFAULT 0.0,
    reach INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    click_through_rate REAL DEFAULT 0.0,
    measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_id) REFERENCES content(id)
);

-- Source tracking for content discovery
CREATE TABLE IF NOT EXISTS source_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK (source_type IN ('reddit', 'twitter', 'news', 'web_scrape')),
    source_name TEXT NOT NULL, -- subreddit name, twitter handle, etc.
    source_url TEXT NOT NULL,
    last_scraped DATETIME DEFAULT CURRENT_TIMESTAMP,
    content_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    is_active BOOLEAN DEFAULT TRUE
);

-- Scheduling queue for managing post timing
CREATE TABLE IF NOT EXISTS scheduling_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL,
    fb_post_id TEXT, -- Set after successful scheduling with Facebook
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'scheduled', 'posting', 'posted', 'failed', 'cancelled')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_id) REFERENCES content(id)
);

-- User feedback and moderation
CREATE TABLE IF NOT EXISTS content_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('like', 'dislike', 'report', 'suggestion')),
    feedback_text TEXT,
    user_identifier TEXT, -- IP hash or session ID for tracking
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_id) REFERENCES content(id)
);

-- AI generation logs for monitoring and optimization
CREATE TABLE IF NOT EXISTS generation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    generation_time_ms INTEGER,
    token_usage INTEGER,
    cost_usd REAL,
    quality_score REAL, -- 1-10 quality rating
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'timeout', 'rate_limited')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_id) REFERENCES content(id)
);

-- Configuration settings stored in database
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Error logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    context TEXT, -- JSON context data
    error_details TEXT, -- JSON error details
    request_id TEXT,
    user_id TEXT,
    content_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Content categories and tagging
CREATE TABLE IF NOT EXISTS content_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    confidence REAL DEFAULT 1.0, -- AI confidence in tag accuracy
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_id) REFERENCES content(id)
);

-- Rate limiting and quota tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    requests_count INTEGER DEFAULT 1,
    tokens_used INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    rate_limit_reset DATETIME,
    date DATE DEFAULT (DATE('now')),
    hour INTEGER DEFAULT (CAST(strftime('%H', 'now') AS INTEGER))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_created_at ON content(created_at);
CREATE INDEX IF NOT EXISTS idx_content_scheduled_at ON content(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduling_queue_scheduled_time ON scheduling_queue(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduling_queue_status ON scheduling_queue(status);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_content_id ON performance_metrics(content_id);
CREATE INDEX IF NOT EXISTS idx_source_tracking_type ON source_tracking(source_type);
CREATE INDEX IF NOT EXISTS idx_content_tags_content_id ON content_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag ON content_tags(tag);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider_date ON api_usage(provider, date);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);

-- Insert default configuration
INSERT OR IGNORE INTO app_config (key, value, description) VALUES 
('posting_schedule_morning', '08:00', 'Morning posting time'),
('posting_schedule_afternoon', '14:00', 'Afternoon posting time'),
('posting_schedule_evening', '20:00', 'Evening posting time'),
('max_daily_posts', '6', 'Maximum posts per day'),
('content_approval_required', 'false', 'Whether content needs manual approval'),
('ai_generation_timeout_ms', '30000', 'AI generation timeout in milliseconds'),
('max_retry_attempts', '3', 'Maximum retry attempts for failed operations'),
('engagement_threshold', '0.05', 'Minimum engagement rate for content success');

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_content_timestamp 
    AFTER UPDATE ON content
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE content SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_scheduling_queue_timestamp 
    AFTER UPDATE ON scheduling_queue
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE scheduling_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;