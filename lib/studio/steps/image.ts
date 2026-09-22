/**
 * image — the branded card, through the existing /api/image/card renderer.
 *
 * The route's GET is imported and called directly rather than fetched over HTTP: Studio runs
 * inside the same Next server, so a round trip would only buy a base-URL guess and, on
 * posting.desoul.dev, a Cloudflare Access sign-in page instead of a PNG (the bug
 * app/lib/localMedia.ts exists to document).
 */
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET as renderCard } from '@/app/api/image/card/route';
import { layoutFindings, measureCard } from '../gates/layout';
import { cardParams } from '../kits/load';
import type { Draft } from '../gold';
import type { RunCtx, SourceItem, Step } from './types';

const OUT_DIR = path.join(process.cwd(), 'public', 'studio-runs');

/** The card's own palette — the colours the renderer composites with. */
const HIGHLIGHT = '#F8EF63';
const BAND = '#1D51A4';

export interface CardAsset {
  url: string;
  path: string;
  kind: 'png';
}

function cardUrl(draft: Draft, ctx: RunCtx): string {
  const item = ctx.outputs.fetch as SourceItem | undefined;
  return `http://127.0.0.1/api/image/card?${cardParams(ctx.kit, draft, item?.url)}`;
}

async function renderTo(file: string, draft: Draft, ctx: RunCtx): Promise<string> {
  const res = await renderCard(new NextRequest(cardUrl(draft, ctx)));
  if (!res.ok) throw new Error(`Trình dựng ảnh trả về ${res.status}.`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const abs = path.join(OUT_DIR, file);
  fs.writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
  return abs;
}

export const imageStep: Step<Draft, CardAsset> = {
  name: 'image',
  from: 'draft',

  async preview(draft, ctx) {
    if (!draft?.title) throw new Error('Chưa có bài để dựng ảnh.');
    // The preview IS the card. Satori composition is local, so showing the real thing costs
    // the same as describing one — and a preview of a card is a card.
    // ponytail: rendered once and left on disk, so a page reload does not re-render. run()
    // always re-renders, which is what makes an edited draft show up.
    const file = `${ctx.runId}-card.png`;
    if (!fs.existsSync(path.join(OUT_DIR, file))) await renderTo(file, draft, ctx);
    return {
      kind: 'png',
      data: { url: `/studio-runs/${file}` },
      cost: { usd: 0, note: 'dựng tại chỗ' },
    };
  },

  async run(draft, ctx) {
    const file = `${ctx.runId}-card.png`;
    const abs = await renderTo(file, draft, ctx);
    return { url: `/studio-runs/${file}`, path: abs, kind: 'png' as const };
  },

  async gate(card) {
    const m = await measureCard(fs.readFileSync(card.path));
    return { checked: 3, findings: layoutFindings(m, HIGHLIGHT, BAND) };
  },
};
