/**
 * One market's pipeline setup.
 *
 * What is NOT here matters as much as what is: the feeds themselves live in `rss_feeds` and
 * are read and written through `/api/feeds`, and the language, writing style, wording rules
 * and system prompt live on the `content_pages` row and go through `/api/pages`. Studio
 * edits those in place. A copy of either in this table would be a second source of truth
 * that drifts the first time anyone opens the old Settings panel.
 *
 * What is here is what the old app has no home for: how the queue is ordered, what shape a
 * post takes, and which kit renders its picture.
 */
import { studioDb } from '../db';
import { DEFAULT_ORDER, type OrderConfig } from './order';
import { DEFAULT_OUTPUT, type OutputConfig } from '../formats';

export interface MediaConfig {
  kitId: string | null;
  /** The pipeline renders a card per post today. */
  renderCard: boolean;
  /** It does not render reels: those are made on demand from Gold. */
  renderReel: boolean;
}

export interface PipelineConfig {
  order: OrderConfig;
  output: OutputConfig;
  media: MediaConfig;
  /** Free text the owner leaves for themselves about the schedule. */
  scheduleNote: string;
  /** Queue the finished reel the moment it renders, with no screen in between. */
  publish: { auto: boolean; to: string[] };
}

export const DEFAULT_PIPELINE: PipelineConfig = {
  order: DEFAULT_ORDER,
  output: DEFAULT_OUTPUT,
  media: { kitId: null, renderCard: true, renderReel: false },
  scheduleNote: '',
  publish: { auto: false, to: ['library'] },
};

export interface StoredPipeline {
  marketId: string;
  config: PipelineConfig;
  revision: number;
  updatedAt: string | null;
}

/** Tab-deep merge over the defaults, so a config written before a field existed still loads. */
function merge(raw: unknown): PipelineConfig {
  const v = (raw ?? {}) as Partial<PipelineConfig>;
  return {
    order: { ...DEFAULT_PIPELINE.order, ...(v.order ?? {}) },
    output: { ...DEFAULT_PIPELINE.output, ...(v.output ?? {}) },
    media: { ...DEFAULT_PIPELINE.media, ...(v.media ?? {}) },
    scheduleNote: typeof v.scheduleNote === 'string' ? v.scheduleNote : '',
    publish: { ...DEFAULT_PIPELINE.publish, ...(v.publish ?? {}) },
  };
}

export function loadPipeline(marketId: string): StoredPipeline {
  const row = studioDb()
    .prepare('SELECT config_json, revision, updated_at FROM studio_pipelines WHERE market_id=?')
    .get(marketId) as { config_json: string; revision: number; updated_at: string } | undefined;

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row?.config_json ?? '{}');
  } catch {
    /* a corrupt row reads as "not configured yet", never as a crash */
  }
  return {
    marketId,
    config: merge(parsed),
    revision: row?.revision ?? 0,
    updatedAt: row?.updated_at ?? null,
  };
}

/**
 * Write, bumping `revision`.
 *
 * The kits table learned the same lesson in slice 5: a stored blob with no version meant a
 * shipped change never reached a market that had already been configured once.
 */
export function savePipeline(marketId: string, config: PipelineConfig): StoredPipeline {
  const next = merge(config);
  studioDb()
    .prepare(
      `INSERT INTO studio_pipelines (market_id, config_json, revision, updated_at)
       VALUES (?,?,1,(strftime('%Y-%m-%dT%H:%M:%fZ','now')))
       ON CONFLICT(market_id) DO UPDATE SET
         config_json = excluded.config_json,
         revision    = studio_pipelines.revision + 1,
         updated_at  = excluded.updated_at`,
    )
    .run(marketId, JSON.stringify(next));
  return loadPipeline(marketId);
}
