import { Article, ArticleWithSummary, PostDraft, KeywordConfig } from '@/app/types';
import {
  generateContent as geminiGenerate,
  generateImage as geminiGenerateImage,
  isAvailable as isGeminiAvailable,
  BATCH_SIZE,
} from './gemini-client';

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
 * Filter articles by relevance using Gemini AI (runs AFTER keyword filter).
 */
export async function filterRelevantArticles(
  articles: Article[],
  systemPrompt: string,
  onProgress: (msg: string) => void,
): Promise<Article[]> {
  if (!isGeminiAvailable() || articles.length === 0) return articles;

  onProgress(`🔍 AI-filtering ${articles.length} articles for relevance...`);

  try {
    const filterPrompt = buildRelevanceFilterPrompt(articles, systemPrompt);
    const raw = await geminiGenerate(
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

function buildBatchContentPrompt(articles: Article[], systemPrompt: string): string {
  const articleBlocks = articles
    .map(
      (a, i) =>
        `--- ARTICLE ${i + 1} ---\nTitle: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nDescription: ${a.description}`,
    )
    .join('\n\n');

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
      '📋 CẤU TRÚC BẮT BUỘC CHO MỖI BÀI:',
      '1. [HOOK & HEADLINE]: 1 dòng IN HOA + 1-2 emoji mạnh (🚨📢💸✈️🇦🇺). Gây tò mò, FOMO.',
      '2. [SAPO]: 2-3 câu diễn giải headline bằng ngôn ngữ đời thường.',
      '3. [KEY POINTS]: Dùng heading IN HOA + bullet 🔹 gạch 3-5 chi tiết cốt lõi.',
      '4. [HỆ QUẢ]: Tin này ảnh hưởng gì đến ví tiền/visa/quyền lợi của du học sinh?',
      '5. [LỜI KHUYÊN]: 1-2 câu khuyên thiết thực.',
      '6. [CTA]: 1 câu hỏi tương tác + kêu gọi follow "Australia 101 - Chuyện Úc chút chút!"',
      '7. [HASHTAGS]: 5-8 hashtags (#Australia101 #ChuyenUcChutChut #TinTucUc + keyword).',
      '',
      '📝 OUTPUT FORMAT: Trả về CHỈ JSON array hợp lệ, KHÔNG markdown, KHÔNG preamble:',
      '[{"emojiTitle":"...","facebookText":"...","summary":"...","imagePrompt":"..."}, ...]',
      '',
      '⚠️ QUY TẮC:',
      '- emojiTitle: BẰNG TIẾNG VIỆT, hấp dẫn, có emoji. VÍ DỤ: "🚨 ÚC TĂNG LƯƠNG TỐI THIỂU – DU HỌC SINH ĐƯỢC LỢI GÌ?"',
      '- facebookText: BẰNG TIẾNG VIỆT, 200-350 từ, theo đúng cấu trúc 7 phần ở trên.',
      '- summary: BẰNG TIẾNG VIỆT, 2-3 câu tóm tắt.',
      '- imagePrompt: (CHỈ MỤC NÀY VIẾT BẰNG TIẾNG ANH) Prompt tạo hình ảnh minh họa.',
    '',
    '📌 VÍ DỤ MẪU OUTPUT (BẮT BUỘC PHẢI THEO ĐÚNG PHONG CÁCH NÀY):',
    '[{',
    '  "emojiTitle": "🚨 ÚC TĂNG LƯƠNG TỐI THIỂU LÊN $24.10/GIỜ – MẤY NÍ ƠI CẬP NHẬT NGAY!",',
    '  "facebookText": "🚨 ÚC CHÍNH THỨC TĂNG LƯƠNG TỐI THIỂU – DU HỌC SINH ĐƯỢC LỢI GÌ?\\n\\nTin vui cho mấy ní đang làm part-time ở Úc nè! Fair Work Commission vừa công bố tăng lương tối thiểu, có hiệu lực từ 1/7.\\n\\n📌 NHỮNG ĐIỂM CHÍNH CẦN LƯU Ý:\\n\\n🔹 Lương tối thiểu tăng lên $24.10/giờ (trước đó $23.23)\\n🔹 Áp dụng cho TẤT CẢ người lao động, kể cả du học sinh\\n🔹 Casual loading vẫn giữ 25%, tức casual sẽ nhận khoảng $30.13/giờ\\n🔹 Các ngành hospitality, retail, aged care đều được hưởng\\n\\n👉 TÓM LẠI LÀ:\\n\\nMấy ní làm part-time sẽ được tăng lương tự động. Nhưng LƯU Ý: nếu chủ không tăng, mấy ní có quyền khiếu nại lên Fair Work Ombudsman nha!\\n\\n💡 LỜI KHUYÊN:\\nCheck payslip kỹ từ ngày 1/7. Nếu thấy lương vẫn cũ → liên hệ Fair Work ngay, đừng ngại!\\n\\nMấy ní thấy lương ở Úc có đủ sống không? Comment cho mình biết nha! 👇\\nFollow Australia 101 - Chuyện Úc chút chút! để cập nhật tin mới mỗi ngày!\\n\\n#Australia101 #ChuyenUcChutChut #TinTucUc #LuongToiThieu #DuHocUc #FairWork",',
    '  "summary": "Úc chính thức tăng lương tối thiểu lên $24.10/giờ từ 1/7. Du học sinh làm part-time sẽ được hưởng mức lương mới. Casual loading vẫn 25%.",',
    '  "imagePrompt": "Modern Australian cityscape with diverse young workers in a cafe and retail setting, warm lighting, minimum wage increase announcement banner, Australian flag colors, professional photography style"',
    '}]',
    '',
    '🚫 TUYỆT ĐỐI KHÔNG:',
    '- Viết emojiTitle bằng tiếng Anh (SAI: "📰 Australia increases minimum wage")',
    '- Viết facebookText bằng tiếng Anh',
    '- Viết summary bằng tiếng Anh',
    '- Dùng văn phong học thuật, báo chí khô khan',
    '- Bỏ qua cấu trúc 7 phần bắt buộc',
    '',
    'CÁC BÀI VIẾT CẦN XỬ LÝ (DỊCH VÀ VIẾT LẠI BẰNG TIẾNG VIỆT):',
    articleBlocks,
  ].join('\n');
  }

  // English / generic prompt — follow the system prompt's own structure
  return [
    'You are a social media content creator. Follow the system prompt instructions EXACTLY.',
    '',
    'For each article below, create a JSON object with:',
    '- emojiTitle: A dramatic, attention-grabbing headline with 1-2 strong emojis (🚨, 💀, ⚖️, 📢, ❗)',
    '- facebookText: A full Facebook post (200-350 words) following the exact structure in the system prompt. Use line breaks, emojis as bullets, ALL CAPS for headings.',
    '- summary: 2-3 sentence summary.',
    '- imagePrompt: A detailed prompt for AI image generation. Describe the scene, mood, colors, style. Make it dramatic and news-worthy.',
    '',
    'Return ONLY a valid JSON array (no markdown, no preamble):',
    '[{"emojiTitle":"...","facebookText":"...","summary":"...","imagePrompt":"..."}, ...]',
    '',
    'EXAMPLE OUTPUT:',
    '[{',
    '  "emojiTitle": "🚨 BREAKING: Man Arrested After High-Speed Chase Through Downtown 💀",',
    '  "facebookText": "🚨 BREAKING: HIGH-SPEED CHASE ENDS IN DRAMATIC ARREST\\n\\nA tense standoff unfolded today as police chased a suspect through downtown.\\n\\n📌 WHAT WE KNOW SO FAR:\\n\\n🔹 Chase started at 2pm after a reported robbery\\n🔹 Multiple units involved\\n🔹 Suspect crashed near Main St\\n🔹 No bystanders injured\\n\\n😱 THE SHOCKING PART:\\nThe suspect was a wanted fugitive with 3 active warrants.\\n\\n⚖️ WHERE THINGS STAND:\\nSuspect in custody facing multiple felony charges.\\n\\nWhat do you think? 👇\\n\\n#BreakingNews #TrueCrime",',
    '  "summary": "A high-speed police chase ended in arrest after a robbery suspect crashed downtown.",',
    '  "imagePrompt": "Dramatic nighttime city street with police car lights reflecting off wet pavement, cinematic mood, crime scene atmosphere"',
    '}]',
    '',
    'ARTICLES TO PROCESS:',
    articleBlocks,
  ].join('\n');
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
  // First, try to extract from markdown code fences (```json...``` or ```...```)
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    const content = fenceMatch[1].trim();
    // Verify it looks like JSON
    if (content.startsWith('[') || content.startsWith('{')) {
      return content;
    }
  }

  // Then try to find raw JSON array or object
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return null;
}

function parseBatchAiResponse(
  raw: string,
  articles: Article[],
): { post: PostDraft | null; imagePrompt: string | null }[] {
  console.log('[pipeline] Raw AI output snippet:', raw.substring(0, 500) + '...');
  const jsonMatch = extractJsonMatch(raw);
  if (!jsonMatch) {
    console.error('[pipeline] ❌ extractJsonMatch returned null — could not find JSON in Gemini output');
    console.error('[pipeline] Raw output (first 2000 chars):', raw.substring(0, 2000));
    return articles.map(() => ({ post: null, imagePrompt: null }));
  }

  try {
    let parsed = JSON.parse(jsonMatch);
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }
    console.log(`[pipeline] ✅ Parsed ${parsed.length} items from JSON`);

    return articles.map((article, i) => {
      const item = parsed[i];
      if (!item || !item.emojiTitle || !item.facebookText) {
        console.warn(`[pipeline] ⚠️ Missing emojiTitle/facebookText for article ${i}: ${article.title.slice(0, 50)}`);
        return { post: null, imagePrompt: null };
      }

      const articleWithSummary: ArticleWithSummary = {
        ...article,
        summary: item.summary ?? article.description,
      };

      return {
        post: {
          article: articleWithSummary,
          emojiTitle: item.emojiTitle,
          facebookText: item.facebookText,
          generatedImageUrl: undefined,
          platformDrafts: {},
        },
        imagePrompt: item.imagePrompt ?? null,
      };
    });
  } catch (err) {
    console.error('[pipeline] ❌ JSON.parse failed:', err);
    console.error('[pipeline] JSON match (first 1000 chars):', jsonMatch.substring(0, 1000));
    return articles.map(() => ({ post: null, imagePrompt: null }));
  }
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
      const draft = await geminiGenerate(prompt, userPrompt);
      drafts[platform] = draft.trim();
      console.log(`[pipeline] Generated ${platform} draft for: ${article.title.slice(0, 50)}`);
    } catch (err) {
      console.error(`[pipeline] Failed to generate ${platform} draft:`, err);
    }
  }

  return drafts;
}

/**
 * Process a batch of articles with Gemini.
 * systemPrompt comes from the content page's configuration.
 * platformPrompts contains per-platform system prompts for generating variants.
 */
export async function processBatchGemini(
  articles: Article[],
  systemPrompt: string,
  onPost: (post: PostDraft, index: number) => Promise<void>,
  onProgress: (current: number, total: number, title: string) => void,
  platformPrompts?: Record<string, string>,
  storedUserPrompt?: string,
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

    let results: { post: PostDraft | null; imagePrompt: string | null }[];
    try {
      // Use stored user prompt if available; otherwise fall back to hardcoded builder
      let userPrompt: string;
      if (storedUserPrompt && storedUserPrompt.trim()) {
        // Build article blocks for injection
        const articleBlocks = batch
          .map(
            (a, i) =>
              `--- ARTICLE ${i + 1} ---\nTitle: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nDescription: ${a.description}`,
          )
          .join('\n\n');
        userPrompt = storedUserPrompt.replace('{articles}', articleBlocks);
        console.log(`[pipeline] Using STORED user prompt (${userPrompt.length} chars)`);
      } else {
        userPrompt = buildBatchContentPrompt(batch, systemPrompt);
        console.log(`[pipeline] Using HARDCODED built prompt (${userPrompt.length} chars)`);
      }
      const raw = await geminiGenerate(systemPrompt, userPrompt, true);
      console.log(`[pipeline] Gemini raw output length: ${raw.length}`);
      console.log(`[pipeline] Gemini raw output first 1000 chars: ${raw.substring(0, 1000)}`);
      results = parseBatchAiResponse(raw, batch);
      const successCount = results.filter(r => r.post !== null).length;
      console.log(`[pipeline] Parsed ${successCount}/${batch.length} posts from batch ${batchNum}`);

      if (batchNum < totalBatches) {
        console.log(`[pipeline] Waiting 15s to respect Gemini RPM limit...`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    } catch (err) {
      console.error(`[pipeline] Gemini batch ${batchNum} failed:`, err);
      let errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('429')) errMsg = 'Quota Exceeded (429). Please wait a minute or upgrade your Gemini API plan.';
      onProgress(batchStart + 1, articles.length, `❌ AI Error: ${errMsg}`);
      results = batch.map(() => ({ post: null, imagePrompt: null }));
      if (errMsg.includes('Quota Exceeded')) break;
    }

    for (let j = 0; j < batch.length; j++) {
      const globalIndex = batchStart + j;
      const { post, imagePrompt } = results[j];
      if (!post) {
        console.warn(`[pipeline] Skipping article (parse failed): ${batch[j].title}`);
        onProgress(globalIndex + 1, articles.length, `⚠️ Bỏ qua bài viết (Lỗi parser): ${batch[j].title.slice(0, 40)}`);
        continue;
      }

      // Generate image with Gemini (TEMPORARILY DISABLED)
      if (imagePrompt) {
        /*
        try {
          onProgress(
            globalIndex + 1,
            articles.length,
            `🎨 Đang tạo hình ảnh: ${post.emojiTitle.slice(0, 40)}...`,
          );
          const imageUrl = await geminiGenerateImage(imagePrompt);
          if (imageUrl) {
            post.generatedImageUrl = imageUrl;
            console.log(`[pipeline] Generated image for: ${post.emojiTitle.slice(0, 50)}`);
          }
        } catch (err) {
          console.error(`[pipeline] Image generation failed for: ${batch[j].title}`, err);
        }
        */
        console.log(`[pipeline] Image generation temporarily disabled`);
      }

      // Generate platform-specific drafts if platform prompts are configured
      if (platformPrompts && Object.keys(platformPrompts).length > 0) {
        try {
          onProgress(
            globalIndex + 1,
            articles.length,
            `📱 Đang tạo bản nháp đa nền tảng: ${post.emojiTitle.slice(0, 40)}...`,
          );
          post.platformDrafts = await generatePlatformDrafts(
            batch[j],
            post.facebookText,
            platformPrompts,
            systemPrompt,
          );
        } catch (err) {
          console.error(`[pipeline] Platform drafts failed for: ${batch[j].title}`, err);
        }
      }

      await onPost(post, globalIndex);
    }
  }
}

export async function processArticle(article: Article): Promise<PostDraft> {
  return buildFallbackPost(article);
}

export async function cleanupPipelineNotebook(): Promise<void> {
  // No-op
}
