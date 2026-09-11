-- Migration: 016_create_security_events
-- Description: Creates a security event/monitoring table. Stores hashes and metadata only, never secrets.
-- Engine: InnoDB | Charset: utf8mb4

-- ============================================================
-- UP MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS security_events (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    user_id            BIGINT UNSIGNED DEFAULT NULL,
    event_type         VARCHAR(64) NOT NULL,
    severity           ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'info',
    is_success         TINYINT(1) NOT NULL DEFAULT 1,
    ip_hash            CHAR(64) DEFAULT NULL,
    user_agent_hash    CHAR(64) DEFAULT NULL,
    request_id         CHAR(36) DEFAULT NULL,
    metadata           JSON DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_security_events_uuid (uuid),
    CONSTRAINT fk_security_events_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT chk_security_events_type_not_empty
        CHECK (CHAR_LENGTH(event_type) > 0),
    INDEX idx_security_events_user_id (user_id),
    INDEX idx_security_events_type (event_type),
    INDEX idx_security_events_severity (severity),
    INDEX idx_security_events_success (is_success),
    INDEX idx_security_events_request_id (request_id),
    INDEX idx_security_events_created_at (created_at),
    INDEX idx_security_events_investigation (event_type, severity, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS security_events;
