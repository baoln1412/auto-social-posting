/**
 * The themeable card's palette and metrics.
 *
 * A second renderer beside /api/image/card, not a change to it: the existing route owns the
 * brand overlay, the og:image upgrade and the focal-point crop, and it is the measured path
 * for the pipeline's own cards. This one owns everything the Brand Kit drawing asks for and
 * that one has no parameters for — theme, font, radius, title size, highlight colour.
 *
 * Every value here is pure so the palettes can be contrast-tested rather than eyeballed.
 * --ink-3 was shipped once at 3.2:1 and only a measurement caught it.
 */
export type ThemeName = 'sang' | 'toi' | 'pastel' | 'bao';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * WCAG contrast. Lives here, not in gates/layout.ts, because that file imports sharp and the
 * kit editor is a 'use client' component: the editor has to warn using the SAME arithmetic
 * the gate later judges by, or the two disagree.
 */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface Palette {
  /** Page colour behind everything. */
  bg: string;
  /** Body/title colour. */
  fg: string;
  /** The highlighted clause. */
  hl: string;
  /** Scrim laid over a background photo so text stays readable on it. */
  scrim: string;
  /** Hairline rules, where the theme uses them. */
  rule: string;
  label: string;
}

export const THEMES: Record<ThemeName, Palette> = {
  sang: { label: 'Sáng', bg: '#F5F1E6', fg: '#1D1B16', hl: '#8A5A00', scrim: 'rgba(245,241,230,0.82)', rule: '#D9D2BF' },
  toi: { label: 'Tối', bg: '#14130F', fg: '#FFFFFF', hl: '#F8EF63', scrim: 'rgba(20,19,15,0.72)', rule: '#3A372C' },
  pastel: { label: 'Pastel', bg: '#E8F1EA', fg: '#17301F', hl: '#9B2C5B', scrim: 'rgba(232,241,234,0.82)', rule: '#C5D8CB' },
  bao: { label: 'Báo', bg: '#FFFFFF', fg: '#111111', hl: '#B3121D', scrim: 'rgba(255,255,255,0.86)', rule: '#111111' },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function paletteFor(theme: ThemeName, highlight?: string): Palette {
  const base = THEMES[theme] ?? THEMES.sang;
  // A kit is data, and data reaches this as a string. Anything that is not a plain hex
  // colour is dropped rather than interpolated into a style attribute.
  return highlight && HEX.test(highlight) ? { ...base, hl: highlight } : base;
}

export const RATIOS: Record<string, [number, number]> = {
  '4:5': [1080, 1350],
  '1:1': [1080, 1080],
  '9:16': [1080, 1920],
};

const MIN_SIZE = 24;
const MAX_SIZE = 160;

/** Shrinks with headline length so a long title still fits; an explicit kit size wins. */
export function titleSizeFor(len: number, requested?: number): number {
  if (typeof requested === 'number' && Number.isFinite(requested)) {
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(requested)));
  }
  return len <= 45 ? 88 : len <= 70 ? 76 : len <= 95 ? 64 : len <= 130 ? 54 : 46;
}

/**
 * Fonts are file stems under public/fonts. Adding a family is dropping a .ttf in there and
 * naming it in a kit — no code change, which is why this is a lookup and not an enum.
 */
export const FONTS = [
  'BeVietnamPro-Black',
  'BeVietnamPro-Bold',
  'BeVietnamPro-Medium',
  'BeVietnamPro-Regular',
] as const;

export function fontFile(name: string): string {
  const safe = (FONTS as readonly string[]).includes(name) ? name : FONTS[0];
  return `public/fonts/${safe}.ttf`;
}

/**
 * Is the highlight actually telling the reader something, or does it read as body text?
 *
 * NOT a WCAG contrast check between the two. WCAG measures luminance only, and the pairing
 * that has shipped on this brand's cards for months — #F8EF63 on white — scores 1.20:1 while
 * being obviously different to look at. What separates them is saturation, not brightness.
 * So: different in brightness OR different in saturation.
 */
export function saturationOf(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

export function distinguishable(a: string, b: string, contrast: (x: string, y: string) => number): boolean {
  return contrast(a, b) >= 1.6 || Math.abs(saturationOf(a) - saturationOf(b)) >= 0.4;
}
