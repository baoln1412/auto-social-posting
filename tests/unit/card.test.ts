import { describe, it, expect } from 'vitest';
import {
  FONTS,
  RATIOS,
  THEMES,
  fontFile,
  paletteFor,
  distinguishable,
  saturationOf,
  titleSizeFor,
  type ThemeName,
} from '@/lib/studio/card/theme';
import { contrastRatio } from '@/lib/studio/gates/layout';
import fs from 'node:fs';
import path from 'node:path';

const NAMES = Object.keys(THEMES) as ThemeName[];

describe('the themes', () => {
  it('are the four the plan drew', () => {
    expect(NAMES.sort()).toEqual(['bao', 'pastel', 'sang', 'toi']);
  });

  it('every theme can carry body text on its own background — AA, not 3:1', () => {
    for (const n of NAMES) {
      const p = THEMES[n];
      expect(contrastRatio(p.fg, p.bg), `${n} fg/bg`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every highlight clears 3:1 on its own background, which the layout gate demands', () => {
    for (const n of NAMES) {
      const p = THEMES[n];
      expect(contrastRatio(p.hl, p.bg), `${n} hl/bg`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the highlight distinguishable from the body text, or it is not a highlight', () => {
    for (const n of NAMES) {
      const p = THEMES[n];
      expect(distinguishable(p.hl, p.fg, contrastRatio), `${n} hl/fg`).toBe(true);
    }
  });
});

describe('paletteFor()', () => {
  it('falls back to the light theme for a name nobody defined', () => {
    expect(paletteFor('nonsense' as ThemeName)).toEqual(THEMES.sang);
  });

  it('lets the kit override just the highlight colour', () => {
    const p = paletteFor('toi', '#00FF00');
    expect(p.hl).toBe('#00FF00');
    expect(p.bg).toBe(THEMES.toi.bg);
  });

  it('refuses an override that is not a hex colour, rather than emitting broken CSS', () => {
    expect(paletteFor('toi', 'red; background:url(x)').hl).toBe(THEMES.toi.hl);
    expect(paletteFor('toi', '#12').hl).toBe(THEMES.toi.hl);
    expect(paletteFor('toi', '#AABBCC').hl).toBe('#AABBCC');
  });
});

describe('titleSizeFor()', () => {
  it('shrinks as the headline grows, so a long title still fits its box', () => {
    const short = titleSizeFor(30);
    const long = titleSizeFor(140);
    expect(short).toBeGreaterThan(long);
  });

  it('honours an explicit size from the kit', () => {
    expect(titleSizeFor(140, 96)).toBe(96);
  });

  it('clamps an absurd explicit size instead of rendering off-canvas', () => {
    expect(titleSizeFor(40, 999)).toBeLessThanOrEqual(160);
    expect(titleSizeFor(40, 1)).toBeGreaterThanOrEqual(24);
  });
});

describe('the ratios', () => {
  it('include the 9:16 the kit preview is drawn at', () => {
    expect(RATIOS['9:16']).toEqual([1080, 1920]);
    expect(RATIOS['4:5']).toEqual([1080, 1350]);
    expect(RATIOS['1:1']).toEqual([1080, 1080]);
  });
});

describe('fontFile()', () => {
  it('resolves every offered font to a file that is actually on disk', () => {
    for (const f of FONTS) expect(fs.existsSync(fontFile(f)), f).toBe(true);
  });

  it('falls back rather than letting a kit name a path', () => {
    expect(fontFile('../../../etc/passwd')).toBe(fontFile(FONTS[0]));
    expect(fontFile('nope')).toBe(fontFile(FONTS[0]));
  });
});

describe('distinguishable()', () => {
  it('accepts the brand pairing WCAG contrast cannot see — yellow on white is 1.20:1', () => {
    expect(contrastRatio('#F8EF63', '#FFFFFF')).toBeLessThan(1.3);
    expect(saturationOf('#F8EF63')).toBeGreaterThan(0.8);
    expect(saturationOf('#FFFFFF')).toBe(0);
    expect(distinguishable('#F8EF63', '#FFFFFF', contrastRatio)).toBe(true);
  });

  it('rejects two greys that differ in neither', () => {
    expect(distinguishable('#888888', '#8A8A8A', contrastRatio)).toBe(false);
  });

  it('accepts a pair that differs in brightness alone', () => {
    expect(distinguishable('#000000', '#BBBBBB', contrastRatio)).toBe(true);
  });
});

describe('the card preview redraws when a card control moves', () => {
  it('names the preview file after the parameters that drew it', async () => {
    process.env.STUDIO_ENABLED = '1';
    const { imageStep } = await import('@/lib/studio/steps/image');
    const draft = { title: 'MỸ: MỘT TIN', text: 'Nội dung.', hashtags: [], comments: [] };
    const ctx = (card: Record<string, unknown>) =>
      ({
        runId: 'r1',
        channel: {} as never,
        kit: { id: 'k', name: 'k', card: { engine: 'studio', ...card } },
        tier: 'owner',
        overrides: {},
        selection: { commentIds: [], hideUnselected: false },
        outputs: {},
      }) as never;

    // v1 cached one filename per run, so a theme change redrew nothing at all — the picture
    // on screen stayed the first one rendered for the whole life of the run.
    const a = (await imageStep.preview(draft, ctx({ theme: 'sang' }))).data as { url: string };
    const b = (await imageStep.preview(draft, ctx({ theme: 'toi' }))).data as { url: string };
    expect(a.url).not.toBe(b.url);
    const again = (await imageStep.preview(draft, ctx({ theme: 'sang' }))).data as { url: string };
    expect(again.url).toBe(a.url);

    // And only one survives: a slider dragged across a colour wheel is a file per pixel.
    const dir = path.join(process.cwd(), 'public', 'studio-runs');
    const left = fs.readdirSync(dir).filter((f) => f.startsWith('r1-card-'));
    expect(left).toHaveLength(1);
    for (const f of left) fs.rmSync(path.join(dir, f), { force: true });
  });
});
