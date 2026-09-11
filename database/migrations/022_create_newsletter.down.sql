-- Rollback for: 022_create_newsletter
-- Reverses ONLY migration 022. Drops the newsletter_subscribers table.

DROP TABLE IF EXISTS newsletter_subscribers;
