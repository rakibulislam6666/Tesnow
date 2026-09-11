-- Migration: 018_create_settings
-- Description: Creates a flexible application settings/config table. No secret values seeded.
-- Engine: InnoDB | Charset: utf8mb4

-- ============================================================
-- UP MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    setting_key        VARCHAR(128) NOT NULL,
    setting_value      TEXT DEFAULT NULL,
    value_type         ENUM('string', 'integer', 'float', 'boolean', 'json', 'array') NOT NULL DEFAULT 'string',
    description        VARCHAR(255) DEFAULT NULL,
    is_public          TINYINT(1) NOT NULL DEFAULT 0,
    is_editable        TINYINT(1) NOT NULL DEFAULT 1,
    is_encrypted       TINYINT(1) NOT NULL DEFAULT 0,
    category           VARCHAR(64) NOT NULL DEFAULT 'general',
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_settings_uuid (uuid),
    UNIQUE KEY uq_settings_setting_key (setting_key),
    CONSTRAINT chk_settings_key_not_empty
        CHECK (CHAR_LENGTH(setting_key) > 0),
    CONSTRAINT chk_settings_category_not_empty
        CHECK (CHAR_LENGTH(category) > 0),
    INDEX idx_settings_category (category),
    INDEX idx_settings_is_public (is_public),
    INDEX idx_settings_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS settings;
