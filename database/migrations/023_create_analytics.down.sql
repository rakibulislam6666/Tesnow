-- Rollback for: 023_create_analytics
-- Reverses ONLY migration 023. Drops the analytics_events table.

DROP TABLE IF EXISTS analytics_events;
