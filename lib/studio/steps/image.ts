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
import { GET as renderClassic } from '@/app/api/image/card/route';
import { GET as renderStudio } from '@/app/api/studio/card/route';
import { layoutFindings, measureCard } from '../gates/layout';
import { cardParams, cardEngine, cardPath } from '../kits/load';
import { paletteFor } from '../card/theme';
import { hashOf } from '../hash';
import type { Draft } from '../gold';
import { chooseHighlight, ruleHighlight } from '../highlight';
import { isDemoChannel } from './registry';
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

/**
 * The span to highlight, when the kit leaves it to the model.
 *
 * Asked once per headline and cached, because the Ảnh screen re-previews on every control
 * move and a headline's emphasis does not change between two of them. A demo channel never
 * asks: the demo pack does not reach the network, and the rule is a fine answer there.
 */
async function highlightFor(draft: Draft, ctx: RunCtx): Promise<string | null> {
  const mode = ((ctx.kit.card ?? {}) as { highlight?: string }).highlight;
  if (mode !== 'ai') return null;
  if (isDemoChannel(ctx.channel)) return ruleHighlight(draft.title, 'after-colon');
  return chooseHighlight(draft.title);
}

function cardUrl(draft: Draft & { highlight?: string | null }, ctx: RunCtx): string {
  const item = ctx.outputs.fetch as SourceItem | undefined;
  // Two urls, two jobs: the page for the classic route to scrape, the picture for the
  // studio route to draw. One argument doing both meant studio kits rendered no background.
  return `http://127.0.0.1${cardPath(ctx.kit)}?${cardParams(ctx.kit, draft, item?.url, item?.images?.[0])}`;
}

/**
 * Preview cards are named by a hash of the parameters that drew them, so changing any card
 * control changes the <img> src and the browser fetches a different picture. v1 reused one
 * filename per run and cached it on disk — a theme change redrew nothing at all.
 */
function previewFile(draft: Draft & { highlight?: string | null }, ctx: RunCtx): string {
  return `${ctx.runId}-card-${hashOf(cardPath(ctx.kit), cardUrl(draft, ctx))}.png`;
}

/** Keep one preview card per run: the knobs move a lot and each move is a file. */
function sweepPreviews(ctx: RunCtx, keep: string): void {
  try {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.startsWith(`${ctx.runId}-card-`) && f !== keep) {
        fs.rmSync(path.join(OUT_DIR, f), { force: true });
      }
    }
  } catch {
    /* a preview that cannot be swept is still a preview */
  }
}

async function renderTo(file: string, draft: Draft & { highlight?: string | null }, ctx: RunCtx): Promise<string> {
  const render = cardEngine(ctx.kit) === 'studio' ? renderStudio : renderClassic;
  const res = await render(new NextRequest(cardUrl(draft, ctx)));
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `Trình dựng ảnh trả về 404 — ${cardPath(ctx.kit)} chỉ bật khi STUDIO_ENABLED được đặt.`
        : `Trình dựng ảnh trả về ${res.status}.`,
    );
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const abs = path.join(OUT_DIR, file);
  fs.writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
  return abs;
}

/**
 * Any card this kit can draw, as a file — the end card the overlay pass fades in over the
 * last seconds, for instance. Same renderer as the post's own card, so an outro looks like
 * it belongs to the same channel rather than like a second design.
 */
export async function renderCardTo(
  file: string,
  title: string,
  ctx: RunCtx,
): Promise<string> {
  return renderTo(file, { title, text: '', hashtags: [], comments: [] } as Draft, ctx);
}

export const imageStep: Step<Draft, CardAsset> = {
  name: 'image',
  from: 'draft',

  async preview(draft, ctx) {
    if (!draft?.title) throw new Error('Chưa có bài để dựng ảnh.');
    // The preview IS the card. Satori composition is local, so showing the real thing costs
    // the same as describing one — and a preview of a card is a card.
    const withHl = { ...draft, highlight: await highlightFor(draft, ctx) };
    const file = previewFile(withHl, ctx);
    if (!fs.existsSync(path.join(OUT_DIR, file))) {
      await renderTo(file, withHl, ctx);
      sweepPreviews(ctx, file);
    }
    return {
      kind: 'png',
      data: { url: `/studio-runs/${file}` },
      cost: { usd: 0, note: 'dựng tại chỗ' },
    };
  },

  async run(draft, ctx) {
    const file = `${ctx.runId}-card.png`;
    const abs = await renderTo(file, { ...draft, highlight: await highlightFor(draft, ctx) }, ctx);
    return { url: `/studio-runs/${file}`, path: abs, kind: 'png' as const };
  },

  async gate(card, ctx) {
    // The palette under test is the one that rendered: the classic route's fixed blue band,
    // or the theme this kit chose.
    const tab = (ctx.kit.card ?? {}) as { theme?: string; highlightColor?: string };
    const pal = cardEngine(ctx.kit) === 'studio' ? paletteFor(tab.theme as any, tab.highlightColor) : null;
    const m = await measureCard(fs.readFileSync(card.path));
    return {
      checked: 3,
      findings: layoutFindings(m, pal ? pal.hl : HIGHLIGHT, pal ? pal.bg : BAND),
    };
  },
};
