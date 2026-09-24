/**
 * Where the tour's card stands, and where the scrim's hole is cut.
 *
 * Kept away from React because it is the only part with a rule in it: the mock's first attempt
 * put the card to the right of a box that already reached the right edge, and half of it was
 * off-screen. The rule is right → below → above → left, and whatever survives is clamped into
 * the viewport, so a card is never off-screen even when no side has room.
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Breathing room between the target and the hole's edge. */
export const PAD = 8;
/** Between the hole and the card. */
export const GAP = 16;
/** And between the card and the screen's edge. */
export const EDGE = 12;

export const holeOf = (t: Box): Box => ({
  left: t.left - PAD,
  top: t.top - PAD,
  width: t.width + PAD * 2,
  height: t.height + PAD * 2,
});

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? lo : Math.min(Math.max(v, lo), hi));

export function placeTooltip(
  target: Box,
  vw: number,
  vh: number,
  tw: number,
  th: number,
): { left: number; top: number } {
  const h = holeOf(target);
  const right = h.left + h.width;
  const bottom = h.top + h.height;
  const maxL = vw - tw - EDGE;
  const maxT = vh - th - EDGE;

  // Vertically beside the target, horizontally under it: the mock right-aligns the card to the
  // hole so a card under a centred box stays over the box, not out in the margin.
  const besideTop = clamp(h.top, EDGE, maxT);
  const underLeft = clamp(right - tw, EDGE, maxL);

  if (right + GAP <= maxL) return { left: right + GAP, top: besideTop };
  if (bottom + GAP <= maxT) return { left: underLeft, top: bottom + GAP };
  if (h.top - GAP - th >= EDGE) return { left: underLeft, top: h.top - GAP - th };
  if (h.left - GAP - tw >= EDGE) return { left: h.left - GAP - tw, top: besideTop };

  // Nothing fits — a target taller than the screen, or a tiny window. Sit in the corner with
  // the most room rather than over the middle of what we are pointing at.
  return {
    left: clamp(h.left > vw - right ? EDGE : maxL, EDGE, maxL),
    top: clamp(h.top > vh - bottom ? EDGE : maxT, EDGE, maxT),
  };
}

/** One rounded rect as a path, for the scrim's `evenodd` hole and for the ring drawn over it. */
export function roundRect(b: Box, r: number): string {
  const rr = Math.min(r, b.width / 2, b.height / 2);
  const { left: x, top: y, width: w, height: hgt } = b;
  return (
    `M${x + rr},${y}h${w - 2 * rr}a${rr},${rr},0,0,1,${rr},${rr}` +
    `v${hgt - 2 * rr}a${rr},${rr},0,0,1,${-rr},${rr}` +
    `h${-(w - 2 * rr)}a${rr},${rr},0,0,1,${-rr},${-rr}` +
    `v${-(hgt - 2 * rr)}a${rr},${rr},0,0,1,${rr},${-rr}z`
  );
}
