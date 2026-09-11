-- ============================================================
-- TESNOW
-- 009_create_media.down.sql
-- ============================================================

ALTER TABLE posts
    DROP FOREIGN KEY fk_posts_featured_image;

ALTER TABLE posts
    DROP INDEX idx_posts_featured_image;

DROP TABLE IF EXISTS media;