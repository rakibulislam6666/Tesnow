-- ============================================================
-- TESNOW
-- 025_create_admin_roles.sql
-- Many-to-many relationship between administrators and roles
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_roles (
    admin_id BIGINT UNSIGNED NOT NULL,
    role_id  BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (admin_id, role_id),

    KEY idx_admin_roles_role_id (role_id),

    CONSTRAINT fk_admin_roles_admin
        FOREIGN KEY (admin_id)
        REFERENCES admins(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_admin_roles_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;