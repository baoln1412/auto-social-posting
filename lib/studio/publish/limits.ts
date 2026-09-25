/**
 * The caption linter: what would stop this post, and what should give you pause.
 *
 * Two lists, not one. A finding blocks the publish; a warning is a fact the owner decides
 * about. Blocking on a phone number would be wrong — a post can legitimately quote one — but
 * shipping a post with a contact handle in it by accident is exactly the failure this project's
 * compliance rule exists to prevent, so it is said out loud.
 *
 * The numbers are measured, not guessed — `docs/plans/mock-v3/research-features.md` §C carries
 * the source for each one.
 */
import type { Where } from '../steps/publish';

export const LIMITS = {
  /** A Facebook feed post. Reels have no documented cap of their own. */
  facebookPost: 63_206,
  /** IG and TikTok both stop at 2 200; the floor everything else has to live under. */
  reelCaption: 2_200,
  /** What shows before "… thêm". */
  fold: 125,
  ytTitle: 100,
  ytDescription: 5_000,
  tiktokHashtag: 70,
} as const;

export interface Caption {
  title: string;
  text: string;
  firstComment: string;
  /** The article this run came from, when it came from one. */
  sourceUrl?: string;
  hasReel?: boolean;
}

export interface CaptionGate {
  checked: number;
  findings: string[];
  warnings: string[];
}

const URL_RE = /https?:\/\/\S+/;
// A Vietnamese mobile number, an international one, an email, or a handle people actually use.
// Every quantifier is bounded: the unbounded `[\w.+-]+@` version took 1.8 s on a 63 000-character
// caption, because it matched the whole thing and then backtracked looking for an `@`.
const CONTACT_RE =
  /(\b0\d{9,10}\b|\+\d{8,15}\b|[\w.+-]{1,64}@[\w-]{1,63}\.[\w.]{2,24}|\b(zalo|whatsapp|viber|telegram|wechat)\b)/i;

export function lintCaption(c: Caption, where: Where[]): CaptionGate {
  const findings: string[] = [];
  const warnings: string[] = [];
  let checked = 0;

  const text = c.text.trim();
  const toFacebook = where.some((w) => w.startsWith('facebook:'));

  checked++;
  if (!text) findings.push('Nội dung bài đang trống.');

  checked++;
  if (!c.title.trim()) warnings.push('Chưa có tiêu đề — dòng đầu sẽ phải tự gánh.');

  if (toFacebook) {
    checked++;
    if (text.length > LIMITS.facebookPost) {
      findings.push(`Bài dài ${text.length} ký tự, quá giới hạn ${LIMITS.facebookPost} của Facebook.`);
    }
  }

  if (c.hasReel) {
    checked++;
    if (text.length > LIMITS.reelCaption) {
      warnings.push(
        `Dài ${text.length} ký tự. Facebook không công bố giới hạn cho Reels, nhưng Instagram và TikTok cắt ở ${LIMITS.reelCaption} — cùng một caption sẽ bị cụt ở đó.`,
      );
    }
  }

  checked++;
  const fold = text.slice(0, LIMITS.fold);
  const key = c.title.trim().slice(0, 24);
  if (key && text.includes(c.title.trim()) && !fold.includes(key)) {
    warnings.push(`Ý chính nằm sau ${LIMITS.fold} ký tự đầu — phần người đọc thấy trước khi bấm "thêm".`);
  }

  // Only a post that HAS a source can fail to cite one. A paragraph the owner typed has
  // nothing to cite, and inventing the check would make the count a lie.
  if (c.sourceUrl) {
    checked++;
    if (!URL_RE.test(text) && !URL_RE.test(c.firstComment)) {
      findings.push('Chưa dẫn nguồn — thêm link vào bài hoặc vào bình luận đầu.');
    }
  }

  checked++;
  const contact = CONTACT_RE.exec(`${text}\n${c.firstComment}`);
  if (contact) {
    warnings.push(`Có vẻ là thông tin liên hệ trong bài: "${contact[0]}". Bài tin tức không nên có.`);
  }

  return { checked, findings, warnings };
}
