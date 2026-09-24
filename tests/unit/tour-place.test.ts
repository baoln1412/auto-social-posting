import { describe, expect, it } from 'vitest';
import { GAP, PAD, holeOf, placeTooltip, type Box } from '@/lib/studio/tour/place';

const overlaps = (a: Box, b: Box) =>
  a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

/** Every place a target can sit on a 1280×800 screen, at the sizes the tour actually uses. */
const TARGETS: Array<[string, Box]> = [
  ['the create box, mid-screen', { left: 320, top: 180, width: 640, height: 150 }],
  ['a nav row, far left', { left: 16, top: 300, width: 200, height: 34 }],
  ['the Telegram tip, bottom left', { left: 16, top: 640, width: 200, height: 130 }],
  ['a wide section at the fold', { left: 280, top: 700, width: 720, height: 90 }],
  ['a button in the top-right corner', { left: 1180, top: 12, width: 84, height: 34 }],
  ['something taller than the screen', { left: 300, top: -200, width: 600, height: 1200 }],
];

describe('placeTooltip', () => {
  const vw = 1280;
  const vh = 800;
  const tw = 300;
  const th = 190;

  it.each(TARGETS)('keeps the card on screen and off the cutout: %s', (_name, target) => {
    const at = placeTooltip(target, vw, vh, tw, th);
    const card = { ...at, width: tw, height: th };

    expect(at.left).toBeGreaterThanOrEqual(12);
    expect(at.top).toBeGreaterThanOrEqual(12);
    expect(at.left + tw).toBeLessThanOrEqual(vw - 12);
    expect(at.top + th).toBeLessThanOrEqual(vh - 12);

    // A target 1200px tall on an 800px screen leaves nowhere to stand; every other one does.
    if (target.height < vh - th - GAP * 2) expect(overlaps(card, holeOf(target))).toBe(false);
  });

  it('prefers the right of the target when the room is there', () => {
    const target = TARGETS[1][1];
    const at = placeTooltip(target, vw, vh, tw, th);
    expect(at.left).toBe(target.left + target.width + PAD + GAP);
  });

  it('drops below when the right would run off the edge', () => {
    const target = { left: 900, top: 180, width: 340, height: 150 };
    const at = placeTooltip(target, vw, vh, tw, th);
    expect(at.top).toBe(target.top + target.height + PAD + GAP);
    expect(at.left + tw).toBeLessThanOrEqual(vw - 12);
  });

  it('goes above when there is room neither right nor below', () => {
    const target = { left: 900, top: 560, width: 340, height: 200 };
    const at = placeTooltip(target, vw, vh, tw, th);
    expect(at.top + th).toBeLessThanOrEqual(target.top - PAD - GAP);
  });
});

describe('holeOf', () => {
  it('pads the target by PAD on every side', () => {
    expect(holeOf({ left: 100, top: 50, width: 200, height: 40 })).toEqual({
      left: 100 - PAD,
      top: 50 - PAD,
      width: 200 + PAD * 2,
      height: 40 + PAD * 2,
    });
  });
});
