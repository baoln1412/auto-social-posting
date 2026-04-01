import { Article, ArticleWithSummary, PostDraft, KeywordConfig } from '@/app/types';
import {
  generateContent as aiGenerate,
  generateImage as aiGenerateImage,
  isAvailable as isAiAvailable,
} from './openrouter-client';

// ── Keyword-based filter — fast local scoring ─────────────────────────────

function scoreArticleByKeywords(article: Article, config: KeywordConfig): number {
  const text = `${article.title} ${article.description}`.toLowerCase();
  let score = 0;

  for (const kw of config.tier1) {
    if (text.includes(kw.toLowerCase())) score += 3;
  }
  for (const kw of config.tier2) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }

  return score;
}

/**
 * Filter articles by weighted keyword matching.
 * Tier 1 keywords = +3 points each, Tier 2 = +1 point each.
 * Article passes if score >= minScore.
 */
export function filterByKeywords(
  articles: Article[],
  config: KeywordConfig,
  onProgress?: (msg: string) => void,
): Article[] {
  if (config.tier1.length === 0 && config.tier2.length === 0) return articles;

  onProgress?.(`🔑 Filtering ${articles.length} articles by ${config.tier1.length + config.tier2.length} keywords...`);

  const passed: Article[] = [];
  for (const article of articles) {
    const score = scoreArticleByKeywords(article, config);
    if (score >= config.minScore) {
      passed.push(article);
    }
  }

  const filtered = articles.length - passed.length;
  onProgress?.(`✅ ${passed.length} articles matched keywords (${filtered} filtered out)`);
  console.log(`[pipeline] Keyword filter: ${articles.length} → ${passed.length} (${filtered} removed, minScore=${config.minScore})`);

  return passed;
}

// ── AI Relevance filter — classify articles before processing ────────────────

function buildRelevanceFilterPrompt(articles: Article[], systemPrompt: string): string {
  const articleList = articles
    .map(
      (a, i) =>
        `${i + 1}. Title: ${a.title}\n   Source: ${a.source}\n   Description: ${a.description ?? 'N/A'}`,
    )
    .join('\n\n');

  // Generic relevance filter — derive niche from system prompt
  const nicheHint = systemPrompt.substring(0, 500);
  return [
    'You are a content relevance classifier.',
    '',
    'The page this content is for has the following context:',
    nicheHint,
    '',
    'Based on the page context above, classify each article below as RELEVANT or NOT_RELEVANT to this page\'s niche.',
    'Be GENEROUS — if an article is even somewhat related to the page\'s topic, include it.',
    '',
    'Return ONLY a JSON array of article numbers that ARE relevant.',
    'Example: [1, 3, 5, 7]',
    'If none are relevant, return: []',
    '',
    'ARTICLES:',
    articleList,
  ].join('\n');
}

/**
 * Filter articles by relevance using AI (runs AFTER keyword filter).
 */
export async function filterRelevantArticles(
  articles: Article[],
  systemPrompt: string,
  onProgress: (msg: string) => void,
): Promise<Article[]> {
  if (!isAiAvailable() || articles.length === 0) return articles;

  onProgress(`🔍 AI-filtering ${articles.length} articles for relevance...`);

  try {
    const filterPrompt = buildRelevanceFilterPrompt(articles, systemPrompt);
    const raw = await aiGenerate(
      'You are a content relevance classifier. Return ONLY valid JSON arrays of numbers.',
      filterPrompt,
      true
    );

    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.warn('[pipeline] Could not parse relevance filter response, using all articles');
      return articles;
    }

    const relevantIndexes: number[] = JSON.parse(match[0]);
    const relevantArticles = articles.filter((_, i) => relevantIndexes.includes(i + 1));

    const filtered = articles.length - relevantArticles.length;
    onProgress(`✅ ${relevantArticles.length} relevant articles (${filtered} filtered by AI)`);
    console.log(`[pipeline] AI relevance filter: ${articles.length} → ${relevantArticles.length} (${filtered} removed)`);

    return relevantArticles;
  } catch (err) {
    console.error('[pipeline] Relevance filter failed, using all articles:', err);
    return articles;
  }
}



// ── Single article content prompt ─────────────────────────────────────────

function buildSingleArticlePrompt(article: Article, systemPrompt: string): string {
  return [
    '=== ROLE ===',
    'You are an expert Football Social Media Specialist.',
    'Process each independent sports article to produce a Facebook post json object.',
    'CRITICAL REQUIREMENT 1: The `facebookText` MUST be highly detailed, comprehensive, and LONG (strictly between 1000 and 1500 characters in length). Expand extensively on the background context, emotional impact, tactical analysis or news implications. You MUST properly split the text into 3-4 well-structured paragraphs using \\n\\n for clear spacing. Do not write a single block of text.',
    'CRITICAL REQUIREMENT 2: The `facebookText` MUST be written in natural Vietnamese. For match news, include time and teams. For general news, focus on the individuals and impact. End with an engaging question.',
    'Extract `matchTime`, `matchTeams`, `bestPlayer`, `matchHighlight`, and `summary` (3-sentence English fact). If any of these are not applicable (e.g. a transfer news article has no matchTime), you MUST output "N/A".',
    'Return ONLY a valid JSON object (no markdown formatting, no preamble):',
    '{"emojiTitle":"...","emojiTitleVi":"...","facebookText":"...","matchTime":"...","matchTeams":"...","bestPlayer":"...","matchHighlight":"...","summary":"..."}',
    '',
    '=== ARTICLE TO PROCESS ===',
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `URL: ${article.url}`,
    `Description: ${article.description}`,
  ].join('\n');
}

// ── Single article JSON parser ────────────────────────────────────────────

function extractJsonMatch(raw: string): string | null {
  // First, try to extract from markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    const content = fenceMatch[1].trim();
    if (content.startsWith('[') || content.startsWith('{')) {
      return content;
    }
  }

  // Then try to find raw JSON object or array
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return null;
}

function parseSingleAiResponse(
  raw: string,
  article: Article,
): { post: PostDraft | null; imagePrompt: string | null } {
  console.log(`[pipeline] AI output for "${article.title.slice(0, 50)}":`, raw.substring(0, 300) + '...');
  const jsonMatch = extractJsonMatch(raw);
  if (!jsonMatch) {
    console.error(`[pipeline] ❌ Could not find JSON in AI output for: ${article.title.slice(0, 60)}`);
    return { post: null, imagePrompt: null };
  }

  try {
    let parsed = JSON.parse(jsonMatch);
    // Handle case where AI returns an array with one item
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    }

    if (!parsed || !parsed.emojiTitle || !parsed.facebookText) {
      console.warn(`[pipeline] ⚠️ Missing emojiTitle/facebookText for: ${article.title.slice(0, 60)}`);
      return { post: null, imagePrompt: null };
    }

    // Detect AI-generated rejection posts — the AI sometimes correctly identifies
    // irrelevant articles and generates a "skip" title instead of a real post.
    // IMPORTANT: Only check emojiTitle (not facebookText) to avoid false positives
    // from legitimate content that mentions words like "skip" or "not relevant".
    const titleLower = parsed.emojiTitle.toLowerCase();
    const rejectionTitleSignals = [
      'không liên quan',   // "not related" in Vietnamese
      'bỏ qua',            // "skip" in Vietnamese
      'không phải tin tức', // "not news" in Vietnamese
      'không thuộc chủ đề', // "off-topic" in Vietnamese
      'off-topic',
      'not relevant to',
      'skip this article',
      'irrelevant article',
    ];
    const isRejection = rejectionTitleSignals.some(signal => titleLower.includes(signal));
    if (isRejection) {
      console.log(`[pipeline] 🚫 AI rejected article as irrelevant (title: "${parsed.emojiTitle.slice(0, 60)}")`);
      return { post: null, imagePrompt: null };
    }

    const articleWithSummary: ArticleWithSummary = {
      ...article,
      summary: parsed.summary ?? article.description,
    };

    return {
      post: {
        article: articleWithSummary,
        emojiTitle: parsed.emojiTitle,
        emojiTitleVi: parsed.emojiTitleVi,
        facebookText: parsed.facebookText,
        matchTime: parsed.matchTime,
        matchTeams: parsed.matchTeams,
        bestPlayer: parsed.bestPlayer,
        matchHighlight: parsed.matchHighlight,
        generatedImageUrl: undefined,
        platformDrafts: {},
      },
      imagePrompt: parsed.imagePrompt ?? null,
    };
  } catch (err) {
    console.error(`[pipeline] ❌ JSON.parse failed for "${article.title.slice(0, 50)}":`, err);
    return { post: null, imagePrompt: null };
  }
}

// ── Fallback post builder ─────────────────────────────────────────────────

export function buildFallbackPost(article: Article): PostDraft {
  const desc = article.description || 'Story developing...';
  const facebookText = `📰 ${article.title}\n\n${desc}\n\n👉 Follow for updates!`;
  const articleWithSummary: ArticleWithSummary = { ...article, summary: desc };

  return {
    article: articleWithSummary,
    emojiTitle: `📰 ${article.title}`,
    facebookText,
    generatedImageUrl: undefined,
    platformDrafts: {},
  };
}

// ── AI engine detection ───────────────────────────────────────────────────

export type AiEngine = 'ai' | 'fallback';

export function detectEngine(): AiEngine {
  if (isAiAvailable()) return 'ai';
  return 'fallback';
}

// ── Main processor ────────────────────────────────────────────────────────

export async function initPipelineNotebook(): Promise<string | null> {
  if (isAiAvailable()) {
    console.log('[pipeline] Using OpenRouter AI engine');
    return 'ai';
  }
  return null;
}

export async function addArticleSource(): Promise<boolean> {
  return false;
}

/**
 * Build a prompt for generating a platform-specific draft.
 */
function buildPlatformDraftPrompt(
  article: Article,
  facebookText: string,
  platform: string,
  platformPrompt: string,
  systemPrompt: string,
): string {
  return [
    `Bạn là trợ lý sáng tạo nội dung cho nền tảng ${platform}. TOÀN BỘ nội dung PHẢI VIẾT BẰNG TIẾNG VIỆT.`,
    '',
    '--- ORIGINAL ARTICLE ---',
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `URL: ${article.url}`,
    '',
    '--- FACEBOOK DRAFT ---',
    facebookText,
    '',
    `Viết lại bài viết trên phù hợp cho nền tảng ${platform}. Trả về CHỈ nội dung bài viết.`,
  ].join('\n');
}

/**
 * Generate platform-specific drafts for connected platforms.
 */
async function generatePlatformDrafts(
  article: Article,
  facebookText: string,
  platformPrompts: Record<string, string>,
  systemPrompt: string,
): Promise<Record<string, string>> {
  const drafts: Record<string, string> = {};

  for (const [platform, prompt] of Object.entries(platformPrompts)) {
    if (!prompt || !prompt.trim() || platform === 'facebook') continue;

    try {
      const userPrompt = buildPlatformDraftPrompt(article, facebookText, platform, prompt, systemPrompt);
      const draft = await aiGenerate(prompt, userPrompt);
      drafts[platform] = draft.trim();
      console.log(`[pipeline] Generated ${platform} draft for: ${article.title.slice(0, 50)}`);
    } catch (err) {
      console.error(`[pipeline] Failed to generate ${platform} draft:`, err);
    }
  }

  return drafts;
}

/**
 * Process articles ONE BY ONE with AI.
 * Each article gets its own API call — if one fails, only that article uses fallback.
 * No batch delays needed since we're making individual calls.
 */
export async function processBatchGemini(
  articles: Article[],
  systemPrompt: string,
  onPost: (post: PostDraft, index: number) => Promise<void>,
  onProgress: (current: number, total: number, title: string) => void,
  platformPrompts?: Record<string, string>,
  storedUserPrompt?: string,
): Promise<void> {
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    onProgress(i + 1, articles.length, `🔄 Processing ${i + 1}/${articles.length}: ${article.title.slice(0, 60)}...`);

    let post: PostDraft | null = null;

    try {
      // Build prompt for this single article
      let userPrompt: string;
      if (storedUserPrompt && storedUserPrompt.trim()) {
        const articleBlock = `--- ARTICLE ---\nTitle: ${article.title}\nSource: ${article.source}\nURL: ${article.url}\nDescription: ${article.description}`;
        userPrompt = storedUserPrompt.replace('{articles}', articleBlock);
        console.log(`[pipeline] [${i + 1}/${articles.length}] Using STORED user prompt for: ${article.title.slice(0, 50)}`);
      } else {
        userPrompt = buildSingleArticlePrompt(article, systemPrompt);
        console.log(`[pipeline] [${i + 1}/${articles.length}] Using BUILT prompt for: ${article.title.slice(0, 50)}`);
      }

      const raw = await aiGenerate(systemPrompt, userPrompt, true);
      console.log(`[pipeline] [${i + 1}/${articles.length}] AI output length: ${raw.length}`);

      const result = parseSingleAiResponse(raw, article);

      if (result.post) {
        post = result.post;
        console.log(`[pipeline] ✅ [${i + 1}/${articles.length}] Generated: ${post.emojiTitle.slice(0, 60)}`);
      } else {
        console.warn(`[pipeline] ⚠️ [${i + 1}/${articles.length}] AI parse failed, using fallback`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline] ❌ [${i + 1}/${articles.length}] AI error for "${article.title.slice(0, 50)}":`, errMsg);
      onProgress(i + 1, articles.length, `⚠️ AI error for "${article.title.slice(0, 40)}" — using fallback`);

      // If it's a quota error, wait and continue (don't break — try next article)
      if (errMsg.includes('429')) {
        onProgress(i + 1, articles.length, `⏳ Rate limited — waiting 30s before next article...`);
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }

    // Use fallback if AI failed
    if (!post) {
      post = buildFallbackPost(article);
      console.log(`[pipeline] 🔄 [${i + 1}/${articles.length}] Fallback post created for: ${article.title.slice(0, 50)}`);
    }

    // Generate platform-specific drafts if configured
    if (platformPrompts && Object.keys(platformPrompts).length > 0) {
      try {
        onProgress(i + 1, articles.length, `📱 Generating platform drafts: ${post.emojiTitle.slice(0, 40)}...`);
        post.platformDrafts = await generatePlatformDrafts(
          article,
          post.facebookText,
          platformPrompts,
          systemPrompt,
        );
      } catch (err) {
        console.error(`[pipeline] Platform drafts failed for: ${article.title.slice(0, 50)}`, err);
      }
    }

    // Emit and save immediately
    await onPost(post, i);

    // Small delay between articles to be kind to OpenRouter free tier (2s instead of 15s)
    if (i < articles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function processArticle(article: Article): Promise<PostDraft> {
  return buildFallbackPost(article);
}

export async function cleanupPipelineNotebook(): Promise<void> {
  // No-op
}
