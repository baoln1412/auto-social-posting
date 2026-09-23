/**
 * "AI chọn theo nội dung" — which of the owner's stickers suits this reel.
 *
 * One call, the cheapest model this repo already talks to, over the scene text and the
 * filenames of the stickers in Kho tài nguyên. It picks by name, because a name is what the
 * owner gave the file and what they would pick by themselves.
 *
 * Cached on (scene text, the set of names): auditioning a caption preset must not re-buy the
 * same answer, and the answer cannot change unless one of its inputs has.
 */
import { generateContent, isAvailable } from '@/app/api/pipeline/openrouter-client';
import { listMedia } from '../assets';
import { cached } from '../cache';
import { hashOf } from '../hash';

/** Roughly what one classification costs on gemini-3.1-flash-lite. Shown, never hidden. */
export const PICK_COST = { usd: 0.001, note: 'chọn nhãn dán bằng AI (ước tính)' };

export interface Sticker {
  id: string;
  name: string;
  path: string;
}

export function stickerChoices(): Sticker[] {
  return listMedia('sticker').map((m) => ({ id: m.id, name: m.name, path: m.path }));
}

/** Pure: the model's answer → one of the offered stickers, or null. */
export function matchName(answer: string, choices: Sticker[]): Sticker | null {
  const a = answer.trim().toLowerCase();
  if (!a) return null;
  return (
    choices.find((c) => c.name.toLowerCase() === a) ??
    // A model that answers "the rabbit one (tho-hong.png)" still named it.
    choices.find((c) => a.includes(c.name.toLowerCase())) ??
    choices.find((c) => c.name.toLowerCase().includes(a)) ??
    null
  );
}

export async function pickSticker(sceneText: string, choices: Sticker[]): Promise<Sticker | null> {
  if (choices.length === 0) return null;
  if (choices.length === 1) return choices[0];
  if (!isAvailable()) return choices[0];

  const names = choices.map((c) => c.name);
  const answer = await cached(hashOf('sticker-pick', sceneText.slice(0, 1200), names), async () =>
    generateContent(
      'Bạn chọn nhãn dán cho một video ngắn tiếng Việt. Trả lời DUY NHẤT tên tệp, không giải thích.',
      `Nội dung video:\n${sceneText.slice(0, 1200)}\n\nCác nhãn dán có sẵn:\n${names.join('\n')}`,
      false,
    ).catch(() => ''),
  );

  // A model that answers nothing useful must not stop the render: the first sticker is what
  // a fixed set would have given anyway.
  return matchName(String(answer ?? ''), choices) ?? choices[0];
}
