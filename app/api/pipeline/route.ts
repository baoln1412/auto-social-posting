import { NextRequest } from 'next/server';
import { Article, PostDraft } from '@/app/types';
import {
  initPipelineNotebook,
  addArticleSource,
  processArticle,
  buildFallbackPost,
  cleanupPipelineNotebook,
  detectEngine,
  processBatchGemini,
} from './article-processor';
import { getSupabaseServer } from '@/app/lib/supabase';

export const maxDuration = 300;

// ── Save posts to Supabase ────────────────────────────────────────────────
async function savePostToDb(post: PostDraft, pageId: string): Promise<void> {
  try {
    const supabase = getSupabaseServer();
    await supabase.from('posts').upsert(
      {
        page_id: pageId,
        article_url: post.article.url,
        article_title: post.article.title,
        source: post.article.source,
        pub_date: post.article.pubDate,
        image_url: post.generatedImageUrl ?? post.article.imageUrl ?? null,
        description: post.article.description ?? null,
        summary: post.article.summary ?? null,
        emoji_title: post.emojiTitle,
        facebook_text: post.facebookText,
        fetch_time: new Date().toISOString(),
      },
      { onConflict: 'article_url' },
    );
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

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();
  const articles: Article[] = body.articles ?? [];
  const pageId: string = body.pageId;
  const systemPrompt: string = body.systemPrompt ?? 'You are a helpful social media assistant.';

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
        title: `${newArticles.length} new articles (${articles.length - newArticles.length} skipped) — using ${engine}`,
      });

      await initPipelineNotebook();

      const emitAndSave = async (post: PostDraft) => {
        const postWithFetchTime = { ...post, fetchTime: new Date().toISOString(), pageId };
        emit({ type: 'post', post: postWithFetchTime });
        await savePostToDb(post, pageId);
      };

      if (engine === 'gemini') {
        await processBatchGemini(
          newArticles,
          systemPrompt,
          async (post) => { await emitAndSave(post); },
          (current, total, title) => emit({ type: 'progress', current, total, title }),
        );
      } else {
        for (let i = 0; i < newArticles.length; i++) {
          const article = newArticles[i];
          emit({ type: 'progress', current: i + 1, total: newArticles.length, title: article.title });
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

      emit({ type: 'done', total: newArticles.length, skipped: articles.length - newArticles.length });
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
