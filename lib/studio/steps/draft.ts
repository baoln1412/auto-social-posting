/**
 * draft — the post text.
 *
 * A gold item passes straight through: the gold row already IS a finished Vietnamese post,
 * written by the pipeline against the same SOP. Re-generating it would spend money to make
 * it worse. Every other source goes through lib/studio/gold.ts.
 */
import { query } from '@/app/lib/db';
import { checkCompliance } from '../gates/compliance';
import { draftAvailable, draftCost, generateDraft, type Draft, type PostTab } from '../gold';
import type { RunCtx, SourceItem, Step } from './types';

function isGold(item: SourceItem): boolean {
  return item.id.startsWith('gold:');
}

/** The gold row as a draft — its comments are already the pool the fetch step carried. */
function passThrough(item: SourceItem): Draft {
  return {
    title: item.title,
    text: item.text,
    hashtags: [],
    comments: item.comments.map((c) => c.text),
    sourceUrl: item.url,
    source: item.source,
  };
}

async function marketContext(marketId: string | null) {
  if (!marketId) return {};
  const { data } = await query('content_pages')
    .select('writing_style,wording_rules,glossary')
    .eq('id', marketId)
    .single();
  return (data ?? {}) as { writing_style?: string; wording_rules?: string; glossary?: string };
}

export const draftStep: Step<SourceItem, Draft> = {
  name: 'draft',
  from: 'fetch',

  async preview(item, _ctx) {
    if (!item || typeof item !== 'object') throw new Error('Chưa có bài nguồn để viết.');
    if (isGold(item)) {
      return {
        kind: 'text',
        data: { title: item.title, text: item.text },
        cost: { usd: 0, note: 'bài đã có sẵn trong lake' },
      };
    }
    const blocked = draftAvailable();
    return {
      kind: 'text',
      data: { title: item.title, text: blocked ?? item.text, error: Boolean(blocked) },
      cost: draftCost(item.text.length),
    };
  },

  async run(item, ctx: RunCtx) {
    if (isGold(item)) return passThrough(item);
    return generateDraft(
      item,
      await marketContext(ctx.channel.market_id),
      (ctx.kit.post ?? {}) as PostTab,
    );
  },

  async gate(draft) {
    return checkCompliance(draft);
  },
};
