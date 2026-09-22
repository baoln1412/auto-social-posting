/**
 * Vietnamese draft generation for sources the pipeline does not already cover.
 *
 * The plan expected to extract a prompt module out of app/api/pipeline/gold/route.ts. There
 * is none there: that route is a *receiver* — the scheduled Claude Code session generates
 * with the immigration-pipeline skill and POSTs the finished items in. So the prompt here is
 * the repo's own CONTENT_SOP.md, read at call time rather than paraphrased, because a second
 * copy of the SOP would drift from the first the day either is edited.
 *
 * Gold rows skip this entirely — the gold row already IS the draft, and re-writing it would
 * spend money to make it worse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContent, isAvailable } from '@/app/api/pipeline/openrouter-client';
import type { Money, SourceItem } from './steps/types';

export interface Draft {
  title: string;
  text: string;
  hashtags: string[];
  /** comment_1..3 — the pool a reel's extra scenes come from. */
  comments: string[];
  sourceUrl?: string;
  source?: string;
}

const SOP_PATH = path.join(
  process.cwd(),
  '.claude/skills/immigration-pipeline/CONTENT_SOP.md',
);

let sopCache: string | null = null;

export function contentSop(): string {
  if (sopCache !== null) return sopCache;
  try {
    sopCache = fs.readFileSync(SOP_PATH, 'utf8');
  } catch {
    sopCache = '';
  }
  return sopCache;
}

/**
 * gemini-3.1-flash-lite-preview, the model openrouter-client.ts pins. Published rates as of
 * 2026-09; an estimate by contract, shown to the owner before the step runs.
 */
const RATE_IN_PER_M = 0.1;
const RATE_OUT_PER_M = 0.4;

export function draftCost(sourceChars: number): Money {
  const inTok = (contentSop().length + sourceChars) / 4;
  const outTok = 1500;
  const usd = (inTok / 1e6) * RATE_IN_PER_M + (outTok / 1e6) * RATE_OUT_PER_M;
  return { usd: Math.round(usd * 10000) / 10000, note: 'gemini-3.1-flash-lite (ước tính)' };
}

export function draftAvailable(): string | null {
  if (!isAvailable()) return 'Chưa có GEMINI_API_KEY — không sinh được bài.';
  if (!contentSop()) return 'Không đọc được CONTENT_SOP.md.';
  return null;
}

/** Tolerant of a fenced answer; strict about the two fields a post cannot exist without. */
export function parseDraftJson(raw: string): Draft {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = (fenced ? fenced[1] : raw).trim();
  let o: Record<string, any>;
  try {
    o = JSON.parse(body);
  } catch {
    throw new Error(`Model không trả về JSON: ${body.slice(0, 120)}`);
  }
  const title = String(o.emoji_title ?? '').trim();
  const text = String(o.body_text ?? '').trim();
  if (!title || !text) throw new Error('Thiếu emoji_title hoặc body_text trong kết quả.');

  return {
    title,
    text,
    hashtags: String(o.hashtags ?? '')
      .split(/\s+/)
      .filter((h) => h.startsWith('#')),
    comments: [o.comment_1, o.comment_2, o.comment_3]
      .map((c) => String(c ?? '').trim())
      .filter(Boolean),
  };
}

export interface MarketContext {
  writing_style?: string;
  wording_rules?: string;
  glossary?: string;
}

export function buildPrompt(item: SourceItem, market: MarketContext): [string, string] {
  const extras = [
    market.writing_style && `## Giọng văn của thị trường này\n${market.writing_style}`,
    market.wording_rules && `## Quy tắc dùng từ\n${market.wording_rules}`,
    market.glossary && market.glossary !== '{}' && `## Từ điển\n${market.glossary}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const system = [
    contentSop(),
    extras,
    'Trả lời DUY NHẤT một đối tượng JSON với các khoá: emoji_title, body_text, hashtags ' +
      '(một chuỗi các thẻ cách nhau bởi dấu cách), comment_1, comment_2, comment_3. ' +
      'Không kèm giải thích, không bọc trong markdown.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const user = [
    item.title && `TIÊU ĐỀ NGUỒN: ${item.title}`,
    item.url && `NGUỒN: ${item.url}`,
    item.source && `TRANG: ${item.source}`,
    `\nNỘI DUNG NGUỒN:\n${item.text}`,
  ]
    .filter(Boolean)
    .join('\n');

  return [system, user];
}

export async function generateDraft(item: SourceItem, market: MarketContext): Promise<Draft> {
  const blocked = draftAvailable();
  if (blocked) throw new Error(blocked);
  const [system, user] = buildPrompt(item, market);
  const draft = parseDraftJson(await generateContent(system, user, true));
  return { ...draft, sourceUrl: item.url, source: item.source };
}
