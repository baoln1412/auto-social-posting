/**
 * The 12-topic taxonomy for the Vietnamese-diaspora news pipeline.
 * SINGLE SOURCE OF TRUTH — the UI, market config, and classification validation
 * all import from here. The pipeline SKILL/CONTENT_SOP mirror these ids for the LLM.
 *
 * `id` is a stable kebab-case key stored in silver/gold `topics` (JSON array) and in
 * each market's `enabledTopics`. Never rename an id (it would orphan stored rows).
 */

export interface Topic {
  id: string;
  vi: string; // Vietnamese label shown in the UI
  en: string; // English label (internal / reference)
}

export const TOPICS: Topic[] = [
  { id: 'immigration',   vi: 'Di trú & Pháp lý',                 en: 'Immigration & Legal Status' },
  { id: 'labor',         vi: 'Lao động & Việc làm',              en: 'Labor & Employment' },
  { id: 'education',      vi: 'Giáo dục & Du học',                en: 'Education & Study Abroad' },
  { id: 'finance-scams', vi: 'Tài chính, Lừa đảo & Kinh doanh',  en: 'Finance, Scams & Business' },
  { id: 'safety',        vi: 'An toàn Cộng đồng',                en: 'Community Safety' },
  { id: 'health',        vi: 'Sức khỏe & Đời sống',              en: 'Health & Wellbeing' },
  { id: 'travel',        vi: 'Đi lại & Di chuyển',               en: 'Travel & Mobility' },
  { id: 'family',        vi: 'Gia đình & Trẻ em',                en: 'Family & Children' },
  { id: 'housing',       vi: 'Chi phí Sinh hoạt & Nhà ở',        en: 'Cost of Living & Housing' },
  { id: 'community',     vi: 'Cộng đồng Người Việt Hải ngoại',   en: 'Overseas Vietnamese Community' },
  { id: 'remittances',   vi: 'Kiều hối & Kết nối Quê hương',     en: 'Remittances & Home Country Connection' },
  { id: 'justice',       vi: 'Công bằng Sắc tộc & Xã hội',       en: 'Racial & Social Justice' },
];

export const TOPIC_IDS: string[] = TOPICS.map((t) => t.id);

/** Default when a market has no explicit config: all topics enabled. */
export const DEFAULT_ENABLED_TOPICS: string[] = [...TOPIC_IDS];

/** Topics whose posts need the extra FB-compliance self-check (report/awareness framing). */
export const SENSITIVE_TOPICS = new Set(['finance-scams', 'justice']);

const TOPIC_ID_SET = new Set(TOPIC_IDS);

/** Filter arbitrary input down to known topic ids (deduped, order-preserving). */
export function validTopics(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const x of ids) {
    if (typeof x === 'string' && TOPIC_ID_SET.has(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

export function topicLabel(id: string): string {
  return TOPICS.find((t) => t.id === id)?.vi ?? id;
}
