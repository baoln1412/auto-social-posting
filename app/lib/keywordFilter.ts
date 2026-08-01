/**
 * Deterministic keyword pre-filter for the medallion crawl (bronze stage).
 *
 * Each market's `keywordConfig` (edited in Settings → Keyword Filter) decides
 * which raw articles are worth keeping BEFORE the expensive LLM classify/generate
 * steps. Rules, in order:
 *   1. excludeKeywords  → always drop (hard block)
 *   2. politicalKeywords → always drop (hard block)
 *   3. useCrimeFilter + crimeKeywords → keep only if a crime keyword matches
 *   4. tier1/tier2/minScore → keep only if weighted score ≥ minScore
 *
 * With the default empty config ({tier1:[],tier2:[],minScore:1}) nothing is
 * filtered — articles pass through unchanged, so this is opt-in per market.
 *
 * For immigration, the relevant gate is the tier1/tier2 immigration terms (plus
 * exclude/political hard-blocks). `crimeKeywords`/`useCrimeFilter` are LEGACY
 * fields from this project's crime-news origin and are not used for immigration;
 * leave them unset.
 *
 * ⚠️ LANGUAGE-SPECIFIC. Matching is literal substring (case-insensitive). Sources
 * are multilingual (German/Chinese/Vietnamese/English), so keywords only match
 * text written in the same language. The hard blocks (exclude/political) fail
 * open — empty lists drop nothing. But the POSITIVE tier gate (tier1/tier2
 * scoring) DROPS anything that doesn't match: an English keyword list on a
 * Chinese/German market matches nothing and would drop EVERY article. Only enable
 * the tier gate on a market whose keywords are written in that market's source
 * language. Real immigration relevance is decided by the LLM in the silver step,
 * which reads every source language natively.
 */

import type { KeywordConfig } from '@/app/types';

function buildRegex(keywords: string[]): RegExp | null {
  const cleaned = keywords.map((k) => k.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const escaped = cleaned.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('|'), 'i');
}

function countMatches(text: string, keywords: string[]): number {
  let n = 0;
  for (const k of keywords) {
    const t = k.trim();
    if (t && text.includes(t.toLowerCase())) n++;
  }
  return n;
}

/**
 * Returns true if the article (title + description) should be KEPT for this
 * market's keywordConfig. `null`/undefined config → keep everything.
 */
export function passesKeywordFilter(
  title: string,
  description: string,
  kc: KeywordConfig | null | undefined,
): boolean {
  if (!kc) return true;
  const text = `${title ?? ''} ${description ?? ''}`;
  const lower = text.toLowerCase();

  // 1 + 2 — hard blocks
  const excludeRe = buildRegex(kc.excludeKeywords ?? []);
  if (excludeRe?.test(text)) return false;
  const politicalRe = buildRegex(kc.politicalKeywords ?? []);
  if (politicalRe?.test(text)) return false;

  // 3 — crime gate (only when explicitly enabled)
  if (kc.useCrimeFilter && (kc.crimeKeywords ?? []).length > 0) {
    const crimeRe = buildRegex(kc.crimeKeywords ?? []);
    if (crimeRe && !crimeRe.test(text)) return false;
  }

  // 4 — tier scoring (only when tiers are configured)
  const tier1 = kc.tier1 ?? [];
  const tier2 = kc.tier2 ?? [];
  if (tier1.length > 0 || tier2.length > 0) {
    const score = countMatches(lower, tier1) * 2 + countMatches(lower, tier2);
    if (score < (kc.minScore ?? 1)) return false;
  }

  return true;
}
