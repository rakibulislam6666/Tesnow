-- ============================================================
-- TESNOW
-- 012_create_bookmarks.sql
-- Authenticated user bookmarks
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmarks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    post_id BIGINT UNSIGNED NOT NULL,

    user_id BIGINT UNSIGNED NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_bookmarks_uuid (uuid),

    UNIQUE KEY uq_bookmarks_post_user
        (post_id, user_id),

    KEY idx_bookmarks_user_created
        (user_id, created_at),

    KEY idx_bookmarks_post (post_id),

    CONSTRAINT fk_bookmarks_post
        FOREIGN KEY (post_id)
        REFERENCES posts(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_bookmarks_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;