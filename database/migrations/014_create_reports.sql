-- Migration: 014_create_reports
-- Description: Creates a reporting/moderation table for posts, comments, users, and media.
-- Engine: InnoDB | Charset: utf8mb4

-- ============================================================
-- UP MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    reporter_user_id   BIGINT UNSIGNED NOT NULL,
    target_type        ENUM('post', 'comment', 'user', 'media') NOT NULL,
    target_id          BIGINT UNSIGNED NOT NULL,
    report_type        VARCHAR(64) NOT NULL,
    reason             VARCHAR(255) NOT NULL,
    description        TEXT DEFAULT NULL,
    status             ENUM('pending', 'in_review', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
    handled_by_admin_id BIGINT UNSIGNED DEFAULT NULL,
    resolution_note    TEXT DEFAULT NULL,
    resolved_at        DATETIME DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reports_uuid (uuid),
    CONSTRAINT fk_reports_reporter_user_id
        FOREIGN KEY (reporter_user_id) REFERENCES users (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_reports_handled_by_admin_id
        FOREIGN KEY (handled_by_admin_id) REFERENCES admins (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT chk_reports_reason_not_empty
        CHECK (CHAR_LENGTH(reason) > 0),
    CONSTRAINT chk_reports_report_type_not_empty
        CHECK (CHAR_LENGTH(report_type) > 0),
    CONSTRAINT chk_reports_resolution_consistency
        CHECK (
            (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL)
            OR (status IN ('pending', 'in_review'))
        ),
    INDEX idx_reports_target (target_type, target_id),
    INDEX idx_reports_reporter (reporter_user_id),
    INDEX idx_reports_status (status),
    INDEX idx_reports_handled_by (handled_by_admin_id),
    INDEX idx_reports_created_at (created_at),
    INDEX idx_reports_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS reports;
