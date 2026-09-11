-- Rollback for: 021_create_webhooks
-- Reverses ONLY migration 021. Drops tables created by 021 in dependency order
-- (child table webhook_deliveries before parent table webhooks).

DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhooks;
