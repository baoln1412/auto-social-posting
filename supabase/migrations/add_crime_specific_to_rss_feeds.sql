-- Run in Supabase SQL Editor (or Supabase CLI: supabase db push)
ALTER TABLE rss_feeds
  ADD COLUMN IF NOT EXISTS crime_specific BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rss_feeds.crime_specific IS
  'When TRUE, every article from this feed is treated as crime-relevant and skips keyword matching';
