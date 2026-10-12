/**
 * The URL of one composed reel frame — pure, import-free, and therefore safe in the browser.
 *
 * Split from frame.ts for the reason §2 of the plan names and this repo has already paid
 * for twice: a 'use client' module that imports a server file drags sharp and node:fs into
 * the bundle and the build dies on "Can't resolve 'fs'". The kit editor and the run page
 * build the same URL from here; only the server renders it.
 */
export interface FrameSpec {
  /** The caption line for this scene. */
  text: string;
  /** Resolved-or-not caption style; make-reel.py resolves it either way. */
  style: Record<string, unknown>;
  /** Absolute path or URL of the image this scene shows. */
  plate?: string | null;
  /** Absolute path of a sticker PNG to composite. */
  sticker?: string | null;
  /**
   * How the card sits in the frame — `card-top` / `continuous` place it as an overlay over
   * `background`; `multi` makes it the plate. Omitted = the plate is used as given.
   */
  layout?: 'card-top' | 'continuous' | 'multi';
  /** Absolute path of the kit's background image, for the overlay layouts. */
  background?: string | null;
  /**
   * Which moment of the story frame to draw. The three treatments of the one photo never
   * share the screen, so a still has to say which one it is showing — without this the
   * Video screen drew a card that the finished reel only holds for three seconds.
   */
  at?: 'hero' | 'inset' | 'bed';
  /** The headline the eyebrow is cut from, and the article url the credit names. */
  title?: string;
  source?: string | null;
  /**
   * Whichever object fills the middle band at the moment this still shows. A reel can hold
   * a figure, an attributed quote and a causal chain at three different seconds; a still
   * holds one, and the `mid` override is what cycles between them.
   */
  num?: string | null;
  numUnit?: string | null;
  quote?: string | null;
  quoteWho?: string | null;
  flow?: string[] | null;
}

/**
 * Which plates the frame route will open.
 *
 * The plate is a path off a query string, so without this the route would render any file
 * on the machine back as a PNG. Confined to what Studio itself writes and serves: the repo's
 * own public/ and data/ trees, or a remote image make-reel.py would fetch anyway.
 */
export function plateAllowed(plate: string, root: string): boolean {
  if (/^https?:\/\//i.test(plate)) return true;
  // The kit editor sends the card it is drawing — a relative card URL, rendered in-process.
  if (plate.startsWith('/api/studio/card?') || plate.startsWith('/api/image/card?')) return true;
  if (!plate.startsWith('/')) return false;
  const norm = plate.replace(/\/+/g, '/');
  if (norm.includes('/../') || norm.endsWith('/..')) return false;
  return ['public/', 'data/', 'deploy/assets/'].some((d) =>
    norm.startsWith(`${root.replace(/\/$/, '')}/${d}`),
  );
}

/** The query the frame route takes. Pure — the kit editor calls this in the browser. */
export function frameQuery(spec: FrameSpec): string {
  const q = new URLSearchParams({ text: spec.text ?? '', style: JSON.stringify(spec.style ?? {}) });
  if (spec.plate) q.set('plate', spec.plate);
  if (spec.sticker) q.set('sticker', spec.sticker);
  if (spec.layout) q.set('layout', spec.layout);
  if (spec.background) q.set('background', spec.background);
  if (spec.at) q.set('at', spec.at);
  if (spec.title) q.set('title', spec.title);
  if (spec.source) q.set('source', spec.source);
  if (spec.num) q.set('num', spec.num);
  if (spec.numUnit) q.set('numUnit', spec.numUnit);
  if (spec.quote) q.set('quote', spec.quote);
  if (spec.quoteWho) q.set('quoteWho', spec.quoteWho);
  // One per line: a box's own text may hold anything but a newline, which boxLabel rejects.
  if (spec.flow?.length) q.set('flow', spec.flow.join('\n'));
  return q.toString();
}

/**
 * The URL an <img> points at. Every input is in the query, so changing any control changes
 * the src — which is the whole C fix: the frame redraws because the browser is asked for a
 * different picture, not because something remembered to re-render.
 */
export function frameUrl(spec: FrameSpec): string {
  return `/api/studio/frame?${frameQuery(spec)}`;
}
