-- ============================================================
-- TESNOW
-- 001_create_users.sql
-- Core application users
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    username VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,

    avatar_url VARCHAR(2048) NULL,
    bio VARCHAR(1000) NULL,

    status ENUM(
        'active',
        'inactive',
        'suspended',
        'banned',
        'pending'
    ) NOT NULL DEFAULT 'active',

    email_verified_at DATETIME NULL,
    last_login_at DATETIME NULL,

    failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_users_uuid (uuid),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),

    KEY idx_users_status (status),
    KEY idx_users_email_verified (email_verified_at),
    KEY idx_users_last_login (last_login_at),
    KEY idx_users_deleted_at (deleted_at),

    CONSTRAINT chk_users_username_length
        CHECK (CHAR_LENGTH(username) BETWEEN 3 AND 50),

    CONSTRAINT chk_users_email_length
        CHECK (CHAR_LENGTH(email) BETWEEN 5 AND 255),

    CONSTRAINT chk_users_failed_login
        CHECK (failed_login_attempts >= 0)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;