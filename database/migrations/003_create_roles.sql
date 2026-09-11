-- ============================================================
-- TESNOW
-- 003_create_roles.sql
-- Role-based access control
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,

    description VARCHAR(500) NULL,

    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_roles_uuid (uuid),
    UNIQUE KEY uq_roles_name (name),
    UNIQUE KEY uq_roles_slug (slug),

    KEY idx_roles_system (is_system_role),
    KEY idx_roles_deleted_at (deleted_at)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;