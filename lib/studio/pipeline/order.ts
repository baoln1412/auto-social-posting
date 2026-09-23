/**
 * The crawl queue, ordered — never filtered.
 *
 * Every hard filter this project has tried on a match queue dropped 35–58 % of the sources
 * that were actually applied, and a relevance floor measured the same way. Both are
 * permanent NO-GOs, so there is no gate here to configure: topic, source weight, recency and
 * the classifier's own score are boosts that move a row up, and a row that scores zero on
 * all four still appears, at the bottom. If a reviewer asks for a threshold, the answer is
 * the measurement, not a toggle.
 *
 * Pure: no lake, no db. The scoring is the part worth testing.
 */

export interface OrderConfig {
  /** Topic ids to push up. Not a whitelist — a row with none of them still ranks. */
  topics: string[];
  topicBoost: number;
  /** By source_name, as `/api/feeds` names them. Absent means 1. */
  sourceWeights: Record<string, number>;
  weightBoost: number;
  recencyBoost: number;
  relevanceBoost: number;
}

export const DEFAULT_ORDER: OrderConfig = {
  topics: [],
  topicBoost: 2,
  sourceWeights: {},
  weightBoost: 1,
  recencyBoost: 1.5,
  relevanceBoost: 1,
};

export interface ScorePart {
  label: string;
  value: number;
}
export interface ScoredRow {
  row: Record<string, any>;
  score: number;
  parts: ScorePart[];
}

function topicsOf(row: Record<string, any>): string[] {
  const raw = row.topics;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.map(String);
    } catch {
      /* a topics column that is not JSON is not a reason to lose the row */
    }
  }
  return row.category ? [String(row.category)] : [];
}

/**
 * One row's place, with the arithmetic that put it there.
 *
 * `index`/`total` are the row's position in what the lake handed back. `getSilver()` returns
 * rows newest-first and does not select `classified_at`, so position IS the recency signal —
 * and lake.ts is not this slice's to edit.
 */
export function scoreRow(
  row: Record<string, any>,
  index: number,
  total: number,
  cfg: OrderConfig,
): ScoredRow {
  const wanted = new Set(cfg.topics);
  const hits = topicsOf(row).filter((t) => wanted.has(t)).length;
  const weight = cfg.sourceWeights[String(row.source_name ?? '')] ?? 1;
  const recency = total > 1 ? 1 - index / (total - 1) : 1;
  const relevance = Number(row.relevance_score);

  const parts: ScorePart[] = [
    { label: 'chủ đề', value: hits * cfg.topicBoost },
    { label: 'nguồn', value: (weight - 1) * cfg.weightBoost },
    { label: 'mới', value: recency * cfg.recencyBoost },
    {
      label: 'điểm lọc',
      value: (Number.isFinite(relevance) ? relevance : 0) * cfg.relevanceBoost,
    },
  ];
  return { row, score: parts.reduce((n, p) => n + p.value, 0), parts };
}

/** Same rows, best first. The length of the output always equals the length of the input. */
export function orderQueue(rows: Record<string, any>[], cfg: OrderConfig): ScoredRow[] {
  return rows
    .map((r, i) => scoreRow(r, i, rows.length, cfg))
    .sort((a, b) => b.score - a.score);
}
