-- Migration: 021_create_webhooks
-- Description: Webhook endpoint registration and delivery tracking for outbound event notifications.
-- Engine: InnoDB | Charset: utf8mb4

CREATE TABLE IF NOT EXISTS webhooks (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    user_id            BIGINT UNSIGNED DEFAULT NULL,
    name               VARCHAR(128) NOT NULL,
    endpoint_url       VARCHAR(2048) NOT NULL,
    secret_encrypted   VARBINARY(512) NOT NULL,
    subscribed_events  JSON NOT NULL,
    is_active          TINYINT(1) NOT NULL DEFAULT 1,
    failure_count      INT UNSIGNED NOT NULL DEFAULT 0,
    last_success_at    DATETIME DEFAULT NULL,
    last_failure_at    DATETIME DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhooks_uuid (uuid),
    CONSTRAINT fk_webhooks_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT chk_webhooks_name_not_empty
        CHECK (CHAR_LENGTH(name) > 0),
    CONSTRAINT chk_webhooks_endpoint_url_not_empty
        CHECK (CHAR_LENGTH(endpoint_url) > 0),
    CONSTRAINT chk_webhooks_failure_count_non_negative
        CHECK (failure_count >= 0),
    INDEX idx_webhooks_user_id (user_id),
    INDEX idx_webhooks_is_active (is_active),
    INDEX idx_webhooks_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    webhook_id         BIGINT UNSIGNED NOT NULL,
    event_type         VARCHAR(64) NOT NULL,
    event_id           CHAR(36) NOT NULL,
    attempt_number     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    http_status_code   SMALLINT UNSIGNED DEFAULT NULL,
    is_success         TINYINT(1) NOT NULL DEFAULT 0,
    error_message      VARCHAR(255) DEFAULT NULL,
    next_retry_at      DATETIME DEFAULT NULL,
    delivered_at       DATETIME DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhook_deliveries_uuid (uuid),
    UNIQUE KEY uq_webhook_deliveries_event_attempt (webhook_id, event_id, attempt_number),
    CONSTRAINT fk_webhook_deliveries_webhook_id
        FOREIGN KEY (webhook_id) REFERENCES webhooks (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT chk_webhook_deliveries_event_type_not_empty
        CHECK (CHAR_LENGTH(event_type) > 0),
    CONSTRAINT chk_webhook_deliveries_attempt_number_positive
        CHECK (attempt_number >= 1),
    INDEX idx_webhook_deliveries_webhook_id (webhook_id),
    INDEX idx_webhook_deliveries_event_id (event_id),
    INDEX idx_webhook_deliveries_is_success (is_success),
    INDEX idx_webhook_deliveries_next_retry_at (next_retry_at),
    INDEX idx_webhook_deliveries_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
