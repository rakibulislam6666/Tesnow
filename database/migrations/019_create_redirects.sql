-- Migration: 019_create_redirects
-- Description: URL redirect management for preserving old post/category URLs after slug changes.
-- Engine: InnoDB | Charset: utf8mb4

CREATE TABLE IF NOT EXISTS redirects (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    source_path        VARCHAR(2048) NOT NULL,
    destination_path   VARCHAR(2048) NOT NULL,
    redirect_type      ENUM('301', '302', '307', '308') NOT NULL DEFAULT '301',
    is_active          TINYINT(1) NOT NULL DEFAULT 1,
    hit_count          BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_hit_at        DATETIME DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    -- Generated column: holds source_path only while the redirect is non-deleted,
    -- so the unique index below enforces uniqueness among active/non-deleted rows only
    -- (MariaDB/MySQL treat multiple NULLs in a unique index as distinct).
    active_source_path VARCHAR(2048) GENERATED ALWAYS AS (
        CASE WHEN deleted_at IS NULL THEN source_path ELSE NULL END
    ) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_redirects_uuid (uuid),
    UNIQUE KEY uq_redirects_active_source_path (active_source_path),
    CONSTRAINT chk_redirects_source_path_not_empty
        CHECK (CHAR_LENGTH(source_path) > 0),
    CONSTRAINT chk_redirects_source_path_relative
        CHECK (source_path LIKE '/%' AND source_path NOT LIKE '//%'),
    CONSTRAINT chk_redirects_destination_path_not_empty
        CHECK (CHAR_LENGTH(destination_path) > 0),
    -- Restrict destinations to relative, internal paths to prevent open-redirect vulnerabilities.
    -- External destinations are intentionally not supported by this schema.
    CONSTRAINT chk_redirects_destination_path_relative
        CHECK (destination_path LIKE '/%' AND destination_path NOT LIKE '//%'),
    CONSTRAINT chk_redirects_hit_count_non_negative
        CHECK (hit_count >= 0),
    INDEX idx_redirects_source_path (source_path(191)),
    INDEX idx_redirects_is_active (is_active),
    INDEX idx_redirects_deleted_at (deleted_at),
    INDEX idx_redirects_last_hit_at (last_hit_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
