-- ============================================================
-- TESNOW
-- 005_create_posts.sql
-- Core content/posts
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    author_id BIGINT UNSIGNED NOT NULL,

    category_id BIGINT UNSIGNED NULL,

    title VARCHAR(500) NOT NULL,
    slug VARCHAR(255) NOT NULL,

    excerpt TEXT NULL,

    content LONGTEXT NOT NULL,

    featured_image_id BIGINT UNSIGNED NULL,

    status ENUM(
        'draft',
        'review',
        'scheduled',
        'published',
        'archived',
        'trash'
    ) NOT NULL DEFAULT 'draft',

    visibility ENUM(
        'public',
        'private',
        'password'
    ) NOT NULL DEFAULT 'public',

    password_hash VARCHAR(255) NULL,

    published_at DATETIME NULL,
    scheduled_at DATETIME NULL,

    meta_title VARCHAR(255) NULL,
    meta_description VARCHAR(500) NULL,

    canonical_url VARCHAR(2048) NULL,

    view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,

    comment_count BIGINT UNSIGNED NOT NULL DEFAULT 0,

    like_count BIGINT UNSIGNED NOT NULL DEFAULT 0,

    bookmark_count BIGINT UNSIGNED NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_posts_uuid (uuid),
    UNIQUE KEY uq_posts_slug (slug),

    KEY idx_posts_author (author_id),
    KEY idx_posts_category (category_id),
    KEY idx_posts_status (status),
    KEY idx_posts_visibility (visibility),
    KEY idx_posts_published_at (published_at),
    KEY idx_posts_scheduled_at (scheduled_at),
    KEY idx_posts_created_at (created_at),
    KEY idx_posts_deleted_at (deleted_at),

    KEY idx_posts_public_listing
        (status, visibility, published_at),

    CONSTRAINT fk_posts_author
        FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_posts_title_length
        CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 500),

    CONSTRAINT chk_posts_view_count
        CHECK (view_count >= 0),

    CONSTRAINT chk_posts_comment_count
        CHECK (comment_count >= 0),

    CONSTRAINT chk_posts_like_count
        CHECK (like_count >= 0),

    CONSTRAINT chk_posts_bookmark_count
        CHECK (bookmark_count >= 0)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;