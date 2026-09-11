-- Migration: 024_create_feature_flags
-- Description: Feature flag system supporting per-environment rollout and configuration.
-- Engine: InnoDB | Charset: utf8mb4

CREATE TABLE IF NOT EXISTS feature_flags (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    feature_key        VARCHAR(128) NOT NULL,
    name               VARCHAR(255) NOT NULL,
    description        TEXT DEFAULT NULL,
    is_enabled         TINYINT(1) NOT NULL DEFAULT 0,
    rollout_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
    environment        ENUM('development', 'staging', 'production', 'test') NOT NULL,
    configuration      JSON DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_feature_flags_uuid (uuid),
    UNIQUE KEY uq_feature_flags_key_environment (feature_key, environment),
    CONSTRAINT chk_feature_flags_key_not_empty
        CHECK (CHAR_LENGTH(feature_key) > 0),
    CONSTRAINT chk_feature_flags_name_not_empty
        CHECK (CHAR_LENGTH(name) > 0),
    CONSTRAINT chk_feature_flags_rollout_percentage_range
        CHECK (rollout_percentage BETWEEN 0 AND 100),
    INDEX idx_feature_flags_feature_key (feature_key),
    INDEX idx_feature_flags_environment (environment),
    INDEX idx_feature_flags_is_enabled (is_enabled),
    INDEX idx_feature_flags_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
