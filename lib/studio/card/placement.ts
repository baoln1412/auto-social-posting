/**
 * Where the classic card puts its headline and its badge.
 *
 * One module because three things read these numbers: the route that draws the card, the
 * drag surface that moves them, and the tests. The same bargain cardBox() struck for the
 * frame — a second copy of 844,38 is a second answer waiting to disagree with the first.
 *
 * Overrides are per cent, never pixels. The card is 1080×1350 at 4:5 and 1080×1080 at 1:1,
 * so a kit that stored `y: 38` would mean two different places depending on the ratio it
 * happened to be rendered at. Per cent of the canvas means one stored number, both ratios.
 *
 * Absent means the layout that shipped. Production passes none of these, and that has to go
 * on rendering byte for byte what it rendered before this file existed.
 *
 * Pure and import-free: the drag surface is a client component.
 */

/**
 * The brand badge, measured off public/overlays/card-bg-4x5.png rather than guessed: the
 * opaque block runs (848, 29) to (1051, 206), and the blue gradient does not start until
 * y=720. Disjoint, which is why the art splits into card-logo.png + card-grad-*.png with
 * nothing lost — tests/unit/card-placement.test.ts recomposes them and compares bytes.
 *
 * Was (844, 38) 178x178 for the 101 Chuyện Úc badge. The DE·SOUL mascot that replaced it on
 * 2026-09-29 is wider than it is tall, because the Australian flag juts out to its left, so
 * the box is measured off the new art rather than the old one reused.
 */
export const LOGO = { x: 848, y: 29, w: 203, h: 177 };

/** The headline's historical inset, `left: 56, right: 56`. */
export const TITLE_INSET = 56;

/** The schema's own floor for `card.width`; narrower and the headline stacks single words. */
const MIN_TITLE_WIDTH = 40;
/** Past this the block's own height carries it off the bottom of the card. */
const MAX_TITLE_TOP = 90;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (span: number, v: number) => Math.round((span * v) / 100);

/** Top-left of the badge in card pixels, kept fully on the canvas. */
export function logoAt(W: number, H: number, lx?: number, ly?: number): { left: number; top: number } {
  return {
    left: lx === undefined ? LOGO.x : clamp(pct(W, lx), 0, W - LOGO.w),
    top: ly === undefined ? LOGO.y : clamp(pct(H, ly), 0, H - LOGO.h),
  };
}

/** The inset the headline keeps on each side, from a width given as a per cent of the card. */
export function titleSide(W: number, tw?: number): number {
  if (tw === undefined) return TITLE_INSET;
  return Math.round((W - pct(W, clamp(tw, MIN_TITLE_WIDTH, 100))) / 2);
}

/**
 * The headline block's top edge in card pixels, or null to leave it anchored to the bottom
 * the way it has always been. Null rather than a number because those are two different
 * layouts: bottom-anchored, a longer headline grows upward, which is the whole reason the
 * caption band started landing on it.
 */
export function titleTop(H: number, ty?: number): number | null {
  if (ty === undefined) return null;
  return pct(H, clamp(ty, 0, MAX_TITLE_TOP));
}

/** A pixel position on the card, back to the per cent a kit stores. */
export function asPct(span: number, px: number): number {
  return Math.round((px / span) * 1000) / 10;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A rect in card pixels, as a fraction of the frame the card is placed in.
 *
 * The drag surface draws in per cent of the frame and the card is only part of that frame —
 * cardBox() says which part. Getting this wrong is invisible until a handle is a few per
 * cent off the thing it claims to grab, which is why it is here and tested rather than
 * inline in the component.
 */
export function onFrame(
  r: Rect,
  box: { x: number; y: number; w: number; h: number },
  cardW: number,
  cardH: number,
  frameW: number,
  frameH: number,
): Rect {
  const sx = box.w / cardW;
  const sy = box.h / cardH;
  return {
    left: (box.x + r.left * sx) / frameW,
    top: (box.y + r.top * sy) / frameH,
    width: (r.width * sx) / frameW,
    height: (r.height * sy) / frameH,
  };
}

/**
 * A pointer delta given as a fraction of the frame, as a per cent of the card.
 *
 * The card's own width cancels out: the handle moved `d` of the frame, the card covers
 * `boxSpan` of that frame, so it moved `d * frame / box` of the card.
 */
export function dragToPct(d: number, frameSpan: number, boxSpan: number): number {
  return (d * frameSpan * 100) / boxSpan;
}
