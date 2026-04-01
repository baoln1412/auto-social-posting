-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create content_pages table
CREATE TABLE IF NOT EXISTS public.content_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt TEXT,
    platform_prompts JSONB DEFAULT '{}'::jsonb,
    keyword_config JSONB DEFAULT '{"tier1": [], "tier2": [], "minScore": 1}'::jsonb,
    last_fetch_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create rss_feeds table
CREATE TABLE IF NOT EXISTS public.rss_feeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES public.content_pages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    feed_type TEXT DEFAULT 'rss',
    scrape_selector TEXT,
    crime_specific BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create posts table
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES public.content_pages(id) ON DELETE CASCADE,
    article_url TEXT UNIQUE NOT NULL,
    article_title TEXT NOT NULL,
    source TEXT NOT NULL,
    pub_date TIMESTAMPTZ,
    image_url TEXT,
    generated_image_url TEXT,
    description TEXT,
    summary TEXT,
    emoji_title TEXT,
    facebook_text TEXT,
    platform_drafts JSONB DEFAULT '{}'::jsonb,
    fetch_time TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ,
    article_location TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Note: In Supabase, the postgrest schema cache must be reloaded after manual schema changes
NOTIFY pgrst, 'reload schema';
