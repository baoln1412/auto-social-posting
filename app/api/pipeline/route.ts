import { NextRequest } from 'next/server';
import { Article, PostDraft, KeywordConfig } from '@/app/types';
import {
  initPipelineNotebook,
  cleanupPipelineNotebook,
  processBatchGemini,
  filterRelevantArticles,
  filterByKeywords,
} from './article-processor';
import { getSupabaseServer } from '@/app/lib/supabase';

export const maxDuration = 300;

interface ChannelConfig {
  id: string;
  systemPrompt: string;
  userPrompt: string;
  keywordConfig: KeywordConfig;
  platformPageName: string;
}

// ── Load connected channels for a page ───────────────────────────────────────
async function loadChannels(
  pageId: string,
  defaultSystemPrompt: string,
  defaultUserPrompt: string,
  defaultKeywordConfig: KeywordConfig,
): Promise<ChannelConfig[]> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('page_channels')
      .select('id, platform_page_name, system_prompt, user_prompt, keyword_config')
      .eq('page_id', pageId)
      .eq('platform', 'facebook');

    if (error || !data || data.length === 0) {
      // No connected channels — run with default config using a virtual channel
      return [{
        id: 'default',
        platformPageName: 'Default',
        systemPrompt: defaultSystemPrompt,
        userPrompt: defaultUserPrompt,
        keywordConfig: defaultKeywordConfig,
      }];
    }

    return data.map((ch) => ({
      id: ch.id,
      platformPageName: ch.platform_page_name,
      // Use channel override if set, otherwise fall back to page defaults
      systemPrompt: ch.system_prompt ?? defaultSystemPrompt,
      userPrompt: ch.user_prompt ?? defaultUserPrompt,
      keywordConfig: ch.keyword_config ?? defaultKeywordConfig,
    }));
  } catch (err) {
    console.error('[pipeline] Failed to load channels:', err);
    return [{
      id: 'default',
      platformPageName: 'Default',
      systemPrompt: defaultSystemPrompt,
      userPrompt: defaultUserPrompt,
      keywordConfig: defaultKeywordConfig,
    }];
  }
}

// ── Save posts to Supabase ────────────────────────────────────────────────
async function savePostToDb(post: PostDraft, pageId: string): Promise<void> {
  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.from('posts').upsert(
      {
        page_id: pageId,
        article_url: post.article.url,
        article_title: post.article.title,
        source: post.article.source,
        pub_date: post.article.pubDate,
        image_url: post.article.imageUrl ?? null,
        generated_image_url: post.generatedImageUrl ?? null,
        description: post.article.description ?? null,
        summary: post.article.summary ?? null,
        emoji_title: post.emojiTitle,
        facebook_text: post.facebookText,
        platform_drafts: post.platformDrafts ?? {},
        fetch_time: new Date().toISOString(),
        article_location: post.article.location ?? null,
      },
      { onConflict: 'article_url' },
    );
    if (error) {
      console.error(`[pipeline] Supabase upsert error for "${post.article.title}":`, error.message, error.details, error.hint);
    } else {
      console.log(`[pipeline] Saved post: ${post.emojiTitle?.slice(0, 50) ?? post.article.title.slice(0, 50)}`);
    }
  } catch (err) {
    console.error('[pipeline] Failed to save post:', err);
  }
}

// ── Filter out already-processed articles ─────────────────────────────────────
async function filterNewArticles(articles: Article[]): Promise<Article[]> {
  try {
    const supabase = getSupabaseServer();
    const urls = articles.map((a) => a.url);

    const { data: existing } = await supabase
      .from('posts')
      .select('article_url')
      .in('article_url', urls);

    const existingUrls = new Set((existing ?? []).map((r: { article_url: string }) => r.article_url));
    const newArticles = articles.filter((a) => !existingUrls.has(a.url));

    console.log(`[pipeline] ${articles.length} total → ${existingUrls.size} already in DB → ${newArticles.length} new`);
    return newArticles;
  } catch (err) {
    console.error('[pipeline] DB filter failed, processing all:', err);
    return articles;
  }
}

// ── Update last fetch time on page ────────────────────────────────────────
async function updateLastFetchTime(pageId: string): Promise<void> {
  try {
    const supabase = getSupabaseServer();
    await supabase
      .from('content_pages')
      .update({ last_fetch_time: new Date().toISOString() })
      .eq('id', pageId);
  } catch (err) {
    console.error('[pipeline] Failed to update last fetch time:', err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();
  const articles: Article[] = body.articles ?? [];
  const pageId: string = body.pageId;
  const systemPrompt: string = body.systemPrompt ?? 'You are a helpful social media assistant.';
  const userPrompt: string = body.userPrompt ?? '';
  const platformPrompts: Record<string, string> = body.platformPrompts ?? {};
  const keywordConfig: KeywordConfig = body.keywordConfig ?? { tier1: [], tier2: [], minScore: 1 };

  if (!pageId) {
    return new Response(JSON.stringify({ error: 'pageId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // Step 1: Filter out articles already in the database
      const newArticles = await filterNewArticles(articles);

      if (newArticles.length === 0) {
        emit({
          type: 'progress',
          current: 0,
          total: 0,
          title: 'All articles already processed — no new ones to fetch',
        });
        emit({ type: 'done', total: 0, skipped: articles.length });
        controller.close();
        return;
      }

      // Step 2: Load channels (each may have its own prompts/keywords)
      const channels = await loadChannels(pageId, systemPrompt, userPrompt, keywordConfig);
      const multiChannel = channels.length > 1;

      emit({
        type: 'progress',
        current: 0,
        total: newArticles.length,
        title: `${newArticles.length} new articles — running pipeline${multiChannel ? ` across ${channels.length} channels` : ''}...`,
      });

      await initPipelineNotebook();

      let actualPostCount = 0;

      // Step 3: Run per-channel pipeline
      for (const channel of channels) {
        const channelLabel = multiChannel ? ` [${channel.platformPageName}]` : '';

        emit({
          type: 'progress',
          current: 0,
          total: newArticles.length,
          title: `🔑${channelLabel} Filtering by keywords...`,
        });

        // Keyword filter using this channel's config
        const keywordFiltered = filterByKeywords(
          newArticles,
          channel.keywordConfig,
          (msg) => emit({ type: 'progress', current: 0, total: newArticles.length, title: `${channelLabel} ${msg}` }),
        );

        if (keywordFiltered.length === 0) {
          emit({
            type: 'progress',
            current: 0,
            total: 0,
            title: `${channelLabel} No articles matched keyword filters`,
          });
          continue;
        }

        // AI relevance filter
        const relevantArticles = await filterRelevantArticles(
          keywordFiltered,
          channel.systemPrompt,
          (msg) => emit({ type: 'progress', current: 0, total: keywordFiltered.length, title: `${channelLabel} ${msg}` }),
        );

        if (relevantArticles.length === 0) {
          emit({
            type: 'progress',
            current: 0,
            total: 0,
            title: `${channelLabel} No relevant articles found`,
          });
          continue;
        }

        emit({
          type: 'progress',
          current: 0,
          total: relevantArticles.length,
          title: `${channelLabel} ${relevantArticles.length} relevant articles — generating posts...`,
        });

        const emitAndSave = async (post: PostDraft) => {
          // Tag the post with which channel generated it (stored in platformDrafts)
          if (multiChannel && channel.id !== 'default') {
            post.platformDrafts = {
              ...post.platformDrafts,
              [`channel_${channel.id}`]: post.facebookText,
            };
          }
          const postWithMeta = { ...post, fetchTime: new Date().toISOString(), pageId };
          emit({ type: 'post', post: postWithMeta });
          await savePostToDb(post, pageId);
          actualPostCount++;
        };

        // Step 4: Generate posts using this channel's prompts
        await processBatchGemini(
          relevantArticles,
          channel.systemPrompt,
          async (post) => { await emitAndSave(post); },
          (current, total, title) => emit({ type: 'progress', current, total, title: `${channelLabel} ${title}` }),
          platformPrompts,
          channel.userPrompt,
        );
      }

      await cleanupPipelineNotebook();
      await updateLastFetchTime(pageId);

      const totalSkipped = articles.length - newArticles.length;
      emit({ type: 'done', total: actualPostCount, skipped: totalSkipped });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
