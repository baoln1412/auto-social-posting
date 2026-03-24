import { Article, ArticleWithSummary, PostDraft } from '@/app/types';
import {
  generateContent as geminiGenerate,
  isAvailable as isGeminiAvailable,
  BATCH_SIZE,
} from './gemini-client';

// ── Batch content prompt builder ──────────────────────────────────────────

function buildBatchContentPrompt(articles: Article[]): string {
  const articleBlocks = articles
    .map(
      (a, i) =>
        `--- ARTICLE ${i + 1} ---\nTitle: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nDescription: ${a.description}`,
    )
    .join('\n\n');

  return [
    'Process each article below and produce a Facebook post JSON object for it.',
    'For each article, output:',
    '- emojiTitle: A catchy headline (can be bilingual or Vietnamese) with strong emoji (🚨, 📢, 💸, ✈️)',
    '- facebookText: The full post body following the system prompt guidelines. MUST be 200-350 words, well-formatted with line breaks.',
    '- summary: A 2-3 sentence factual summary in English.',
    '',
    'Return ONLY a valid JSON array (no markdown, no preamble):',
    '[{"emojiTitle":"...","facebookText":"...","summary":"..."}, ...]',
    '',
    'ARTICLES TO PROCESS:',
    articleBlocks,
  ].join('\n');
}

// ── Fallback post builder ─────────────────────────────────────────────────

export function buildFallbackPost(article: Article): PostDraft {
  const desc = article.description || 'Developing story...';
  const facebookText = `📰 ${article.title}\n\n${desc}\n\n👉 Theo dõi để cập nhật tin mới nhất!`;
  const articleWithSummary: ArticleWithSummary = { ...article, summary: desc };

  return {
    article: articleWithSummary,
    emojiTitle: `📰 ${article.title}`,
    facebookText,
    generatedImageUrl: article.imageUrl,
  };
}

// ── AI engine detection ───────────────────────────────────────────────────

export type AiEngine = 'gemini' | 'fallback';

export function detectEngine(): AiEngine {
  if (isGeminiAvailable()) return 'gemini';
  return 'fallback';
}

// ── Main processor ────────────────────────────────────────────────────────

export async function initPipelineNotebook(): Promise<string | null> {
  if (isGeminiAvailable()) {
    console.log('[pipeline] Using Gemini API engine');
    return 'gemini';
  }
  return null;
}

export async function addArticleSource(): Promise<boolean> {
  return false;
}

function extractJsonMatch(raw: string): string | null {
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return null;
}

function parseBatchAiResponse(
  raw: string,
  articles: Article[],
): (PostDraft | null)[] {
  console.log('[pipeline] Raw AI output snippet:', raw.substring(0, 500) + '...');
  const jsonMatch = extractJsonMatch(raw);
  if (!jsonMatch) return articles.map(() => null);

  try {
    let parsed = JSON.parse(jsonMatch);
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    return articles.map((article, i) => {
      const item = parsed[i];
      if (!item || !item.emojiTitle || !item.facebookText) return null;

      const articleWithSummary: ArticleWithSummary = {
        ...article,
        summary: item.summary ?? article.description,
      };

      return {
        article: articleWithSummary,
        emojiTitle: item.emojiTitle,
        facebookText: item.facebookText,
        generatedImageUrl: article.imageUrl,
      };
    });
  } catch {
    return articles.map(() => null);
  }
}

/**
 * Process a batch of articles with Gemini.
 * systemPrompt comes from the content page's configuration.
 */
export async function processBatchGemini(
  articles: Article[],
  systemPrompt: string,
  onPost: (post: PostDraft, index: number) => void,
  onProgress: (current: number, total: number, title: string) => void,
): Promise<void> {
  for (let batchStart = 0; batchStart < articles.length; batchStart += BATCH_SIZE) {
    const batch = articles.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    onProgress(
      batchStart + 1,
      articles.length,
      `Gemini batch ${batchNum}/${totalBatches} (${batch.length} articles)`,
    );

    let results: (PostDraft | null)[];
    try {
      const userPrompt = buildBatchContentPrompt(batch);
      const raw = await geminiGenerate(systemPrompt, userPrompt);
      results = parseBatchAiResponse(raw, batch);

      if (batchNum < totalBatches) {
        console.log(`[pipeline] Waiting 15s to respect Gemini RPM limit...`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    } catch (err) {
      console.error(`[pipeline] Gemini batch ${batchNum} failed:`, err);
      results = batch.map(() => null);
    }

    for (let j = 0; j < batch.length; j++) {
      const globalIndex = batchStart + j;
      if (!results[j]) {
        console.warn(`[pipeline] Skipping article (parse failed): ${batch[j].title}`);
        continue;
      }
      onPost(results[j]!, globalIndex);
    }
  }
}

export async function processArticle(article: Article): Promise<PostDraft> {
  return buildFallbackPost(article);
}

export async function cleanupPipelineNotebook(): Promise<void> {
  // No-op
}
