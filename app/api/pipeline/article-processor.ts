import { Article, ArticleWithSummary, PostDraft } from '@/app/types';
import {
  generateContent as geminiGenerate,
  isAvailable as isGeminiAvailable,
  BATCH_SIZE,
} from './gemini-client';

// ── Emoji picker ──────────────────────────────────────────────────────────

function pickEmoji(title: string): string {
  const lower = title.toLowerCase();
  if (/goal|score|.fc|united|city|real|barca|madrid|bayern/.test(lower)) return '⚽';
  if (/champion|cup|trophy|win|victory/.test(lower)) return '🏆';
  if (/transfer|sign|deal/.test(lower)) return '✍️';
  if (/injury|hurt|surgery/.test(lower)) return '🩹';
  if (/manager|coach|sack/.test(lower)) return '👔';
  if (/stadium|fans|crowd|match/.test(lower)) return '🏟️';
  if (/red|card/.test(lower)) return '🟥';
  if (/yellow/.test(lower)) return '🟨';
  return '🏃';
}

// ── Image Prompt Builder (Removed per user request) ────────────────────

// ── Sports Social Media Specialist prompt ─────────────────────────────

function buildContentPrompt(article: Article): string {
  return [
    '=== ROLE ===',
    'You are an expert Football Social Media Specialist.',
    'Read the provided news article and transform it into a high-engagement Facebook post in Vietnamese.',
    '',
    '=== TITLE FORMAT ===',
    'Bilingual format:',
    '- emojiTitle: English title with **bold emphasis** + relevant emoji',
    '- emojiTitleVi: Vietnamese title with **bold emphasis** + same emoji',
    '',
    '=== MAIN CONTENT (facebookText) ===',
    'Write a dynamic, short summarization in Vietnamese naturally covering the following details:',
    '- Match time / Date of event',
    '- Teams involved',
    '- The outstanding or best performed player',
    '- The main match highlight or crucial moment',
    'Keep it natural and engaging like a fan page post. Do NOT simply bullet point these items! Blend them into a fluent narrative paragraph. End the post with an engaging question for the fans.',
    '',
    '=== EXTRACTION FIELDS ===',
    'You also need to explicitly extract these values in their own fields:',
    '- matchTime: When the match occurred (e.g. "Last night", "Saturday", "8:00 PM")',
    '- matchTeams: Which teams played (e.g. "Manchester United vs Arsenal")',
    '- bestPlayer: The best performed player in the match (e.g. "Lionel Messi")',
    '- matchHighlight: A very short 1-sentence highlight of the match',
    '- summary: A strictly factual 3-sentence summary in English',
    '',
    '=== ARTICLE TO PROCESS ===',
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `URL: ${article.url}`,
    `Description: ${article.description}`,
    '',
    'Return ONLY a valid JSON object (no markdown formatting, no preamble):',
    '{"emojiTitle":"...","emojiTitleVi":"...","facebookText":"...","matchTime":"...","matchTeams":"...","bestPlayer":"...","matchHighlight":"...","summary":"..."}'
  ].join('\\n');
}

// ── Batch content prompt (multiple articles per call) ────────

function buildBatchContentPrompt(articles: Article[]): string {
  const articleBlocks = articles
    .map(
      (a, i) =>
        `--- ARTICLE ${i + 1} ---\\nTitle: ${a.title}\\nSource: ${a.source}\\nURL: ${a.url}\\nDescription: ${a.description}`,
    )
    .join('\\n\\n');

  return [
    'You are an expert Football Social Media Specialist.',
    'Process each independent sports article to produce a Facebook post json object.',
    'CRITICAL REQUIREMENT 1: The `facebookText` MUST be highly detailed, comprehensive, and LONG (strictly between 1000 and 1500 characters in length). Expand extensively on the background context, emotional impact, tactical analysis or news implications. You MUST properly split the text into 3-4 well-structured paragraphs using \\n\\n for clear spacing. Do not write a single block of text.',
    'CRITICAL REQUIREMENT 2: The `facebookText` MUST be written in natural Vietnamese. For match news, include time and teams. For general news, focus on the individuals and impact. End with an engaging question, then on the VERY LAST LINE add: "Nguồn: {source name}" (where {source name} is replaced with the article source provided).',
    'Extract `matchTime`, `matchTeams`, `bestPlayer`, `matchHighlight`, and `summary` (3-sentence English fact). If any of these are not applicable (e.g. a transfer news article has no matchTime), you MUST output "N/A".',
    'Return ONLY a valid JSON array of objects (no markdown code blocks, no preamble, strictly JSON array):',
    '[{"emojiTitle":"...","emojiTitleVi":"...","facebookText":"...","matchTime":"...","matchTeams":"...","bestPlayer":"...","matchHighlight":"...","summary":"..."}, ...]',
    '',
    'ARTICLES TO PROCESS:',
    articleBlocks,
  ].join('\\n');
}

// ── Fallback post builder ─────────────────────────────────────────────────

export function buildFallbackPost(article: Article): PostDraft {
  const emoji = pickEmoji(article.title);
  const words = article.title.trim().split(/\\s+/);
  const emojiTitle = `${words.slice(0, 15).join(' ')} ${emoji}`;
  const desc = article.description || 'A developing football story...';

  const facebookText =
    `${emojiTitle}\\n\\n` +
    `${desc}\\n\\n` +
    `👉 Theo dõi để cập nhật tin tức thể thao mới nhất!`;

  const articleWithSummary: ArticleWithSummary = { ...article, summary: desc };
  return {
    article: articleWithSummary,
    emojiTitle: emojiTitle,
    emojiTitleVi: emojiTitle,
    facebookText,
    matchTime: 'Unknown',
    matchTeams: 'Unknown',
    bestPlayer: 'Unknown',
    matchHighlight: 'Pending',
    generatedImageUrl: article.imageUrl,
  };
}

// ── AI engine detection ───────────────────────────────────────────────────

export type AiEngine = 'gemini' | 'notebooklm' | 'fallback';

export function detectEngine(): AiEngine {
  if (isGeminiAvailable()) return 'gemini';
  return 'fallback';
}

// ── Main processor ────────────────────────────────────────────────────────

let activeEngine: AiEngine = 'fallback';

export async function initPipelineNotebook(): Promise<string | null> {
  if (isGeminiAvailable()) {
    activeEngine = 'gemini';
    console.log('[pipeline] Using Gemini API engine');
    return 'gemini';
  }
  activeEngine = 'fallback';
  return null;
}

export async function addArticleSource(article: Article): Promise<boolean> {
  return false;
}

function extractJsonMatch(raw: string): string | null {
  // Try to find a JSON array first
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  // Fallback: find a JSON object
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return null;
}

/**
 * Parse an AI response JSON into PostDraft paired with an article.
 */
function parseBatchAiResponse(
  raw: string,
  articles: Article[],
): (PostDraft | null)[] {
  console.log('[pipeline] Raw AI output snippet:', raw.substring(0, 500) + '...');
  const jsonMatch = extractJsonMatch(raw);
  if (!jsonMatch) return articles.map(() => null);

  try {
    let parsed: any = JSON.parse(jsonMatch);
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

      const finalImage = article.imageUrl; // Image generation disabled. Uses native image.

      return {
        article: articleWithSummary,
        emojiTitle: item.emojiTitle,
        emojiTitleVi: item.emojiTitleVi ?? '',
        facebookText: item.facebookText,
        matchTime: item.matchTime ?? '',
        matchTeams: item.matchTeams ?? '',
        bestPlayer: item.bestPlayer ?? '',
        matchHighlight: item.matchHighlight ?? '',
        generatedImageUrl: finalImage,
      };
    });
  } catch {
    return articles.map(() => null);
  }
}

/**
 * Process a batch of articles with OpenRouter.
 */
export async function processBatchGemini(
  articles: Article[],
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
    console.log(`[pipeline] Gemini batch ${batchNum}/${totalBatches}`);

    let results: (PostDraft | null)[];
    try {
      const prompt = buildBatchContentPrompt(batch);
      const raw = await geminiGenerate('You are a helpful football social media assistant.', prompt);
      results = parseBatchAiResponse(raw, batch);

      // Add a 15-second delay to strictly respect the 5 Requests Per Minute (RPM) free tier limit.
      if (batchNum < totalBatches) {
        console.log(`[pipeline] Waiting 15s to respect Gemini 5 RPM limit...`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    } catch (err) {
      console.error(`[pipeline] Gemini batch ${batchNum} failed:`, err);
      results = batch.map(() => null);
    }

    for (let j = 0; j < batch.length; j++) {
      const globalIndex = batchStart + j;
      if (!results[j]) {
        console.warn(`[pipeline] Skipping article (rejected by AI for not being a match, or parse failed): ${batch[j].title}`);
        continue;
      }
      onPost(results[j]!, globalIndex);
    }
  }
}

/**
 * Process a single article if requested alone.
 */
export async function processArticle(article: Article): Promise<PostDraft> {
  return buildFallbackPost(article);
}

export async function cleanupPipelineNotebook(): Promise<void> {
  // Free operation
}

