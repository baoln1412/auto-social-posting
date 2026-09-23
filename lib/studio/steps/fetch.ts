/**
 * The real fetch step: the source the owner's paste points at, asked for items.
 *
 * `preview` lists the first three without committing to any of them; `run` resolves the one
 * the owner picked. The run's `item_ref` is whatever the owner handed over (a gold id, a
 * pasted URL, a text hash) — the resolved item is kept in the step's own output, so a run
 * survives the lake row it came from being deleted.
 */
import { SOURCES, channelSource, resolveItem, type SourceConfig, type SourceDef } from '../sources';
import { detectSource } from '../sources/detect';
import { loadRunText } from '../sources/text';
import type { RunCtx, SourceItem, Step } from './types';

/**
 * Which source this run reads — the link wins over the channel's standing source.
 *
 * v1 asked the channel first and consulted the paste only if the channel's source declared
 * `needs: 'url'`; a Reddit link on a gold channel was therefore dropped and the first gold
 * row used instead. The channel decides only when the box is empty.
 */
export function sourceFor(
  sourcesJson: string,
  ref: unknown,
): { def: SourceDef; cfg: SourceConfig } {
  const own = channelSource(sourcesJson);
  const hit = detectSource(typeof ref === 'string' ? ref : '');
  if (!hit) return own;
  if (hit.kind === own.def.kind) return { def: own.def, cfg: { ...own.cfg, ...hit.cfg } };
  // A different source, but still this channel's market: gold is per-market and so is the
  // language a draft is written in.
  return { def: SOURCES[hit.kind], cfg: { ...hit.cfg, marketId: own.cfg.marketId } };
}

/** A long paste lives in its own row, so `item_ref` stays a short `text:<sha>`. */
function withText(cfg: SourceConfig, ctx: RunCtx): SourceConfig {
  const saved = loadRunText(ctx.runId);
  return saved ? { ...cfg, text: saved } : cfg;
}

/** Name the source in every failure. Which source a link went to is exactly what v1 hid. */
function labelled(def: SourceDef, e: unknown): Error {
  return new Error(`${def.label}: ${e instanceof Error ? e.message : String(e)}`);
}

export const fetchStep: Step<string, SourceItem> = {
  name: 'fetch',

  async preview(input, ctx) {
    const { def, cfg } = sourceFor(ctx.channel.sources_json, input);
    const blocked = def.blocked();
    if (blocked) throw labelled(def, blocked);
    let items: SourceItem[];
    try {
      items = await def.list(withText(cfg, ctx), 3);
    } catch (e) {
      throw labelled(def, e);
    }
    return {
      kind: 'items',
      data: items.slice(0, 3),
      // Reading a source is a fetch, not a model call. Zero is the honest number.
      cost: { usd: 0, note: def.label },
    };
  },

  async run(input, ctx) {
    const { def, cfg } = sourceFor(ctx.channel.sources_json, input);
    const blocked = def.blocked();
    if (blocked) throw labelled(def, blocked);
    const ref =
      typeof input === 'string' && /^(gold|reddit|text|url|threads|demo):/.test(input)
        ? input
        : null;
    try {
      return await resolveItem(def, withText(cfg, ctx), ref);
    } catch (e) {
      throw labelled(def, e);
    }
  },
};
