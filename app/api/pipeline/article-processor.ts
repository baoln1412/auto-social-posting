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

  const isVi = isVietnamesePrompt(systemPrompt);

  if (isVi) {
    return [
      'You are a content relevance classifier for a Vietnamese-Australian media page.',
      '',
      'TARGET NICHE:',
      '- Industry: Tin tức & đời sống Úc (du học, du lịch, làm việc, định cư, lifestyle)',
      '- Audience: Người Việt 16-35 tuổi; Du học sinh / chuẩn bị đi Úc / đang sống ở Úc',
      '- They care about: chi phí sống, việc làm, visa, đời sống thực tế ở Úc, luật mới, nhập cư, giáo dục, y tế, nhà ở, văn hóa Úc',
      '',
      'RELEVANT topics include (but not limited to):',
      '- Australian immigration, visa, residency policies',
      '- Cost of living in Australia (rent, food, utilities, transport)',
      '- Jobs, employment, minimum wage, work rights in Australia',
      '- Australian education, universities, student life',
      '- Housing market, rental market in Australia',
      '- Health, Medicare, healthcare in Australia',
      '- Australian government policies affecting residents/students',
      '- Australian lifestyle, culture, travel within Australia',
      '- Australian economy, inflation, interest rates',
      '- Safety, weather, natural disasters in Australia',
      '- Technology and social trends in Australia',
      '',
      'NOT RELEVANT topics include:',
      '- US politics, UK news, other countries not related to Australia',
      '- Sports results (unless major Australian events)',
      '- Celebrity gossip unrelated to Australia',
      '- Pure entertainment/gaming news',
      '- Wars/conflicts not involving Australia',
      '',
      'For each article below, classify it as RELEVANT or NOT_RELEVANT.',
      'Return ONLY a JSON array of article numbers that ARE relevant.',
      'Example: [1, 3, 5, 7]',
      'If none are relevant, return: []',
      '',
      'ARTICLES:',
      articleList,
    ].join('\n');
  }

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

function isVietnamesePrompt(systemPrompt: string): boolean {
  const viKeywords = ['tiếng việt', 'việt', 'bằng tiếng', 'mấy ní', 'bão giá', 'chuyện úc', 'du học', 'người việt'];
  const lower = systemPrompt.toLowerCase();
  return viKeywords.some(k => lower.includes(k));
}

// ── Single article content prompt ─────────────────────────────────────────

function buildSingleArticlePrompt(article: Article, systemPrompt: string): string {
  const articleBlock = `Title: ${article.title}\nSource: ${article.source}\nURL: ${article.url}\nDescription: ${article.description}`;

  const isVi = isVietnamesePrompt(systemPrompt);

  if (isVi) {
    return [
      '🚨🚨🚨 CRITICAL LANGUAGE REQUIREMENT 🚨🚨🚨',
      '▶▶▶ YOU MUST WRITE 100% IN VIETNAMESE (TIẾNG VIỆT). ◀◀◀',
      '▶▶▶ ZERO ENGLISH IN emojiTitle, facebookText, summary. ◀◀◀',
      '▶▶▶ NẾU BẠN VIẾT TIẾNG ANH, OUTPUT SẼ BỊ TỪ CHỐI VÀ XÓA. ◀◀◀',
      '',
      'BẠN LÀ TRỢ LÝ SÁNG TẠO NỘI DUNG CHO TRANG FACEBOOK "Australia 101 - Chuyện Úc chút chút!"',
      'Đối tượng: Người Việt 16-35 tuổi, du học sinh / đang sống / chuẩn bị đi Úc.',
      'Giọng văn: Gần gũi, đời, hơi "cợt nhẹ" (dùng từ như: mấy ní, bão giá, bay màu, xót ví, luật mới chấn động).',
      '',
      '📋 CẤU TRÚC BẮT BUỘC:',
      '1. [HOOK & HEADLINE]: 1 dòng IN HOA + 1-2 emoji mạnh (🚨📢💸✈️🇦🇺). Gây tò mò, FOMO.',
      '2. [SAPO]: 2-3 câu diễn giải headline bằng ngôn ngữ đời thường.',
      '3. [KEY POINTS]: Dùng heading IN HOA + bullet 🔹 gạch 3-5 chi tiết cốt lõi.',
      '4. [HỆ QUẢ]: Tin này ảnh hưởng gì đến ví tiền/visa/quyền lợi của du học sinh?',
      '5. [LỜI KHUYÊN]: 1-2 câu khuyên thiết thực.',
      '6. [CTA]: 1 câu hỏi tương tác + kêu gọi follow "Australia 101 - Chuyện Úc chút chút!"',
      '7. [HASHTAGS]: 5-8 hashtags (#Australia101 #ChuyenUcChutChut #TinTucUc + keyword).',
      '',
      '📝 OUTPUT FORMAT: Trả về CHỈ 1 JSON object hợp lệ, KHÔNG markdown, KHÔNG preamble:',
      '{"emojiTitle":"...","facebookText":"...","summary":"...","imagePrompt":"..."}',
      '',
      '⚠️ QUY TẮC:',
      '- emojiTitle: BẰNG TIẾNG VIỆT, hấp dẫn, có emoji.',
      '- facebookText: BẰNG TIẾNG VIỆT, 200-350 từ, theo đúng cấu trúc 7 phần ở trên.',
      '- summary: BẰNG TIẾNG VIỆT, 2-3 câu tóm tắt.',
      '- imagePrompt: (CHỈ MỤC NÀY VIẾT BẰNG TIẾNG ANH) Prompt tạo hình ảnh minh họa.',
      '',
      '🚫 TUYỆT ĐỐI KHÔNG:',
      '- Viết emojiTitle bằng tiếng Anh',
      '- Viết facebookText bằng tiếng Anh',
      '- Viết summary bằng tiếng Anh',
      '- Dùng văn phong học thuật, báo chí khô khan',
      '- Bỏ qua cấu trúc 7 phần bắt buộc',
      '',
      'BÀI VIẾT CẦN XỬ LÝ (DỊCH VÀ VIẾT LẠI BẰNG TIẾNG VIỆT):',
      articleBlock,
    ].join('\n');
  }

  // English / generic prompt
  return [
    'You are a social media content creator. Follow the system prompt instructions EXACTLY.',
    '',
    'For the article below, create a JSON object with:',
    '- emojiTitle: A dramatic, attention-grabbing headline with 1-2 strong emojis (🚨, 💀, ⚖️, 📢, ❗)',
    '- facebookText: A full Facebook post (200-350 words) with line breaks, emojis as bullets, ALL CAPS for headings.',
    '- summary: 2-3 sentence summary.',
    '- imagePrompt: A detailed prompt for AI image generation.',
    '',
    'Return ONLY a valid JSON object (no markdown, no preamble):',
    '{"emojiTitle":"...","facebookText":"...","summary":"...","imagePrompt":"..."}',
    '',
    'ARTICLE TO PROCESS:',
    articleBlock,
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
        facebookText: parsed.facebookText,
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
  const isVi = isVietnamesePrompt(systemPrompt);

  return [
    isVi
      ? `Bạn là trợ lý sáng tạo nội dung cho nền tảng ${platform}. TOÀN BỘ nội dung PHẢI VIẾT BẰNG TIẾNG VIỆT.`
      : `You are a social media content creator for ${platform}. Follow all platform-specific guidelines.`,
    '',
    '--- ORIGINAL ARTICLE ---',
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `URL: ${article.url}`,
    '',
    '--- FACEBOOK DRAFT ---',
    facebookText,
    '',
    isVi
      ? `Viết lại bài viết trên phù hợp cho nền tảng ${platform}. Trả về CHỈ nội dung bài viết.`
      : `Rewrite the post above for ${platform}. Adapt length, tone, and format. Return ONLY the post content.`,
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
