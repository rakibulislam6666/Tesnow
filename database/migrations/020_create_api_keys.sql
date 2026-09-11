-- Migration: 020_create_api_keys
-- Description: Secure API key management. Only cryptographic hashes of keys are stored, never plaintext.
-- Engine: InnoDB | Charset: utf8mb4

CREATE TABLE IF NOT EXISTS api_keys (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    user_id            BIGINT UNSIGNED DEFAULT NULL,
    name               VARCHAR(128) NOT NULL,
    key_prefix         VARCHAR(16) NOT NULL,
    key_hash           CHAR(64) NOT NULL,
    scopes             JSON DEFAULT NULL,
    last_used_at       DATETIME DEFAULT NULL,
    expires_at         DATETIME DEFAULT NULL,
    revoked_at         DATETIME DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_api_keys_uuid (uuid),
    UNIQUE KEY uq_api_keys_key_hash (key_hash),
    CONSTRAINT fk_api_keys_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT chk_api_keys_name_not_empty
        CHECK (CHAR_LENGTH(name) > 0),
    CONSTRAINT chk_api_keys_key_prefix_not_empty
        CHECK (CHAR_LENGTH(key_prefix) > 0),
    CONSTRAINT chk_api_keys_key_hash_length
        CHECK (CHAR_LENGTH(key_hash) = 64),
    CONSTRAINT chk_api_keys_expires_after_created
        CHECK (expires_at IS NULL OR expires_at > created_at),
    INDEX idx_api_keys_user_id (user_id),
    INDEX idx_api_keys_key_prefix (key_prefix),
    INDEX idx_api_keys_expires_at (expires_at),
    INDEX idx_api_keys_revoked_at (revoked_at),
    INDEX idx_api_keys_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
