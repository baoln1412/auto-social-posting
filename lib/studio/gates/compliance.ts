/**
 * The Meta Community Standards gate — the repo's CLAUDE.md rule, as code.
 *
 * Three rules, always all three, so `checked` is 3 and a silent no-op can never read as a
 * pass. The third rule is deliberately conditional in strength, not in whether it runs:
 * CLAUDE.md scopes "zero prices or routes" to *sensitive* posts (trafficking, smuggling,
 * drugs, weapons, crime). Applied to every post it would hold a routine "visa fee rises to
 * $185" story, and a gate that cries wolf is a gate the owner learns to click past.
 * Contact details are held on any post: a news page never needs a phone number.
 */
import type { GateResult } from '../steps/types';

export interface DraftLike {
  title: string;
  text: string;
  sourceUrl?: string;
  source?: string;
}

// No \b next to a Vietnamese letter. JS word boundaries are ASCII-only, so /\bđường/ can
// never match — "đường dây buôn người" sailed through the sensitive check, and /đô\b/ never
// fired on "20.000 đô". Both rules read as passing while doing nothing, which is exactly the
// silent no-op `checked` exists to catch. Plain literals and explicit lookarounds instead.
const SENSITIVE =
  /(buôn người|buôn bán người|đưa người trái phép|vượt biên|nhập cảnh trái phép|đường dây|ma túy|heroin|ketamin|súng|vũ khí|buôn lậu|trafficking|smuggl|narcotic)/i;

const CONTACT =
  /(zalo|whatsapp|telegram|wechat|viber|inbox mình|dm mình|liên hệ ngay|(?<!\d)0\d{8,10}(?!\d)|\+\d{9,14}|[\w.+-]+@[\w-]+\.[a-z]{2,})/i;

const OFFER =
  /(nhận làm hồ sơ|bao đậu|cam kết đậu|chắc chắn đậu|dịch vụ trọn gói|giá chỉ|nhận đưa người|cách trốn|cách vượt biên|hướng dẫn trốn|how to smuggle)/i;

const PRICE = /((?<![\d.,])\d[\d.,]*\s*(đô|usd|triệu|tỷ|nghìn đô)|\$\s?\d)/i;
const ROUTE = /(tuyến đường|lộ trình đi|đi qua ngả|qua biên giới bằng|đường dây qua)/i;

export function isSensitive(text: string): boolean {
  return SENSITIVE.test(text);
}

export function checkCompliance(d: DraftLike): GateResult {
  const findings: string[] = [];
  const blob = `${d.title}\n${d.text}`;
  const sensitive = isSensitive(blob);

  // 1 — cite a source.
  if (!d.sourceUrl && !d.source) {
    findings.push('Bài chưa dẫn nguồn — Meta hạ tầm với tin không nguồn.');
  }

  // 2 — report or condemnation, never an offer or a how-to.
  if (OFFER.test(blob)) {
    findings.push('Bài đọc như chào mời dịch vụ hoặc hướng dẫn cách làm, không phải đưa tin.');
  }

  // 3 — no contact details anywhere; no prices or routes on a sensitive post.
  const third: string[] = [];
  if (CONTACT.test(blob)) third.push('thông tin liên hệ');
  if (sensitive && PRICE.test(blob)) third.push('giá tiền trên bài nhạy cảm');
  if (sensitive && ROUTE.test(blob)) third.push('lộ trình đi lại');
  if (third.length) findings.push(`Bài chứa ${third.join(', ')} — phải bỏ trước khi đăng.`);

  return { checked: 3, findings };
}
