-- ============================================================
-- TESNOW
-- 009_create_media.sql
-- Media / file storage metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS media (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    uuid CHAR(36) NOT NULL,

    owner_id BIGINT UNSIGNED NULL,

    original_name VARCHAR(255) NOT NULL,

    storage_key VARCHAR(1024) NOT NULL,

    storage_disk VARCHAR(50) NOT NULL DEFAULT 'local',

    mime_type VARCHAR(255) NOT NULL,

    file_extension VARCHAR(20) NULL,

    file_size BIGINT UNSIGNED NOT NULL,

    width INT UNSIGNED NULL,
    height INT UNSIGNED NULL,

    duration_seconds DECIMAL(12,3) NULL,

    alt_text VARCHAR(500) NULL,

    title VARCHAR(255) NULL,

    caption TEXT NULL,

    metadata JSON NULL,

    media_type ENUM(
        'image',
        'video',
        'audio',
        'document',
        'other'
    ) NOT NULL DEFAULT 'other',

    status ENUM(
        'processing',
        'ready',
        'failed',
        'deleted'
    ) NOT NULL DEFAULT 'processing',

    checksum_sha256 CHAR(64) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_media_uuid (uuid),

    UNIQUE KEY uq_media_storage_key (storage_disk, storage_key),

    KEY idx_media_owner (owner_id),
    KEY idx_media_type (media_type),
    KEY idx_media_status (status),
    KEY idx_media_mime_type (mime_type),
    KEY idx_media_checksum (checksum_sha256),
    KEY idx_media_created_at (created_at),
    KEY idx_media_deleted_at (deleted_at),

    CONSTRAINT fk_media_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_media_file_size
        CHECK (file_size >= 0),

    CONSTRAINT chk_media_width
        CHECK (width IS NULL OR width > 0),

    CONSTRAINT chk_media_height
        CHECK (height IS NULL OR height > 0),

    CONSTRAINT chk_media_duration
        CHECK (
            duration_seconds IS NULL
            OR duration_seconds >= 0
        ),

    CONSTRAINT chk_media_checksum
        CHECK (
            checksum_sha256 IS NULL
            OR checksum_sha256 REGEXP '^[A-Fa-f0-9]{64}$'
        )

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Connect posts.featured_image_id -> media.id
-- ============================================================

ALTER TABLE posts
    ADD KEY idx_posts_featured_image (featured_image_id);

ALTER TABLE posts
    ADD CONSTRAINT fk_posts_featured_image
        FOREIGN KEY (featured_image_id)
        REFERENCES media(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;