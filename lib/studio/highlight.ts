/**
 * Which words on the card are highlighted.
 *
 * The rule version splits the title on a colon or a comma. It is right often enough on the
 * SOP's own "MỸ: <headline>" shape and wrong the rest of the time, because where the
 * emphasis belongs is a judgement about the sentence, not about its punctuation — and the
 * model that wrote the headline is the thing that knows.
 *
 * The one hard requirement: the answer has to be a span of the title, character for
 * character, or the renderer cannot highlight it. Anything else falls back to the rule, so a
 * card is never worse than it was before the model was asked.
 */
import { generateContent, isAvailable } from '@/app/api/pipeline/openrouter-client';
import { getSetting, setSetting } from './settings';
import { hashOf } from './hash';

export type HighlightMode = 'none' | 'after-colon' | 'first-clause' | 'ai';

/** The mechanical rule, unchanged — what every kit did before, and the fallback now. */
export function ruleHighlight(title: string, mode: HighlightMode): string | null {
  if (mode === 'none') return null;
  if (mode === 'first-clause') return title.split(/[,—–]/)[0]?.trim() || null;
  return title.split(/[:—–]/)[1]?.trim() || null;
}

const strip = (s: string) => s.trim().replace(/^["'“”‘’\s]+|["'“”‘’.,;:\s]+$/g, '');

/**
 * The model's answer as it appears in the title, or null.
 *
 * Case-insensitive on the way in and the title's own casing on the way out: a model that
 * shouts back `CỤ BÀ 82 TUỔI` still means those words, and the card should draw them the way
 * the headline writes them.
 */
export function matchInTitle(title: string, answer: string): string | null {
  const want = strip(answer);
  if (want.length < 2) return null;
  const i = title.toLocaleLowerCase('vi').indexOf(want.toLocaleLowerCase('vi'));
  if (i < 0) return null;
  const span = title.slice(i, i + want.length);
  // Highlighting the whole headline highlights nothing.
  if (strip(span).length >= strip(title).length) return null;
  return span;
}

const PROMPT = (title: string) =>
  `Đây là tiêu đề một bài tin tiếng Việt cho trang Facebook:\n\n${title}\n\n` +
  'Chọn ĐÚNG MỘT đoạn liền mạch trong tiêu đề trên để tô sáng — phần mang thông tin gây chú ý nhất ' +
  '(con số, hậu quả, thay đổi chính sách), không phải phần dẫn như tên nước hay tên nguồn. ' +
  'Trả lời bằng đúng đoạn văn bản đó, sao chép nguyên văn từ tiêu đề, không thêm dấu ngoặc, ' +
  'không giải thích, không viết lại. Đoạn phải ngắn hơn cả tiêu đề.';

async function askModel(title: string): Promise<string> {
  if (!isAvailable()) throw new Error('Chưa có GEMINI_API_KEY.');
  return generateContent('Bạn chọn đoạn cần tô sáng trong tiêu đề. Chỉ trả về đoạn đó.', PROMPT(title));
}

/**
 * The span to highlight, asked once per headline.
 *
 * Cached in `studio_settings` by the title's hash: the same headline is previewed on the Ảnh
 * screen every time a control moves, and asking on each of those would spend money to get the
 * same six words. A fallback is never cached — the next run should get a real answer.
 */
export async function chooseHighlight(
  title: string,
  ask: (title: string) => Promise<string> = askModel,
): Promise<string | null> {
  const key = `hl.${hashOf(title)}`;
  const seen = getSetting(key, null);
  if (seen) return seen;
  try {
    const span = matchInTitle(title, await ask(title));
    if (!span) return ruleHighlight(title, 'after-colon');
    setSetting(key, span);
    return span;
  } catch {
    return ruleHighlight(title, 'after-colon');
  }
}
