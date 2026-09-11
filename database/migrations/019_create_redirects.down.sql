-- Rollback for: 019_create_redirects
-- Reverses ONLY migration 019. Drops the redirects table.

DROP TABLE IF EXISTS redirects;
