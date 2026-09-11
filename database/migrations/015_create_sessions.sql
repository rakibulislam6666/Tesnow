-- Migration: 015_create_sessions
-- Description: Creates secure application session storage. No raw tokens/IPs are stored, only hashes.
-- Engine: InnoDB | Charset: utf8mb4

-- ============================================================
-- UP MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_identifier CHAR(64) NOT NULL,
    user_id            BIGINT UNSIGNED DEFAULT NULL,
    session_token_hash CHAR(64) NOT NULL,
    ip_hash            CHAR(64) DEFAULT NULL,
    user_agent_hash    CHAR(64) DEFAULT NULL,
    device_type        VARCHAR(64) DEFAULT NULL,
    device_name        VARCHAR(128) DEFAULT NULL,
    platform           VARCHAR(64) DEFAULT NULL,
    is_remember_me     TINYINT(1) NOT NULL DEFAULT 0,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at         DATETIME NOT NULL,
    revoked_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_session_identifier (session_identifier),
    CONSTRAINT fk_sessions_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT chk_sessions_expires_after_created
        CHECK (expires_at > created_at),
    INDEX idx_sessions_user_id (user_id),
    INDEX idx_sessions_active (user_id, revoked_at, expires_at),
    INDEX idx_sessions_expiration_cleanup (expires_at),
    INDEX idx_sessions_token_hash (session_token_hash),
    INDEX idx_sessions_last_activity (last_activity_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS sessions;
