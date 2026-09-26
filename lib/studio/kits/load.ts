/**
 * Kit → engine arguments. One place where a tab becomes a query parameter or a CLI flag, so
 * a kit field that nothing can honour is visible here as a field with no reader.
 */
import type { Kit, Overrides } from '../steps/types';

export interface CardTab {
  engine?: 'classic' | 'studio';
  ratio?: '4:5' | '1:1' | '9:16';
  highlight?: 'none' | 'after-colon' | 'first-clause' | 'ai';
  background?: 'article' | 'none';
  theme?: string;
  font?: string;
  radius?: number;
  titleSize?: number;
  highlightColor?: string;
  width?: number;
  y?: number;
  comments?: 'none' | 'group';
  /** An explicit main picture, chosen on the Ảnh step. Beats the article's own. */
  bgUrl?: string;
  /** An explicit circle inset. Classic engine only — the studio card has no inset. */
  insetUrl?: string;
}

/** The clause the SOP paints in the highlight colour. */
function highlightOf(title: string, mode: CardTab['highlight'], chosen?: string | null): string | null {
  if (mode === 'none') return null;
  // 'ai': the span the model picked while the post was being made, resolved upstream and
  // handed in. Falls through to the colon rule when nothing was resolved, so a card is never
  // worse than it was before the model was asked.
  if (mode === 'ai') return chosen ?? (title.split(/[:—–]/)[1]?.trim() || null);
  if (mode === 'first-clause') return title.split(/[,—–]/)[0]?.trim() || null;
  // 'after-colon' — the SOP's own convention: "MỸ: <the headline>".
  return title.split(/[:—–]/)[1]?.trim() || null;
}

/** Which route renders this kit's card. */
export function cardEngine(kit: Kit): 'classic' | 'studio' {
  return ((kit.card ?? {}) as CardTab).engine === 'studio' ? 'studio' : 'classic';
}

export function cardPath(kit: Kit): string {
  return cardEngine(kit) === 'studio' ? '/api/studio/card' : '/api/image/card';
}

/**
 * Only what the chosen engine actually reads. Sending `theme` to the classic route would be
 * a kit promising a look that route has no parameter for — the mistake that made the Brand
 * Kit smaller than it was drawn.
 */
export function cardParams(
  kit: Kit,
  draft: { title: string; comments?: string[]; highlight?: string | null },
  /** The article's own PAGE url. The classic route scrapes og:image out of it. */
  articleUrl?: string,
  /**
   * A picture url. The studio route has no scraper — it fetches `bg` as an image — so
   * handing it `articleUrl` fed a renderer an HTML page and every studio-engine kit drew a
   * blank background, in the preview and in the render. Measured on the Bộ nhận diện page:
   * the classic kit came back (91,96,126) and both studio kits (20,19,15).
   */
  pictureUrl?: string,
): URLSearchParams {
  const card = (kit.card ?? {}) as CardTab;
  const studio = cardEngine(kit) === 'studio';
  const ratio = card.ratio ?? '4:5';

  const q = new URLSearchParams({
    title: draft.title,
    ratio: studio ? ratio : ratio === '1:1' ? '1:1' : '4:5',
  });

  const hl = highlightOf(draft.title, card.highlight ?? 'after-colon', draft.highlight);
  if (hl) q.set('hl', hl);

  if (studio) {
    for (const [k, v] of [
      ['theme', card.theme],
      ['font', card.font],
      ['radius', card.radius],
      ['titleSize', card.titleSize],
      ['highlightColor', card.highlightColor],
      ['width', card.width],
      ['y', card.y],
    ] as const) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    // "Chụp nhóm": the headline and the chosen comments on one card, which is what the
    // reference's cards actually are. Sent as the text, not a flag, so the renderer needs
    // no access to the run.
    if ((card.comments ?? 'none') === 'group') {
      for (const c of (draft.comments ?? []).slice(0, 3)) {
        if (c.trim()) q.append('c', c.trim());
      }
    }
    if (card.bgUrl) q.set('bg', card.bgUrl);
    else if (pictureUrl && (card.background ?? 'none') === 'article') q.set('bg', pictureUrl);
  } else if (card.bgUrl) {
    // An explicit picture beats the article's own: the Ảnh step is where the owner says
    // which of the article's images — or an upload — this post's card should show.
    q.set('bg', card.bgUrl);
    if (card.insetUrl) q.set('inset', card.insetUrl);
  } else if (articleUrl && (card.background ?? 'article') === 'article') {
    q.set('article', articleUrl);
    if (card.insetUrl) q.set('inset', card.insetUrl);
  }
  return q;
}

export interface CaptionTab {
  preset?: string;
  size?: number;
  pos?: number;
  wordsPerCue?: number;
  maxLines?: number;
  case?: 'upper' | 'none';
  font?: string;
  color?: string;
  highlightMode?: 'word' | 'block' | 'none';
  highlightColor?: string;
  highlightBg?: string;
  outlineWidth?: number;
  shadow?: boolean;
  band?: boolean;
  bandOpacity?: number;
}

/**
 * What goes to make-reel.py's --style. Undefined knobs are left to caption_style.py.
 *
 * Flat in the kit, nested here: a schema-driven form edits `highlightColor` far better than
 * `highlight.color`, and caption_style.py's own shape is not something a kit should mirror.
 * The nesting happens once, at the boundary.
 */
export function captionStyle(kit: Kit): Record<string, unknown> {
  const c = (kit.captions ?? {}) as CaptionTab;
  const out: Record<string, unknown> = {};
  for (const k of ['preset', 'size', 'pos', 'wordsPerCue', 'maxLines', 'case', 'font', 'color'] as const) {
    if (c[k] !== undefined) out[k] = c[k];
  }

  const outline: Record<string, unknown> = {};
  if (c.outlineWidth !== undefined) outline.w = c.outlineWidth;
  if (Object.keys(outline).length) out.outline = outline;

  // caption_style.py reads dy 0 as "shadow off", so the boolean becomes an offset.
  if (c.shadow !== undefined) out.shadow = { dy: c.shadow ? 6 : 0 };

  const hl: Record<string, unknown> = {};
  if (c.highlightMode !== undefined) hl.mode = c.highlightMode;
  if (c.highlightColor !== undefined) hl.color = c.highlightColor;
  if (c.highlightBg !== undefined) hl.bg = c.highlightBg;
  if (Object.keys(hl).length) out.highlight = hl;

  const band: Record<string, unknown> = {};
  if (c.band !== undefined) band.on = c.band;
  if (c.bandOpacity !== undefined) band.opacity = c.bandOpacity;
  if (Object.keys(band).length) out.band = band;

  return out;
}

export interface FrameTab {
  layout?: 'card-top' | 'continuous';
  intro?: boolean;
  durationBand?: 'short' | 'medium' | 'long';
}

/**
 * The frame tab is exactly the two flags startRenderJob already takes, plus the length band
 * the budget gate reads. The drawer wins; neither writes back to the kit.
 */
export function effectiveFrame(kit: Kit, ov: Overrides) {
  const f = (kit.frame ?? {}) as FrameTab;
  return {
    includeLayout: ov.includeLayout ?? f.layout !== 'continuous',
    includeIntro: ov.includeIntro ?? f.intro !== false,
    // `long` and not `medium`: a kit with no band stated gets the one that matches this
    // repo's actual content. At 25–75s, `medium` would have blocked ~95% of gold posts —
    // a default that fires on almost everything teaches the owner to click past the gate.
    durationBand: ov.durationBand ?? f.durationBand ?? 'long',
  };
}

export function voiceId(kit: Kit): string | undefined {
  return ((kit.voice ?? {}) as { voiceId?: string }).voiceId;
}
