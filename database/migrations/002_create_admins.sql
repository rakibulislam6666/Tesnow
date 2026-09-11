-- ============================================================
-- TESNOW
-- 002_create_admins.sql
-- Administrative accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NOT NULL,

    admin_uuid CHAR(36) NOT NULL,

    status ENUM(
        'active',
        'inactive',
        'suspended'
    ) NOT NULL DEFAULT 'active',

    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    two_factor_secret_encrypted VARBINARY(512) NULL,

    last_admin_login_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_admins_user_id (user_id),
    UNIQUE KEY uq_admins_uuid (admin_uuid),

    KEY idx_admins_status (status),
    KEY idx_admins_deleted_at (deleted_at),

    CONSTRAINT fk_admins_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;