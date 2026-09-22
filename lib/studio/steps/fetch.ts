/**
 * The real fetch step: the channel's source, asked for items.
 *
 * `preview` lists the first three without committing to any of them; `run` resolves the one
 * the owner picked. The run's `item_ref` is whatever the owner handed over (a gold id, a
 * pasted URL, a text hash) — the resolved item is kept in the step's own output, so a run
 * survives the lake row it came from being deleted.
 */
import { channelSource, resolveItem, type SourceConfig } from '../sources';
import { loadRunText } from '../sources/text';
import type { RunCtx, SourceItem, Step } from './types';

function cfgFor(cfg: SourceConfig, needs: string, ref: unknown, ctx: RunCtx): SourceConfig {
  const raw = typeof ref === 'string' ? ref.trim() : '';
  const out = { ...cfg };
  if (needs === 'url' && raw) out.url = raw.replace(/^(url|reddit):/, '');
  if (needs === 'text') out.text = loadRunText(ctx.runId) ?? raw;
  return out;
}

export const fetchStep: Step<string, SourceItem> = {
  name: 'fetch',

  async preview(input, ctx) {
    const { def, cfg } = channelSource(ctx.channel.sources_json);
    const blocked = def.blocked();
    if (blocked) throw new Error(blocked);
    const items = await def.list(cfgFor(cfg, def.needs, input, ctx), 3);
    return {
      kind: 'items',
      data: items.slice(0, 3),
      // Reading a source is a fetch, not a model call. Zero is the honest number.
      cost: { usd: 0, note: def.label },
    };
  },

  async run(input, ctx) {
    const { def, cfg } = channelSource(ctx.channel.sources_json);
    const blocked = def.blocked();
    if (blocked) throw new Error(blocked);
    const ref = typeof input === 'string' && /^(gold|reddit|text|url|threads):/.test(input) ? input : null;
    return resolveItem(def, cfgFor(cfg, def.needs, input, ctx), ref);
  },
};
