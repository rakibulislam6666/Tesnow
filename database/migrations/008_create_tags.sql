-- ============================================================
-- TESNOW
-- 008_create_tags.sql
-- Tags + Post/Tag many-to-many relationship
-- ============================================================

CREATE TABLE IF NOT EXISTS tags (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,

    description VARCHAR(500) NULL,

    usage_count BIGINT UNSIGNED NOT NULL DEFAULT 0,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_tags_uuid (uuid),
    UNIQUE KEY uq_tags_name (name),
    UNIQUE KEY uq_tags_slug (slug),

    KEY idx_tags_active (is_active),
    KEY idx_tags_usage_count (usage_count),
    KEY idx_tags_deleted_at (deleted_at),

    CONSTRAINT chk_tags_usage_count
        CHECK (usage_count >= 0),

    CONSTRAINT chk_tags_name_length
        CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 100)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- POST ↔ TAG
-- ============================================================

CREATE TABLE IF NOT EXISTS post_tags (
    post_id BIGINT UNSIGNED NOT NULL,

    tag_id BIGINT UNSIGNED NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (post_id, tag_id),

    KEY idx_post_tags_tag (tag_id),
    KEY idx_post_tags_created (created_at),

    CONSTRAINT fk_post_tags_post
        FOREIGN KEY (post_id)
        REFERENCES posts(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_post_tags_tag
        FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;