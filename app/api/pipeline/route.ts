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

export const maxDuration = 300; // 5 minutes total for all articles

// ── Save posts to Supabase ────────────────────────────────────────────────
async function savePostToDb(post: PostDraft): Promise<void> {
  try {
    const supabase = getSupabaseServer();
    await supabase.from('crime_posts').upsert(
      {
        article_url: post.article.url,
        article_title: post.article.title,
        source: post.article.source,
        state: post.state ?? 'Unknown',
        pub_date: post.article.pubDate,
        image_url: post.article.imageUrl ?? null,
        portrait_url: post.article.portraitUrl ?? null,
        description: post.article.description ?? null,
        summary: post.article.summary ?? null,
        emoji_title: post.emojiTitle,
        emoji_title_vi: post.emojiTitleVi ?? '',
        facebook_text: post.facebookText,
        comment_bait: post.commentBait,
        nb2_prompt: post.nb2Prompt,
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
      .from('crime_posts')
      .select('article_url')
      .in('article_url', urls);

    const existingUrls = new Set((existing ?? []).map((r) => r.article_url));
    const newArticles = articles.filter((a) => !existingUrls.has(a.url));

    console.log(`[pipeline] ${articles.length} total → ${existingUrls.size} already in DB → ${newArticles.length} new`);
    return newArticles;
  } catch (err) {
    console.error('[pipeline] DB filter failed, processing all:', err);
    return articles; // Fallback: process everything if DB is unavailable
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();
  const articles: Article[] = body.articles ?? [];

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

      // Step 2: Initialize the AI engine
      const notebookId = await initPipelineNotebook();

      // Wrap emit to also save to DB
      const emitAndSave = async (post: PostDraft) => {
        emit({ type: 'post', post });
        await savePostToDb(post);
      };

      if (engine === 'gemini') {
        // ── Gemini batch path (5 articles per API call) ──
        await processBatchGemini(
          newArticles,
          async (post) => { await emitAndSave(post); },
          (current, total, title) => emit({ type: 'progress', current, total, title }),
        );
      } else {
        // ── NotebookLM / fallback per-article path ──
        if (engine === 'notebooklm' && notebookId) {
          emit({ type: 'progress', current: 0, total: newArticles.length, title: 'Adding article sources...' });
          for (const article of newArticles) {
            await addArticleSource(article);
          }
        }

        for (let i = 0; i < newArticles.length; i++) {
          const article = newArticles[i];
          emit({ type: 'progress', current: i + 1, total: newArticles.length, title: article.title });
          try {
            console.log(`[pipeline] processing ${i + 1}/${newArticles.length}: ${article.title}`);
            const post = await processArticle(article);
            await emitAndSave(post);
          } catch (err) {
            console.error(`[pipeline] fallback for "${article.title}":`, err);
            const post = buildFallbackPost(article);
            await emitAndSave(post);
          }
        }
      }

      // Step 3: Cleanup (only for NotebookLM engine)
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
