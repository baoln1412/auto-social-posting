import { describe, it, expect } from 'vitest';
import {
  MAX_LAYERS,
  canAdd,
  clampLayer,
  copyFrom,
  inPaintOrder,
  moveLayer,
  newLayer,
  nextZ,
  reorder,
  resizeLayer,
  toPixels,
  type Layer,
} from '@/lib/studio/layers';

const L = (over: Partial<Layer> = {}): Layer => ({
  id: 'a',
  type: 'shape',
  x: 0.2,
  y: 0.2,
  w: 0.3,
  h: 0.2,
  z: 1,
  ...over,
});

describe('relative units', () => {
  it('multiplies out to the frame it is drawn on', () => {
    // 0..1 and never pixels: a kit is portable data, and `x: 540` would mean something
    // different the day a frame stops being 1080 wide.
    expect(toPixels(L(), 1080, 1920)).toEqual({ left: 216, top: 384, width: 324, height: 384 });
    expect(toPixels(L(), 540, 960)).toEqual({ left: 108, top: 192, width: 162, height: 192 });
  });

  it('never rounds a layer away to nothing', () => {
    const tiny = toPixels({ x: 0, y: 0, w: 0.0001, h: 0.0001 }, 1080, 1920);
    expect(tiny.width).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(0);
  });
});

describe('clamping', () => {
  it('stops a layer at the edge instead of letting it leave the frame', () => {
    // ffmpeg accepts an overlay at a negative x and silently draws nothing, which looks
    // exactly like the layer having been lost.
    const out = clampLayer(L({ x: 0.9, y: 0.95, w: 0.4, h: 0.3 }));
    expect(out.x + out.w).toBeLessThanOrEqual(1);
    expect(out.y + out.h).toBeLessThanOrEqual(1);
    expect(out.x).toBeGreaterThanOrEqual(0);
  });

  it('survives a NaN rather than writing one into the kit', () => {
    const out = clampLayer(L({ x: NaN, w: NaN }));
    expect(Number.isFinite(out.x)).toBe(true);
    expect(out.w).toBeGreaterThan(0);
  });
});

describe('the stack', () => {
  const three = [L({ id: 'a', z: 1 }), L({ id: 'b', z: 2 }), L({ id: 'c', z: 3 })];

  it('paints bottom first', () => {
    expect(inPaintOrder([...three].reverse()).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the owner’s order when two layers tie', () => {
    const tied = [L({ id: 'x', z: 5 }), L({ id: 'y', z: 5 })];
    expect(inPaintOrder(tied).map((l) => l.id)).toEqual(['x', 'y']);
  });

  it('moves a layer one place by swapping, not by renumbering', () => {
    const up = reorder(three, 'a', 1);
    expect(inPaintOrder(up).map((l) => l.id)).toEqual(['b', 'a', 'c']);
    // Only the two that traded places changed at all.
    expect(up.find((l) => l.id === 'c')!.z).toBe(3);
  });

  it('does nothing at the ends rather than wrapping around', () => {
    expect(reorder(three, 'a', -1)).toEqual(three);
    expect(reorder(three, 'c', 1)).toEqual(three);
    expect(reorder(three, 'nope', 1)).toEqual(three);
  });

  it('puts a new layer on top', () => {
    expect(nextZ(three)).toBe(4);
    expect(newLayer('text', three, 'n').z).toBe(4);
  });

  it('stops at twenty, the way the reference counts them', () => {
    const full = Array.from({ length: MAX_LAYERS }, (_, i) => L({ id: `l${i}`, z: i }));
    expect(canAdd(full)).toBe(false);
    expect(canAdd(full.slice(1))).toBe(true);
  });
});

describe('moving', () => {
  it('drags a group together', () => {
    const g = [L({ id: 'a', group: 'g' }), L({ id: 'b', group: 'g', x: 0.5 }), L({ id: 'c' })];
    const out = moveLayer(g, 'a', 0.1, 0);
    expect(out.find((l) => l.id === 'a')!.x).toBeCloseTo(0.3);
    expect(out.find((l) => l.id === 'b')!.x).toBeCloseTo(0.6);
    expect(out.find((l) => l.id === 'c')!.x).toBeCloseTo(0.2);
  });

  it('refuses to move or resize a locked layer', () => {
    const locked = [L({ id: 'a', locked: true })];
    expect(moveLayer(locked, 'a', 0.2, 0.2)).toEqual(locked);
    expect(resizeLayer(locked, 'a', 0.2, 0.2)).toEqual(locked);
  });

  it('keeps a dragged group inside the frame, layer by layer', () => {
    const g = [L({ id: 'a', group: 'g', x: 0.9 }), L({ id: 'b', group: 'g', x: 0.1 })];
    const out = moveLayer(g, 'a', 0.5, 0);
    for (const l of out) expect(l.x + l.w).toBeLessThanOrEqual(1);
  });
});

describe('copying from the other frame', () => {
  it('takes the owner’s layers and gives each a new id', () => {
    const src = [L({ id: 'a' }), L({ id: 'b', z: 2 })];
    const out = copyFrom(src, (i) => `new${i}`);
    expect(out.map((l) => l.id)).toEqual(['new0', 'new1']);
    expect(out[1].z).toBe(2);
  });

  it('leaves the engine’s own rows behind — they are not the owner’s to copy', () => {
    expect(copyFrom([L({ id: 'card', locked: true })], (i) => `n${i}`)).toEqual([]);
  });
});
