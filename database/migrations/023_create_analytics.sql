-- Migration: 023_create_analytics
-- Description: Privacy-conscious event/analytics tracking (page views, post views, engagement events).
-- Engine: InnoDB | Charset: utf8mb4
-- No raw IP addresses, session tokens, or user agents are stored -- only their hashes.

CREATE TABLE IF NOT EXISTS analytics_events (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    event_type         VARCHAR(64) NOT NULL,
    user_id            BIGINT UNSIGNED DEFAULT NULL,
    post_id            BIGINT UNSIGNED DEFAULT NULL,
    session_hash       CHAR(64) DEFAULT NULL,
    visitor_hash       CHAR(64) DEFAULT NULL,
    ip_hash            CHAR(64) DEFAULT NULL,
    user_agent_hash    CHAR(64) DEFAULT NULL,
    referrer           VARCHAR(2048) DEFAULT NULL,
    path               VARCHAR(2048) DEFAULT NULL,
    metadata           JSON DEFAULT NULL,
    occurred_at        DATETIME NOT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_analytics_events_uuid (uuid),
    CONSTRAINT fk_analytics_events_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_analytics_events_post_id
        FOREIGN KEY (post_id) REFERENCES posts (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT chk_analytics_events_type_not_empty
        CHECK (CHAR_LENGTH(event_type) > 0),
    INDEX idx_analytics_events_event_type (event_type),
    INDEX idx_analytics_events_post_id (post_id),
    INDEX idx_analytics_events_user_id (user_id),
    INDEX idx_analytics_events_occurred_at (occurred_at),
    INDEX idx_analytics_events_session_hash (session_hash),
    INDEX idx_analytics_events_visitor_hash (visitor_hash),
    INDEX idx_analytics_events_type_occurred (event_type, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
