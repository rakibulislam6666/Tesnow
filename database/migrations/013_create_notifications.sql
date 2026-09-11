-- Migration: 013_create_notifications
-- Description: Creates the notifications table for user-facing notification feeds.
-- Engine: InnoDB | Charset: utf8mb4

-- ============================================================
-- UP MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    user_id            BIGINT UNSIGNED NOT NULL,
    type               VARCHAR(64) NOT NULL,
    title              VARCHAR(255) NOT NULL,
    message            TEXT NOT NULL,
    related_entity_type VARCHAR(64) DEFAULT NULL,
    related_entity_id  BIGINT UNSIGNED DEFAULT NULL,
    action_url         VARCHAR(2048) DEFAULT NULL,
    is_read            TINYINT(1) NOT NULL DEFAULT 0,
    read_at            DATETIME DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notifications_uuid (uuid),
    CONSTRAINT fk_notifications_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT chk_notifications_type_not_empty
        CHECK (CHAR_LENGTH(type) > 0),
    CONSTRAINT chk_notifications_title_not_empty
        CHECK (CHAR_LENGTH(title) > 0),
    CONSTRAINT chk_notifications_read_at_consistency
        CHECK (
            (is_read = 0 AND read_at IS NULL)
            OR (is_read = 1)
        ),
    INDEX idx_notifications_user_feed (user_id, created_at, deleted_at),
    INDEX idx_notifications_user_unread (user_id, is_read, deleted_at),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_related_entity (related_entity_type, related_entity_id),
    INDEX idx_notifications_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS notifications;
