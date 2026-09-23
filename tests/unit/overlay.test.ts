import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  H,
  INTRO_SEC,
  OUTRO_SEC,
  STICKER_INSET,
  W,
  dvdAt,
  dvdSvg,
  layoutAt,
  outroAt,
  safeText,
  sceneBoundaries,
  sfxMix,
  stickerAt,
  watermarkSvg,
} from '@/lib/studio/steps/filters';

/**
 * deploy/make-reel.py is the measured $0 path — local edge-tts, local whisper, local ffmpeg —
 * and every overlay in this slice composites over its output rather than changing it. This
 * is that promise, written down: editing it deliberately means updating this hash, which is
 * exactly the friction wanted.
 */
const MAKE_REEL_SHA = '40d89123c914b5cee271ddf6b661999686c35cfd4fd76dfbae3c66f584112c69';

describe('the engine is not edited', () => {
  it('leaves deploy/make-reel.py byte for byte as it was', () => {
    const buf = fs.readFileSync(path.join(process.cwd(), 'deploy', 'make-reel.py'));
    expect(createHash('sha256').update(buf).digest('hex')).toBe(MAKE_REEL_SHA);
  });
});

describe('the sticker', () => {
  it('rests at the same point whether it flew in or was always there', () => {
    const at = (fly?: 'cheo' | 'nay') => stickerAt(['intro'], fly, 200, 200);
    const rest = `${W - 200 - STICKER_INSET.right}`;
    expect(stickerAt(['cover'], undefined, 200, 200)).toContain(rest);
    expect(at('cheo')).toContain(String(H - 200 - STICKER_INSET.bottom));
    expect(at('nay')).toContain(String(H - 200 - STICKER_INSET.bottom));
  });

  it('only shows for the intro when that is what the kit asked for', () => {
    expect(stickerAt(['intro'], 'cheo', 100, 100)).toContain(`between(t,0,${INTRO_SEC})`);
    expect(stickerAt(['cover'], 'cheo', 100, 100)).not.toContain('enable');
    expect(stickerAt([], 'cheo', 100, 100)).toBeNull();
    expect(stickerAt(['reactions'], 'cheo', 100, 100)).toBeNull();
  });
});

describe('the layout', () => {
  it('adds nothing for the layout the reel already renders', () => {
    expect(layoutAt('multi', 800, 1000)).toBeNull();
  });

  it('pins the card near the top for Một khung hình', () => {
    const f = layoutAt('card-top', 800, 1000)!;
    expect(f).toContain(`overlay=${Math.round((W - 800) / 2)}:`);
    expect(f).not.toContain('if(lt(t');
  });

  it('slides the card up and then leaves it for Một khung nối tiếp', () => {
    const f = layoutAt('continuous', 800, 1000)!;
    expect(f).toContain('if(lt(t');
    expect(f).toContain(String(H)); // starts off the bottom edge
  });
});

describe('the drifting signature', () => {
  const f = dvdAt(300, 60);

  it('is an overlay and not drawtext, because this ffmpeg has no drawtext', () => {
    // Measured, not assumed: `drawtext` answers "No such filter" on a build without
    // libfreetype, and the whole pass is lost to it.
    expect(f.startsWith('overlay=')).toBe(true);
    expect(f).not.toContain('drawtext');
  });

  it('travels the frame minus its own box, so it can never leave', () => {
    expect(f).toContain(String(W - 300 - 120)); // 60px margin each side
    expect(f).toContain(String(H - 60 - 160 - 320)); // clear of the caption band
  });

  it('turns at a constant speed rather than easing to a stop at each edge', () => {
    // abs(mod(t,2)-1) is a triangle wave. A sine would read as hesitant at the edges.
    expect(f).toMatch(/abs\(mod\(t\/\d+,2\)-1\)/);
  });

  it('never lets a handle break the picture it is drawn into', () => {
    expect(safeText("it's: 100%\\bad")).not.toMatch(/['\\:%]/);
    expect(dvdSvg('<b>&x')).not.toContain('<b>');
    expect(dvdSvg("a'b:c 50%")).toContain('a b c 50');
  });

  it('never asks for a negative travel, however long the handle is', () => {
    // A handle wider than the frame would otherwise multiply by a negative number and send
    // the overlay off the left edge. (The -1 in abs(mod(t/p,2)-1) is the triangle wave.)
    const wide = dvdAt(5000, 5000);
    expect(wide).toContain('*1'); // clamped to one pixel of travel, not a negative
    expect(wide).not.toMatch(/\*-\d/);
  });
});

describe('the tiled watermark', () => {
  it('is one full-frame picture, not sixty filters', () => {
    const svg = watermarkSvg('@desoul');
    expect(svg).toContain(`width="${W}"`);
    expect(svg).toContain(`height="${H}"`);
    expect((svg.match(/<text /g) ?? []).length).toBeGreaterThan(20);
  });

  it('stays faint enough to read through', () => {
    expect(watermarkSvg('@a')).toContain('fill-opacity="0.06"');
  });

  it('escapes a handle rather than producing broken XML', () => {
    expect(watermarkSvg('<b>&x')).not.toContain('<b>');
  });
});

describe('the end card', () => {
  it('rides the last seconds instead of lengthening the reel', () => {
    const f = outroAt(30, 800, 800)!;
    expect(f).toContain(`gte(t,${(30 - OUTRO_SEC).toFixed(2)})`);
    // No alpha expression: overlay's `alpha` option takes straight|premultiplied and
    // ffmpeg rejects an expression there outright.
    expect(f).not.toContain('alpha=');
  });

  it('is skipped on a reel too short to carry it', () => {
    expect(outroAt(2, 800, 800)).toBeNull();
    expect(outroAt(NaN, 800, 800)).toBeNull();
  });
});

describe('the transition sounds', () => {
  it('lands one between each pair of scenes, scaled onto the real duration', () => {
    // Modelled, not measured: make-reel reports no scene timings. Equal scenes divide the
    // reel equally, which is the property the model has to hold.
    expect(sceneBoundaries([100, 100, 100], 30)).toEqual([10, 20]);
  });

  it('weights a long scene more than a short one', () => {
    const [b] = sceneBoundaries([300, 100], 40);
    expect(b).toBeCloseTo(30, 1);
  });

  it('drops one that would land on the intro or the outro', () => {
    expect(sceneBoundaries([1, 1000], 20)).toEqual([]);
    expect(sceneBoundaries([1000, 1], 20)).toEqual([]);
  });

  it('says nothing to mix when there is one scene, or no duration', () => {
    expect(sceneBoundaries([500], 30)).toEqual([]);
    expect(sceneBoundaries([1, 1], 0)).toEqual([]);
    expect(sfxMix([], 1)).toBeNull();
  });

  it('mixes the narration and every whoosh without re-levelling either', () => {
    const f = sfxMix([5, 10], 1)!;
    expect(f).toContain('adelay=5000|5000');
    expect(f).toContain('adelay=10000|10000');
    expect(f).toContain('amix=inputs=3');
    expect(f).toContain('normalize=0');
    expect(f).toContain('duration=longest');
  });
});

describe('the chain', () => {
  const png = path.join(process.cwd(), 'public', 'studio-demo', 'card.png');

  it('does nothing at all when the kit asks for nothing', async () => {
    const { buildChain } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain({ layout: 'multi', durationSec: 30 });
    expect(built.vOut).toBeNull();
    expect(built.aOut).toBeNull();
    expect(built.inputs).toEqual([]);
  });

  it('threads each overlay into the next, so the reel is re-encoded once', async () => {
    const { buildChain } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain({
      layout: 'card-top',
      card: png,
      sticker: png,
      stickerWhere: ['cover'],
      watermark: png,
      dvd: '@desoul',
      durationSec: 30,
    });
    // [0:v] → [v1] → [v2] → [v3] → [v4]: one filter_complex, not four ffmpeg runs.
    expect(built.filter.startsWith('[0:v]')).toBe(true);
    expect(built.vOut).toBe('[v4]');
    // Four pictures in, four legs out: card, sticker, watermark, signature.
    expect(built.inputs).toHaveLength(4);
    expect(built.filter.split(';')).toHaveLength(4);
  });

  it('copies the audio untouched unless something mixed into it', async () => {
    const { buildChain, overlayArgs } = await import('@/lib/studio/steps/overlay');
    const quiet = await buildChain({ layout: 'card-top', card: png, durationSec: 30 });
    expect(overlayArgs('in.mp4', 'out.mp4', quiet).join(' ')).toContain('-c:a copy');

    const loud = await buildChain({
      layout: 'multi',
      durationSec: 30,
      sfx: png, // any existing file; the mix is decided by the boundaries, not the format
      sceneChars: [100, 100, 100],
    });
    expect(loud.aOut).toBe('[aout]');
    expect(overlayArgs('in.mp4', 'out.mp4', loud).join(' ')).toContain('-c:a aac');
  });

  it('never maps a label it did not create', async () => {
    const { buildChain, overlayArgs } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain({ layout: 'multi', durationSec: 30 });
    const args = overlayArgs('in.mp4', 'out.mp4', built).join(' ');
    expect(args).toContain('-map 0:v');
    expect(args).toContain('-map 0:a');
  });
});

describe('who places the card', () => {
  it('leaves it to the renderer for the layout the renderer already does', async () => {
    const { cardIsOverlay, layoutOf } = await import('@/lib/studio/steps/overlay');
    const kit = { id: 'k', name: 'k', frame: { layout: 'multi' } } as never;
    expect(layoutOf(kit, {})).toBe('multi');
    expect(cardIsOverlay(kit, {})).toBe(false);
  });

  it('takes it over for the two layouts the overlay composes', async () => {
    const { cardIsOverlay } = await import('@/lib/studio/steps/overlay');
    for (const layout of ['card-top', 'continuous']) {
      const kit = { id: 'k', name: 'k', frame: { layout } } as never;
      // Showing it as a plate AND overlaying it would put the same card on screen twice.
      expect(cardIsOverlay(kit, {}), layout).toBe(true);
    }
  });

  it('lets the per-run drawer choose a different layout', async () => {
    const { layoutOf } = await import('@/lib/studio/steps/overlay');
    const kit = { id: 'k', name: 'k', frame: { layout: 'multi' } } as never;
    expect(layoutOf(kit, { frame: { layout: 'continuous' } } as never)).toBe('continuous');
  });
});

describe('the sticker the classifier picks', () => {
  it('finds the file the model named, however it named it', async () => {
    const { matchName } = await import('@/lib/studio/steps/pick');
    const choices = [
      { id: '1', name: 'tho-hong.png', path: '/a' },
      { id: '2', name: 'meo-vang.png', path: '/b' },
    ];
    expect(matchName('meo-vang.png', choices)?.id).toBe('2');
    expect(matchName('  MEO-VANG.PNG ', choices)?.id).toBe('2');
    expect(matchName('I would use meo-vang.png here', choices)?.id).toBe('2');
    expect(matchName('', choices)).toBeNull();
    expect(matchName('something else entirely', choices)).toBeNull();
  });

  it('needs no call at all when there is nothing to choose between', async () => {
    const { pickSticker } = await import('@/lib/studio/steps/pick');
    expect(await pickSticker('bất kỳ', [])).toBeNull();
    const one = [{ id: '1', name: 'a.png', path: '/a' }];
    expect((await pickSticker('bất kỳ', one))?.id).toBe('1');
  });
});
