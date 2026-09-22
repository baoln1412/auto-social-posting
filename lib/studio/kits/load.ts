/**
 * Kit → engine arguments. One place where a tab becomes a query parameter or a CLI flag, so
 * a kit field that nothing can honour is visible here as a field with no reader.
 */
import type { Kit, Overrides } from '../steps/types';

export interface CardTab {
  ratio?: '4:5' | '1:1';
  highlight?: 'none' | 'after-colon' | 'first-clause';
  background?: 'article' | 'none';
}

/** The clause the SOP paints in the highlight colour. */
function highlightOf(title: string, mode: CardTab['highlight']): string | null {
  if (mode === 'none') return null;
  if (mode === 'first-clause') return title.split(/[,—–]/)[0]?.trim() || null;
  // 'after-colon' — the SOP's own convention: "MỸ: <the headline>".
  return title.split(/[:—–]/)[1]?.trim() || null;
}

export function cardParams(kit: Kit, draft: { title: string }, articleUrl?: string): URLSearchParams {
  const card = (kit.card ?? {}) as CardTab;
  const q = new URLSearchParams({
    title: draft.title,
    ratio: card.ratio === '1:1' ? '1:1' : '4:5',
  });
  const hl = highlightOf(draft.title, card.highlight ?? 'after-colon');
  if (hl) q.set('hl', hl);
  if (articleUrl && (card.background ?? 'article') === 'article') q.set('article', articleUrl);
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
    durationBand: ov.durationBand ?? f.durationBand ?? 'medium',
  };
}

export function voiceId(kit: Kit): string | undefined {
  return ((kit.voice ?? {}) as { voiceId?: string }).voiceId;
}
