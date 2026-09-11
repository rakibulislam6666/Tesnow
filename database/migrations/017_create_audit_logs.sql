-- Migration: 017_create_audit_logs
-- Description: Creates an immutable-style application audit log. No updated_at; app layer enforces immutability.
-- Engine: InnoDB | Charset: utf8mb4

-- ============================================================
-- UP MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36) NOT NULL,
    actor_user_id      BIGINT UNSIGNED DEFAULT NULL,
    actor_admin_id     BIGINT UNSIGNED DEFAULT NULL,
    action             VARCHAR(64) NOT NULL,
    entity_type        VARCHAR(64) NOT NULL,
    entity_id          BIGINT UNSIGNED DEFAULT NULL,
    before_data        JSON DEFAULT NULL,
    after_data         JSON DEFAULT NULL,
    request_id         CHAR(36) DEFAULT NULL,
    ip_hash            CHAR(64) DEFAULT NULL,
    user_agent_hash    CHAR(64) DEFAULT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_audit_logs_uuid (uuid),
    CONSTRAINT fk_audit_logs_actor_user_id
        FOREIGN KEY (actor_user_id) REFERENCES users (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_audit_logs_actor_admin_id
        FOREIGN KEY (actor_admin_id) REFERENCES admins (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT chk_audit_logs_action_not_empty
        CHECK (CHAR_LENGTH(action) > 0),
    CONSTRAINT chk_audit_logs_entity_type_not_empty
        CHECK (CHAR_LENGTH(entity_type) > 0),
    INDEX idx_audit_logs_actor_user (actor_user_id),
    INDEX idx_audit_logs_actor_admin (actor_admin_id),
    INDEX idx_audit_logs_entity (entity_type, entity_id),
    INDEX idx_audit_logs_action (action),
    INDEX idx_audit_logs_request_id (request_id),
    INDEX idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS audit_logs;
