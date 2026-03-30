-- Run in Supabase SQL Editor
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS article_location TEXT DEFAULT NULL;

COMMENT ON COLUMN posts.article_location IS
  'US state or city detected from the article title/description (e.g. ''Georgia'', ''Miami, FL'')';
