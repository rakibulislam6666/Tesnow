-- ============================================================
-- TESNOW
-- 007_create_categories.down.sql
-- ============================================================

ALTER TABLE posts
    DROP FOREIGN KEY fk_posts_category;

DROP TABLE IF EXISTS categories;