-- Rollback for: 020_create_api_keys
-- Reverses ONLY migration 020. Drops the api_keys table.

DROP TABLE IF EXISTS api_keys;
