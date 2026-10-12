/**
 * Every overlay this project draws, as ffmpeg filter strings — and nothing else.
 *
 * Pure on purpose, and the reason is in this file's own history: `overlayFilter` was written
 * pure so a filter could be asserted without spending a three-minute render to find out
 * ffmpeg rejected it. Everything here follows that, which is why a test can prove the
 * bouncing signature never leaves the frame without rendering a single pixel.
 *
 * All of it composites over deploy/make-reel.py's finished MP4. That file is the measured $0
 * path and is never edited — tests/unit/overlay.test.ts pins its hash.
 */

export const W = 1080;
export const H = 1920;

/** Bottom-right, clear of the caption band. One definition; the still preview uses it too. */
export const STICKER_INSET = { right: 40, bottom: 320 };

/** Seconds the intro sticker stays up. make-reel's own intro is about this long. */
export const INTRO_SEC = 3;
/** How long a fly-in takes. Longer and it is still moving when the first cue lands. */
export const FLY_SEC = 1.5;
/** The end card rides the last of the video rather than adding to it. */
export const OUTRO_SEC = 3;

export type Where = 'cover' | 'intro' | 'reactions';
export type FlyStyle = 'cheo' | 'nay';
export type Layout = 'card-top' | 'continuous' | 'multi';

/** ffmpeg's expression parser has no string escaping worth trusting; keep text plain. */
export function safeText(s: string): string {
  return (s || '')
    .replace(/[\\:'%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

/**
 * The sticker, where the kit asked for it.
 *
 * `cheo` flies in from off the right edge; `nay` drops from above and settles with one
 * bounce. Both end at exactly the resting point, so a reel whose sticker is set to `cover`
 * and one set to `intro` agree on where it lives once it has arrived.
 */
export function stickerAt(where: Where[], fly: FlyStyle | undefined, sw: number, sh: number): string | null {
  const x = W - sw - STICKER_INSET.right;
  const y = H - sh - STICKER_INSET.bottom;
  if (where.includes('cover')) return `overlay=${x}:${y}`;
  if (!where.includes('intro')) return null;

  const t = `min(t/${FLY_SEC},1)`;
  if (fly === 'nay') {
    // A settle, not a bounce past the target: abs(cos) decaying to 0 lands exactly on y.
    const drop = `${y}-${Math.round(sh * 0.55)}*abs(cos(3.6*${t}))*(1-${t})`;
    return `overlay=${x}:'${drop}':enable='between(t,0,${INTRO_SEC})'`;
  }
  // Off the right edge at t=0, at rest by FLY_SEC.
  return `overlay='${W}-(${W}-${x})*${t}':${y}:enable='between(t,0,${INTRO_SEC})'`;
}

/**
 * The card, placed by the layout instead of shown as one of make-reel's plates.
 *
 * `card-top` pins it under the top edge for the whole reel — the reference's "Một khung
 * hình": the original post stays put and the comments change under it. `continuous` slides
 * it up from below over the first seconds and leaves it — "Một khung nối tiếp".
 *
 * `multi` is what the reel already does (one plate per scene), so it has no overlay at all.
 */
export function layoutAt(layout: Layout, cw: number, ch: number): string | null {
  if (layout === 'multi') return null;
  const { x, y } = cardBox(layout, cw, ch);
  if (layout === 'card-top') return `overlay=${x}:${y}`;
  return `overlay=${x}:'if(lt(t,${FLY_SEC}),${H}-(${H}-${y})*(t/${FLY_SEC}),${y})'`;
}

/**
 * Where the card ends up in the frame, in pixels — the one set of numbers layoutAt (ffmpeg),
 * the composed preview (sharp) and the fidelity gate all read. For `multi` the card is the
 * scene plate and make-reel cover-scales it: the box is that scale, so a card that is not
 * 9:16 comes back with a negative x — the crop, in numbers, before anyone renders it.
 */
export function cardBox(layout: Layout, cw: number, ch: number): { x: number; y: number; w: number; h: number } {
  if (layout === 'multi') {
    const s = Math.max(W / cw, H / ch);
    const w = Math.round(cw * s);
    const h = Math.round(ch * s);
    return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
  }
  return {
    x: Math.round((W - cw) / 2),
    y: Math.round(H * (layout === 'card-top' ? 0.06 : 0.18)),
    w: cw,
    h: ch,
  };
}

/**
 * The story frame: one photo, three treatments.
 *
 * Measured off ainius-2.mp4 (2026-10-12), which uses exactly ONE article image and never
 * cuts to another — sharp behind the headline, then an inset card, then blurred and
 * darkened into a bed the typography sits on. Its scene detector score is zero hard cuts in
 * 31s: the background is continuous, and that is what stops a reel reading as a slideshow.
 * Ours pinned a sharp card over a sharp photo for the whole reel, from the same one input.
 *
 * The windows do not overlap, so only one treatment is ever on screen.
 */
export const HERO_SEC = 3.5;
export const INSET_SEC = 11;

/** The inset keeps the card's own shape — a squashed card reads as a bug, not a choice. */
export const INSET_WIDTH = 0.62;
export const INSET_TOP = 0.055;
/** One corner, two tenants: the source credit over the hero, the eyebrow after it. */
export const SLOT = { left: 28, top: 28 };

export function insetSize(cw: number, ch: number): { w: number; h: number } {
  const w = Math.round(W * INSET_WIDTH);
  return { w, h: Math.max(1, Math.round((ch / cw) * w)) };
}

/** The opening: the card as drawn, where the layout puts it, for the first seconds only. */
export function heroAt(cw: number, ch: number): string {
  const { x, y } = cardBox('card-top', cw, ch);
  return `overlay=${x}:${y}:enable='lt(t,${HERO_SEC.toFixed(2)})'`;
}

/** Then the same card, smaller and nearer the top, until the type takes the screen. */
export function insetAt(cw: number, ch: number): string {
  const x = Math.round((W - cw) / 2);
  const y = Math.round(H * INSET_TOP);
  return `overlay=${x}:${y}:enable='between(t,${HERO_SEC.toFixed(2)},${INSET_SEC.toFixed(2)})'`;
}

/** Where the article came from, over the hero — the reference burns this in, we only ever
 *  put it in a comment under the post, where a viewer never sees it. */
export function creditAt(): string {
  return `overlay=${SLOT.left}:${SLOT.top}:enable='lt(t,${HERO_SEC.toFixed(2)})'`;
}

/** What the story is, held for the rest of the reel once the hero has gone. */
export function eyebrowAt(): string {
  return `overlay=${SLOT.left}:${SLOT.top}:enable='gte(t,${HERO_SEC.toFixed(2)})'`;
}

/**
 * Where the big number sits: left, above the middle, clear of the caption band.
 *
 * Left and not centred because it is an object on the page, not a title — the reference
 * sets it as a block you read before the sentence catches up, and a centred figure reads
 * as a score.
 */
export const NUMBER_LEFT = 56;
export const NUMBER_TOP = 0.40;

export function numberAt(from: number, until: number): string {
  const y = Math.round(H * NUMBER_TOP);
  return `overlay=${NUMBER_LEFT}:${y}:enable='between(t,${from.toFixed(2)},${until.toFixed(2)})'`;
}

/**
 * The middle band: one object at a time, vertically centred on its own height.
 *
 * Centred rather than top-anchored because the two tenants that use it are different
 * heights — a two-line quote and a three-box chain — and a shared top edge would leave one
 * of them hanging. The band sits between the inset's bottom edge and the caption band's
 * top, and nothing is ever scheduled here before INSET_SEC, so the inset's own window
 * cannot collide with it.
 */
export const MIDDLE_LEFT = 56;
export const MIDDLE_WIDTH = W - MIDDLE_LEFT * 2;
export const MIDDLE_CENTER = 0.42;

/** How long the card takes to settle, and how far it travels getting there. */
export const MIDDLE_RISE = 0.35;
export const MIDDLE_LIFT = 44;

export function middleAt(h: number, from: number, until: number): string {
  const y = Math.max(0, Math.round(H * MIDDLE_CENTER - h / 2));
  // It rises into place rather than appearing. `alpha` cannot take an expression (see
  // outroAt) but x and y can, which is the same door `stickerAt` already goes through —
  // so the entrance is eased in position instead of faded in opacity.
  //
  // Eased and not linear because constant-speed motion is the tell that a frame was
  // composited rather than animated, and decelerating into rest is what makes a card feel
  // placed. Short, too: at 0.35s it has settled long before the line that says it ends.
  const p = `min(max((t-${from.toFixed(2)})/${MIDDLE_RISE},0),1)`;
  const ease = `(1-(1-${p})*(1-${p}))`;
  return `overlay=${MIDDLE_LEFT}:'${y}+${MIDDLE_LIFT}*(1-${ease})':enable='between(t,${from.toFixed(2)},${until.toFixed(2)})'`;
}

/** Margins the drifting handle keeps: clear of the caption band at the bottom. */
const DVD_PAD = { x: 60, top: 160, bottom: 320 };

/**
 * The drifting handle — a DVD logo, which is what the reference calls it.
 *
 * An overlay of a rendered PNG, not `drawtext`: this machine's ffmpeg is built without
 * libfreetype, so `drawtext` answers "No such filter" and the whole pass is lost. Drawing
 * the text ourselves is better anyway — it uses the same BeVietnamPro the rest of the brand
 * does instead of whatever font ffmpeg would have found.
 *
 * A triangle wave, not a sine: a sine slows to a stop at each edge and reads as hesitant,
 * while `abs(mod(t,2p)-p)` keeps a constant speed and turns cleanly. The travel is the frame
 * minus the text box, so it touches the edges and never leaves.
 */
export function dvdAt(tw: number, th: number, pxPerSec = 45): string {
  const travelX = Math.max(1, W - tw - DVD_PAD.x * 2);
  const travelY = Math.max(1, H - th - DVD_PAD.top - DVD_PAD.bottom);
  const px = Math.max(1, Math.round(travelX / pxPerSec));
  const py = Math.max(1, Math.round(travelY / pxPerSec));
  return (
    `overlay='${DVD_PAD.x}+abs(mod(t/${px},2)-1)*${travelX}'` +
    `:'${DVD_PAD.top}+abs(mod(t/${py},2)-1)*${travelY}'`
  );
}

/** The handle as a picture, so no font has to be compiled into ffmpeg. */
export function dvdSvg(handle: string, size = 34): string {
  const text = safeText(handle) || '@desoul';
  const w = Math.round(text.length * size * 0.62) + 24;
  const h = Math.round(size * 1.7);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<text x="12" y="${Math.round(size * 1.2)}" font-family="sans-serif" font-size="${size}" ` +
    `font-weight="700" fill="#ffffff" fill-opacity="0.72" ` +
    `stroke="#000000" stroke-opacity="0.45" stroke-width="2" paint-order="stroke">` +
    `${escapeXml(text)}</text></svg>`
  );
}

/**
 * The tiled watermark, as an SVG the caller rasterises.
 *
 * Drawn once as a full-frame PNG rather than as N drawtext filters: a 6×10 grid would be
 * sixty filters in the chain, and ffmpeg parses that per frame.
 */
export function watermarkSvg(handle: string, opacity = 0.06): string {
  const text = safeText(handle) || '@desoul';
  const cols = 4;
  const rows = 9;
  const dx = W / cols;
  const dy = H / rows;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Every other row offset by half a cell, so the grid reads as a weave, not a table.
      const x = Math.round(c * dx + (r % 2 ? dx / 2 : 0) + dx * 0.1);
      const y = Math.round(r * dy + dy * 0.6);
      cells.push(
        `<text x="${x}" y="${y}" transform="rotate(-24 ${x} ${y})" ` +
          `font-family="sans-serif" font-size="34" font-weight="700" ` +
          `fill="#ffffff" fill-opacity="${opacity}">${escapeXml(text)}</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${cells.join('')}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The end card, over the last seconds. It rides the reel; it does not lengthen it.
 *
 * A cut, not a fade: `overlay`'s `alpha` option takes `straight|premultiplied`, not an
 * expression — ffmpeg rejects `alpha='min(…)'` outright — and fading a still input needs a
 * second `fade` filter whose timeline is the image's, not the video's. A hard cut is what a
 * Reels end card does anyway.
 */
export function outroAt(durationSec: number, cw: number, ch: number): string | null {
  if (!Number.isFinite(durationSec) || durationSec <= OUTRO_SEC) return null;
  const from = Math.max(0, durationSec - OUTRO_SEC);
  const x = Math.round((W - cw) / 2);
  const y = Math.round((H - ch) / 2);
  return `overlay=${x}:${y}:enable='gte(t,${from.toFixed(2)})'`;
}

/** One owner layer, as an SVG the caller rasterises at its own pixel size. */
export function layerSvg(
  type: 'text' | 'shape' | 'banner',
  w: number,
  h: number,
  props: {
    text?: string;
    color?: string;
    bg?: string;
    size?: number;
    radius?: number;
    opacity?: number;
  },
  frameH = H,
): string {
  const radius = Math.max(0, Math.round(props.radius ?? 0));
  const opacity = Math.min(1, Math.max(0, props.opacity ?? 1));
  // Font size is a fraction of the FRAME, not of the box: a layer resized to fit its words
  // would change the type size every time it was nudged.
  const fs = Math.max(8, Math.round((props.size ?? 0.035) * frameH));
  const parts: string[] = [];

  if (type !== 'text' && props.bg) {
    parts.push(
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" ` +
        `fill="${escapeXml(props.bg)}" fill-opacity="${opacity}"/>`,
    );
  }
  if (type !== 'shape' && props.text) {
    parts.push(
      `<text x="${Math.round(w / 2)}" y="${Math.round(h / 2 + fs * 0.35)}" text-anchor="middle" ` +
        `font-family="sans-serif" font-size="${fs}" font-weight="700" ` +
        `fill="${escapeXml(props.color ?? '#FFFFFF')}">${escapeXml(props.text)}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`;
}

/** A layer sits where the editor put it: absolute pixels, no expression, no drift. */
export function layerAt(left: number, top: number): string {
  return `overlay=${Math.round(left)}:${Math.round(top)}`;
}

/**
 * Where the scenes change, as a fraction of the reel.
 *
 * Modelled, not measured, and the ceiling is stated: make-reel.py reports no scene timings,
 * so boundaries come from each scene's share of the narration scaled onto the real duration.
 * At ~20 chars/s a boundary lands within a second of the truth, which a transition whoosh
 * can carry. ponytail: replace with real timings the day make-reel emits them.
 */
export function sceneBoundaries(sceneChars: number[], durationSec: number): number[] {
  const total = sceneChars.reduce((n, c) => n + c, 0);
  if (!total || !Number.isFinite(durationSec) || durationSec <= 0) return [];
  const out: number[] = [];
  let acc = 0;
  for (const c of sceneChars.slice(0, -1)) {
    acc += c;
    const at = (acc / total) * durationSec;
    // A whoosh in the first or last half-second lands on the intro or the outro instead.
    if (at > 0.5 && at < durationSec - 0.5) out.push(Number(at.toFixed(2)));
  }
  return out;
}

/** One transition sound per boundary, as legs waiting to be mixed. */
export function sfxLegs(boundaries: number[], inputIndex: number): { legs: string; labels: string[] } | null {
  if (boundaries.length === 0) return null;
  return {
    legs: boundaries
      .map((t, i) => `[${inputIndex}:a]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)},volume=0.5[s${i}]`)
      .join(';'),
    labels: boundaries.map((_, i) => `[s${i}]`),
  };
}

/** One transition sound per boundary, mixed under the narration without touching its level. */
export function sfxMix(boundaries: number[], inputIndex: number): string | null {
  const p = sfxLegs(boundaries, inputIndex);
  if (!p) return null;
  // `longest` and not `first`: a whoosh near the end must not be clipped, and the narration
  // is always the longest leg anyway.
  return `${p.legs};[0:a]${p.labels.join('')}amix=inputs=${boundaries.length + 1}:duration=longest:normalize=0[aout]`;
}

/**
 * How loud the bed sits under the voice — the reference's Tắt / Nhỏ / Mặc định / To.
 *
 * Linear gain, not dB, because that is what ffmpeg's `volume` takes. Even the loud step is
 * far below the narration: a bed that competes with the voice is the single most common way
 * a reel becomes unwatchable, and the owner cannot hear it mixed while reading a transcript.
 */
export type MusicLevel = 'none' | 'soft' | 'default' | 'loud';
export const MUSIC_GAIN: Record<MusicLevel, number> = {
  none: 0,
  soft: 0.05,
  default: 0.12,
  loud: 0.22,
};
export const MUSIC_LABELS: Record<MusicLevel, string> = {
  none: 'Tắt',
  soft: 'Nhỏ',
  default: 'Mặc định',
  loud: 'To',
};

/**
 * The bed, looped to the reel's length and eased at both ends.
 *
 * Looped because a 40s track under a 90s reel is 50s of silence, and the library is sourced
 * from CC0 beds that are rarely the length of a post. Faded because a bed that starts at
 * full level on frame one reads as a mistake — and the fade shortens on a short reel rather
 * than swallowing it whole.
 */
export function musicLeg(
  inputIndex: number,
  durationSec: number,
  level: MusicLevel,
): { leg: string; label: string } | null {
  const gain = MUSIC_GAIN[level] ?? 0;
  if (!gain) return null;
  const d = Math.max(1, durationSec);
  const fade = Math.min(2, d / 4);
  return {
    label: '[bed]',
    leg:
      `[${inputIndex}:a]aloop=loop=-1:size=2147483647,atrim=0:${d.toFixed(2)},asetpts=N/SR/TB,` +
      `afade=t=in:st=0:d=${fade.toFixed(2)},` +
      `afade=t=out:st=${(d - fade).toFixed(2)}:d=${fade.toFixed(2)},` +
      `volume=${gain.toFixed(3)}[bed]`,
  };
}
