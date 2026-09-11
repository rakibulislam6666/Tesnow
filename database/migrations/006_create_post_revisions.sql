-- ============================================================
-- TESNOW
-- 006_create_post_revisions.sql
-- Post revision history
-- ============================================================

CREATE TABLE IF NOT EXISTS post_revisions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    post_id BIGINT UNSIGNED NOT NULL,

    editor_id BIGINT UNSIGNED NOT NULL,

    revision_number INT UNSIGNED NOT NULL,

    title VARCHAR(500) NOT NULL,

    slug VARCHAR(255) NOT NULL,

    excerpt TEXT NULL,

    content LONGTEXT NOT NULL,

    status ENUM(
        'draft',
        'review',
        'scheduled',
        'published',
        'archived',
        'trash'
    ) NOT NULL DEFAULT 'draft',

    change_summary VARCHAR(500) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_post_revisions_uuid (uuid),

    UNIQUE KEY uq_post_revision_number
        (post_id, revision_number),

    KEY idx_post_revisions_post
        (post_id),

    KEY idx_post_revisions_editor
        (editor_id),

    KEY idx_post_revisions_created
        (created_at),

    CONSTRAINT fk_post_revisions_post
        FOREIGN KEY (post_id)
        REFERENCES posts(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_post_revisions_editor
        FOREIGN KEY (editor_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_post_revisions_number
        CHECK (revision_number > 0),

    CONSTRAINT chk_post_revisions_title_length
        CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 500)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;