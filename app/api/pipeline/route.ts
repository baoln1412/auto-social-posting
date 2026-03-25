import { NextRequest } from 'next/server';
import { Article, PostDraft, KeywordConfig } from '@/app/types';
import {
  initPipelineNotebook,
  addArticleSource,
  processArticle,
  buildFallbackPost,
  cleanupPipelineNotebook,
  detectEngine,
  processBatchGemini,
  filterRelevantArticles,
  filterByKeywords,
} from './article-processor';
import { getSupabaseServer } from '@/app/lib/supabase';

export const maxDuration = 300;

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

// ── Filter out already-processed articles ─────────────────────────────────
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

      const engine = detectEngine();

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

      emit({
        type: 'progress',
        current: 0,
        total: newArticles.length,
        title: `${newArticles.length} new articles found — filtering by keywords...`,
      });

      // Step 2: Filter by keywords (fast, local — runs FIRST)
      const keywordFiltered = filterByKeywords(
        newArticles,
        keywordConfig,
        (msg) => emit({ type: 'progress', current: 0, total: newArticles.length, title: msg }),
      );

      if (keywordFiltered.length === 0) {
        emit({
          type: 'progress',
          current: 0,
          total: 0,
          title: 'No articles matched your keyword filters — try adjusting your keywords',
        });
        emit({ type: 'done', total: 0, skipped: articles.length });
        controller.close();
        return;
      }

      // Step 3: AI relevance filter (runs AFTER keyword filter)
      const relevantArticles = await filterRelevantArticles(
        keywordFiltered,
        systemPrompt,
        (msg) => emit({ type: 'progress', current: 0, total: keywordFiltered.length, title: msg }),
      );

      if (relevantArticles.length === 0) {
        emit({
          type: 'progress',
          current: 0,
          total: 0,
          title: 'No relevant articles found for your niche — try different sources',
        });
        emit({ type: 'done', total: 0, skipped: articles.length });
        controller.close();
        return;
      }

      emit({
        type: 'progress',
        current: 0,
        total: relevantArticles.length,
        title: `${relevantArticles.length} relevant articles (${newArticles.length - relevantArticles.length} filtered) — generating posts...`,
      });

      await initPipelineNotebook();

      let actualPostCount = 0;
      const emitAndSave = async (post: PostDraft) => {
        const postWithFetchTime = { ...post, fetchTime: new Date().toISOString(), pageId };
        emit({ type: 'post', post: postWithFetchTime });
        await savePostToDb(post, pageId);
        actualPostCount++;
      };

      // Step 4: Generate posts from relevant articles
      if (engine === 'gemini') {
        await processBatchGemini(
          relevantArticles,
          systemPrompt,
          async (post) => { await emitAndSave(post); },
          (current, total, title) => emit({ type: 'progress', current, total, title }),
          platformPrompts,
          userPrompt,
        );
      } else {
        for (let i = 0; i < relevantArticles.length; i++) {
          const article = relevantArticles[i];
          emit({ type: 'progress', current: i + 1, total: relevantArticles.length, title: article.title });
          try {
            const post = await processArticle(article);
            await emitAndSave(post);
          } catch (err) {
            console.error(`[pipeline] fallback for "${article.title}":`, err);
            const post = buildFallbackPost(article);
            await emitAndSave(post);
          }
        }
      }

      await cleanupPipelineNotebook();

      // Update last fetch time
      await updateLastFetchTime(pageId);

      const totalSkipped = articles.length - relevantArticles.length;
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
