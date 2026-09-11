-- ============================================================
-- TESNOW
-- 010_create_comments.sql
-- User + guest comments with nested replies
-- MariaDB 12.3.x compatible
-- ============================================================

CREATE TABLE IF NOT EXISTS comments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    post_id BIGINT UNSIGNED NOT NULL,

    user_id BIGINT UNSIGNED NULL,

    parent_id BIGINT UNSIGNED NULL,

    guest_name VARCHAR(100) NULL,

    guest_email VARCHAR(255) NULL,

    content TEXT NOT NULL,

    status ENUM(
        'pending',
        'approved',
        'rejected',
        'spam',
        'trash'
    ) NOT NULL DEFAULT 'pending',

    ip_hash CHAR(64) NULL,

    user_agent_hash CHAR(64) NULL,

    edited_at DATETIME NULL,

    approved_at DATETIME NULL,

    approved_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_comments_uuid (uuid),

    KEY idx_comments_post_status
        (post_id, status, created_at),

    KEY idx_comments_user (user_id),

    KEY idx_comments_parent (parent_id),

    KEY idx_comments_status (status),

    KEY idx_comments_approved_by (approved_by),

    KEY idx_comments_created_at (created_at),

    KEY idx_comments_deleted_at (deleted_at),

    CONSTRAINT fk_comments_post
        FOREIGN KEY (post_id)
        REFERENCES posts(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_comments_parent
        FOREIGN KEY (parent_id)
        REFERENCES comments(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_comments_content_length
        CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 10000),

    CONSTRAINT chk_comments_guest_email
        CHECK (
            guest_email IS NULL
            OR CHAR_LENGTH(guest_email) BETWEEN 5 AND 255
        ),

    CONSTRAINT chk_comments_ip_hash
        CHECK (
            ip_hash IS NULL
            OR ip_hash REGEXP '^[A-Fa-f0-9]{64}$'
        ),

    CONSTRAINT chk_comments_user_agent_hash
        CHECK (
            user_agent_hash IS NULL
            OR user_agent_hash REGEXP '^[A-Fa-f0-9]{64}$'
        )

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;