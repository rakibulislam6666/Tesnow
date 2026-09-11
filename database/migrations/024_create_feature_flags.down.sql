-- Rollback for: 024_create_feature_flags
-- Reverses ONLY migration 024. Drops the feature_flags table.

DROP TABLE IF EXISTS feature_flags;
