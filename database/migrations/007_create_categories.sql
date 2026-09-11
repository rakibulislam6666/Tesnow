-- ============================================================
-- TESNOW
-- 007_create_categories.sql
-- Categories + hierarchical category support
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    parent_id BIGINT UNSIGNED NULL,

    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,

    description VARCHAR(500) NULL,

    sort_order INT UNSIGNED NOT NULL DEFAULT 0,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_categories_uuid (uuid),
    UNIQUE KEY uq_categories_slug (slug),

    KEY idx_categories_parent (parent_id),
    KEY idx_categories_active (is_active),
    KEY idx_categories_sort_order (sort_order),
    KEY idx_categories_deleted_at (deleted_at),

    CONSTRAINT fk_categories_parent
        FOREIGN KEY (parent_id)
        REFERENCES categories(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_categories_sort_order
        CHECK (sort_order >= 0),

    CONSTRAINT chk_categories_name_length
        CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 150)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Connect posts.category_id -> categories.id
-- ============================================================

ALTER TABLE posts
    ADD CONSTRAINT fk_posts_category
        FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;