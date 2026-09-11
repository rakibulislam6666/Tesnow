-- Migration: 022_create_newsletter
-- Description: Newsletter subscriber management with hashed verification/unsubscribe tokens.
-- Engine: InnoDB | Charset: utf8mb4
-- Note: utf8mb4_unicode_ci is a case-insensitive collation, so the UNIQUE KEY on email
-- below already enforces case-insensitive uniqueness without a separate normalized column.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid                     CHAR(36) NOT NULL,
    email                    VARCHAR(255) NOT NULL,
    status                   ENUM('pending', 'active', 'unsubscribed', 'bounced', 'blocked') NOT NULL DEFAULT 'pending',
    verification_token_hash  CHAR(64) DEFAULT NULL,
    verified_at              DATETIME DEFAULT NULL,
    unsubscribe_token_hash   CHAR(64) DEFAULT NULL,
    unsubscribed_at          DATETIME DEFAULT NULL,
    source                   VARCHAR(64) DEFAULT NULL,
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at               DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_newsletter_subscribers_uuid (uuid),
    UNIQUE KEY uq_newsletter_subscribers_email (email),
    UNIQUE KEY uq_newsletter_subscribers_verification_token_hash (verification_token_hash),
    UNIQUE KEY uq_newsletter_subscribers_unsubscribe_token_hash (unsubscribe_token_hash),
    CONSTRAINT chk_newsletter_subscribers_email_length
        CHECK (CHAR_LENGTH(email) > 3 AND CHAR_LENGTH(email) <= 255),
    CONSTRAINT chk_newsletter_subscribers_email_format
        CHECK (email LIKE '_%@_%.__%'),
    CONSTRAINT chk_newsletter_subscribers_verified_consistency
        CHECK (
            (status = 'active' AND verified_at IS NOT NULL)
            OR (status <> 'active')
        ),
    CONSTRAINT chk_newsletter_subscribers_unsubscribed_consistency
        CHECK (
            (status = 'unsubscribed' AND unsubscribed_at IS NOT NULL)
            OR (status <> 'unsubscribed')
        ),
    INDEX idx_newsletter_subscribers_status (status),
    INDEX idx_newsletter_subscribers_source (source),
    INDEX idx_newsletter_subscribers_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
