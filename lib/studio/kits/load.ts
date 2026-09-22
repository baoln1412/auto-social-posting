/**
 * Kit → engine arguments. One place where a tab becomes a query parameter or a CLI flag, so
 * a kit field that nothing can honour is visible here as a field with no reader.
 */
import type { Kit, Overrides } from '../steps/types';

export interface CardTab {
  engine?: 'classic' | 'studio';
  ratio?: '4:5' | '1:1' | '9:16';
  highlight?: 'none' | 'after-colon' | 'first-clause';
  background?: 'article' | 'none';
  theme?: string;
  font?: string;
  radius?: number;
  titleSize?: number;
  highlightColor?: string;
}

/** The clause the SOP paints in the highlight colour. */
function highlightOf(title: string, mode: CardTab['highlight']): string | null {
  if (mode === 'none') return null;
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
export function cardParams(kit: Kit, draft: { title: string }, articleUrl?: string): URLSearchParams {
  const card = (kit.card ?? {}) as CardTab;
  const studio = cardEngine(kit) === 'studio';
  const ratio = card.ratio ?? '4:5';

  const q = new URLSearchParams({
    title: draft.title,
    ratio: studio ? ratio : ratio === '1:1' ? '1:1' : '4:5',
  });

  const hl = highlightOf(draft.title, card.highlight ?? 'after-colon');
  if (hl) q.set('hl', hl);

  if (studio) {
    for (const [k, v] of [
      ['theme', card.theme],
      ['font', card.font],
      ['radius', card.radius],
      ['titleSize', card.titleSize],
      ['highlightColor', card.highlightColor],
    ] as const) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    if (articleUrl && (card.background ?? 'none') === 'article') q.set('bg', articleUrl);
  } else if (articleUrl && (card.background ?? 'article') === 'article') {
    q.set('article', articleUrl);
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
}

/** What goes to make-reel.py's --style. Undefined knobs are left to caption_style.py. */
export function captionStyle(kit: Kit): Record<string, unknown> {
  const c = (kit.captions ?? {}) as CaptionTab;
  const out: Record<string, unknown> = {};
  for (const k of ['preset', 'size', 'pos', 'wordsPerCue', 'maxLines', 'case'] as const) {
    if (c[k] !== undefined) out[k] = c[k];
  }
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
