/**
 * Chỉnh lớp — the owner's own layers over the reel frame.
 *
 * Units are 0..1 of the frame, never pixels: a kit is portable data, and a kit that said
 * `x: 540` would mean something different the day a frame stops being 1080 wide. The overlay
 * step multiplies them out at render time and the editor multiplies them out at canvas size,
 * which is what makes the two agree — tests/unit/layer-render.test.ts measures that they do,
 * on a real MP4, to within two per cent.
 *
 * What the engine drew is NOT here, and it does not need to be. The card and the subtitle
 * are burned in by deploy/make-reel.py before this pass ever runs, so every layer the owner
 * adds is above them by construction — but the headline and the badge are card parameters
 * and the band has a position, so PlacementHandles moves all three without this pass being
 * involved at all. The editor lists them as their own rows for that reason.
 *
 * Pure and import-free: the editor is a client component.
 */

export type LayerType = 'text' | 'image' | 'shape' | 'banner';

export interface Layer {
  id: string;
  type: LayerType;
  /** Top-left and size, each 0..1 of the frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Paint order among the owner's layers. Higher is nearer the viewer. */
  z: number;
  locked?: boolean;
  /** Layers sharing a group id move together. */
  group?: string;
  props?: {
    text?: string;
    color?: string;
    bg?: string;
    /** Font size as a fraction of the frame height, so it scales with the frame. */
    size?: number;
    radius?: number;
    opacity?: number;
    /** A media id from Kho tài nguyên, for an image layer. */
    media?: string;
  };
}

/** The reference caps its list at twenty, and so does the editor's counter. */
export const MAX_LAYERS = 20;

export const LAYER_LABELS: Record<LayerType, string> = {
  text: 'Chữ',
  image: 'Ảnh',
  shape: 'Hình',
  banner: 'Banner',
};

/** Which frame a layer set belongs to. `hook` is the opening; `body` is the rest. */
export type FrameKey = 'hook' | 'body';
export const FRAME_LABELS: Record<FrameKey, string> = { hook: 'Mở đầu', body: 'Thân video' };

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Relative → pixels, rounded, for a frame of this size. */
export function toPixels(l: Pick<Layer, 'x' | 'y' | 'w' | 'h'>, W: number, H: number): Box {
  return {
    left: Math.round(l.x * W),
    top: Math.round(l.y * H),
    width: Math.max(1, Math.round(l.w * W)),
    height: Math.max(1, Math.round(l.h * H)),
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * A layer that is inside the frame and has a size worth drawing.
 *
 * Dragged past the edge it stops at the edge rather than being deleted: an overlay filter
 * with a negative x is accepted by ffmpeg and silently draws nothing, which looks exactly
 * like the layer having been lost.
 */
export function clampLayer(l: Layer): Layer {
  const w = Math.min(1, Math.max(0.02, clamp01(l.w)));
  const h = Math.min(1, Math.max(0.01, clamp01(l.h)));
  return {
    ...l,
    w,
    h,
    x: Math.min(1 - w, clamp01(l.x)),
    y: Math.min(1 - h, clamp01(l.y)),
  };
}

/** Paint order, bottom first. A stable sort, so equal z keeps the order the owner sees. */
export function inPaintOrder(layers: Layer[]): Layer[] {
  return layers.map((l, i) => ({ l, i })).sort((a, b) => a.l.z - b.l.z || a.i - b.i).map((x) => x.l);
}

export function nextZ(layers: Layer[]): number {
  return layers.reduce((n, l) => Math.max(n, l.z), 0) + 1;
}

export function canAdd(layers: Layer[]): boolean {
  return layers.length < MAX_LAYERS;
}

/**
 * Move one layer up or down the stack by swapping its z with its neighbour's.
 *
 * Swapping rather than renumbering: a layer grouped with another keeps its distance, and a
 * list that renumbers on every nudge makes an undo stack impossible to read.
 */
export function reorder(layers: Layer[], id: string, dir: -1 | 1): Layer[] {
  const order = inPaintOrder(layers);
  const at = order.findIndex((l) => l.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return layers;
  const a = order[at];
  const b = order[to];
  return layers.map((l) =>
    l.id === a.id ? { ...l, z: b.z } : l.id === b.id ? { ...l, z: a.z } : l,
  );
}

/** Dragging one member of a group drags the group. Locked layers never move. */
export function moveLayer(layers: Layer[], id: string, dx: number, dy: number): Layer[] {
  const target = layers.find((l) => l.id === id);
  if (!target || target.locked) return layers;
  const moving = target.group
    ? new Set(layers.filter((l) => l.group === target.group && !l.locked).map((l) => l.id))
    : new Set([id]);
  return layers.map((l) =>
    moving.has(l.id) ? clampLayer({ ...l, x: l.x + dx, y: l.y + dy }) : l,
  );
}

export function resizeLayer(layers: Layer[], id: string, dw: number, dh: number): Layer[] {
  return layers.map((l) =>
    l.id === id && !l.locked ? clampLayer({ ...l, w: l.w + dw, h: l.h + dh }) : l,
  );
}

/** A new layer of this type, placed in the middle at a sensible size. */
export function newLayer(type: LayerType, layers: Layer[], id: string): Layer {
  const base = { id, type, z: nextZ(layers) };
  if (type === 'banner') return { ...base, x: 0.08, y: 0.08, w: 0.84, h: 0.09, props: { text: 'BANNER', color: '#FFFFFF', bg: '#1D51A4', size: 0.035, radius: 12 } };
  if (type === 'text') return { ...base, x: 0.1, y: 0.42, w: 0.8, h: 0.08, props: { text: 'Chữ mới', color: '#FFFFFF', size: 0.04 } };
  if (type === 'shape') return { ...base, x: 0.3, y: 0.4, w: 0.4, h: 0.16, props: { bg: '#F8EF63', radius: 16, opacity: 0.9 } };
  return { ...base, x: 0.3, y: 0.35, w: 0.4, h: 0.25, props: {} };
}

/** How the reference's "Sao chép từ Hook" works: the other frame's layers, with new ids. */
export function copyFrom(source: Layer[], idFor: (i: number) => string): Layer[] {
  return source.filter((l) => !l.locked).map((l, i) => ({ ...l, id: idFor(i) }));
}
