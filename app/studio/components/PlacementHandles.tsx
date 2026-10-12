'use client';

/**
 * The three things that share the frame, as handles you can grab.
 *
 * They are drawn by two renderers that know nothing about each other: the headline and the
 * badge are pixels inside the card, and the caption band is burned over the finished video
 * by deploy/make-reel.py. Nothing stopped them landing on each other, and with a headline
 * that auto-fits its own length — 80px down to 52px, wrapping as it goes — no fixed caption
 * position is safe for every post. So they get moved rather than guessed at.
 *
 * Positions are per cent, never pixels, and per cent OF THE CARD, not of the frame: the card
 * is 1080×1350 at 4:5 and 1080×1080 at 1:1, and cardBox() then puts it somewhere in a
 * 1080×1920 frame. onFrame() is the one place that arithmetic lives.
 *
 * Rendered into someone else's canvas — the run screen's placer and the kit editor's layer
 * stage both host it — so it positions absolutely and measures the canvas it was handed
 * rather than owning one.
 */
import { LOGO, asPct, dragToPct, logoAt, onFrame, titleSide, titleTop, type Rect } from '@/lib/studio/card/placement';
import { CAPTION_DEFAULTS, bandHeight, capY, resolveCaption } from '@/lib/studio/caption';
import { RATIOS } from '@/lib/studio/card/theme';
import { cardBox, H as FH, W as FW, type Layout } from '@/lib/studio/steps/filters';

export type Handle = 'caption' | 'title' | 'logo';

export const HANDLE_LABELS: Record<Handle, string> = {
  caption: 'Phụ đề',
  title: 'Tiêu đề',
  logo: 'Logo',
};

/** The card tab's placement keys. Absent means "wherever the kit has always put it". */
export interface CardPlacement {
  y?: number;
  width?: number;
  logoX?: number;
  logoY?: number;
}

export interface PlacementPatch {
  card?: CardPlacement;
  caption?: { pos: number };
}

/** Whether anything on this surface has been moved off the kit's own answer. */
export function placementTouched(card: CardPlacement, pos: unknown): boolean {
  return card.y !== undefined || card.width !== undefined || card.logoX !== undefined || card.logoY !== undefined || pos !== undefined;
}

/** The headline's auto-fit, copied from the classic route so the handle is one line tall. */
function titleFont(len: number): number {
  return len <= 45 ? 80 : len <= 70 ? 70 : len <= 95 ? 60 : 52;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function PlacementHandles({
  canvas,
  engine,
  ratio,
  layout,
  caption,
  card,
  titleLen,
  picked,
  onPick,
  onChange,
}: {
  /** The element the handles sit on. Drag deltas are divided by its measured size. */
  canvas: { current: HTMLElement | null };
  engine: 'classic' | 'studio';
  ratio: string;
  layout: Layout;
  /** The effective caption style — `pos` is read from here. */
  caption: Record<string, unknown>;
  card: CardPlacement;
  titleLen: number;
  picked?: Handle | null;
  onPick?: (h: Handle) => void;
  onChange: (patch: PlacementPatch) => void;
}) {
  const st = resolveCaption(caption);
  const [cw, ch] = RATIOS[ratio] ?? RATIOS['4:5'];
  const box = cardBox(layout, cw, ch);

  const font = titleFont(titleLen);
  const side = titleSide(cw, card.width);
  // Where the handle sits when nothing has been set: the block is anchored to the card's
  // bottom (`bottom: 72 - lineGap`), so its last line starts here. Grab it and `y` is seeded
  // from this, which is why the first drag of a multi-line headline lifts the whole block.
  const top = titleTop(ch, card.y) ?? ch - 72 - font;

  const onCard = (r: Rect) => onFrame(r, box, cw, ch, FW, FH);
  const badge = logoAt(cw, ch, card.logoX, card.logoY);

  const rects: Partial<Record<Handle, Rect>> = {
    caption: { left: 0, top: capY(st, FH) / FH, width: 1, height: bandHeight(st) / FH },
    title: onCard({ left: side, top, width: cw - 2 * side, height: Math.round(font * 1.42) }),
  };
  // Only the classic card has a badge. A handle for one the studio route never draws would
  // move a number nothing reads.
  if (engine === 'classic') rects.logo = onCard({ left: badge.left, top: badge.top, width: LOGO.w, height: LOGO.h });

  /** Every value this surface owns, seeded from where the handle is currently drawn. */
  const seed = () => ({
    y: card.y ?? asPct(ch, top),
    width: card.width ?? Math.round(((cw - 2 * side) / cw) * 100),
    logoX: card.logoX ?? asPct(cw, LOGO.x),
    logoY: card.logoY ?? asPct(ch, LOGO.y),
    pos: Number(caption.pos ?? CAPTION_DEFAULTS.pos),
  });

  /** One step of a drag or an arrow key, as fractions of the canvas. */
  const step = (h: Handle, mode: 'move' | 'width', cur: ReturnType<typeof seed>, dx: number, dy: number) => {
    if (h === 'caption') {
      cur.pos = clamp(cur.pos + dy, 0, 0.95);
      onChange({ caption: { pos: Math.round(cur.pos * 1000) / 1000 } });
    } else if (h === 'logo') {
      cur.logoX = clamp(cur.logoX + dragToPct(dx, FW, box.w), 0, 100);
      cur.logoY = clamp(cur.logoY + dragToPct(dy, FH, box.h), 0, 100);
      onChange({ card: { logoX: Math.round(cur.logoX), logoY: Math.round(cur.logoY) } });
    } else if (mode === 'width') {
      // The grip is one edge but the block is centred, so it gives up twice what it takes.
      cur.width = clamp(cur.width + 2 * dragToPct(dx, FW, box.w), 40, 100);
      onChange({ card: { width: Math.round(cur.width) } });
    } else {
      cur.y = clamp(cur.y + dragToPct(dy, FH, box.h), 0, 90);
      onChange({ card: { y: Math.round(cur.y) } });
    }
  };

  const drag = (h: Handle, e: React.PointerEvent, mode: 'move' | 'width' = 'move') => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    onPick?.(h);
    (e.target as Element).setPointerCapture(e.pointerId);
    let lastX = e.clientX;
    let lastY = e.clientY;
    const cur = seed();

    const onMove = (ev: PointerEvent) => {
      // Divided by the measured canvas, not a remembered width: these surfaces are
      // responsive and zoomable, and a hard-coded size would put every handle elsewhere.
      const dx = (ev.clientX - lastX) / rect.width;
      const dy = (ev.clientY - lastY) / rect.height;
      lastX = ev.clientX;
      lastY = ev.clientY;
      step(h, mode, cur, dx, dy);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Arrow keys nudge by a per cent, so this is not a pointer-only control. */
  const key = (h: Handle, e: React.KeyboardEvent) => {
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-0.01, 0],
      ArrowRight: [0.01, 0],
      ArrowUp: [0, -0.01],
      ArrowDown: [0, 0.01],
    };
    const move = d[e.key];
    if (!move) return;
    e.preventDefault();
    step(h, 'move', seed(), move[0], move[1]);
  };

  return (
    <>
      {(Object.keys(rects) as Handle[]).map((h) => {
        const r = rects[h]!;
        const loose = h === 'title' && card.y === undefined;
        return (
          <div
            key={h}
            role="button"
            tabIndex={0}
            aria-label={HANDLE_LABELS[h]}
            data-testid={`place-${h}`}
            onPointerDown={(e) => drag(h, e)}
            onKeyDown={(e) => key(h, e)}
            style={{
              position: 'absolute',
              left: `${r.left * 100}%`,
              top: `${r.top * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
              touchAction: 'none',
            }}
            className={`rounded-[3px] border-2 ${loose ? 'border-dashed' : 'border-solid'} border-[hsl(var(--primary))] ${
              picked === h ? 'bg-[hsl(var(--primary))]/30' : 'bg-[hsl(var(--primary))]/15'
            } ${h === 'caption' ? 'cursor-ns-resize' : 'cursor-move'} focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]`}
          >
            <span className="absolute -top-[1px] left-0 rounded-br-[3px] bg-[hsl(var(--primary))] px-1 text-[9px] font-semibold leading-tight text-[hsl(var(--primary-foreground))]">
              {HANDLE_LABELS[h]}
              {loose ? ' · đáy' : ''}
            </span>
            {h === 'title' && (
              <span
                data-testid="place-title-width"
                onPointerDown={(e) => drag('title', e, 'width')}
                style={{ touchAction: 'none' }}
                className="absolute -right-[3px] top-0 h-full w-[7px] cursor-ew-resize rounded-sm bg-[hsl(var(--primary))]"
              />
            )}
          </div>
        );
      })}
    </>
  );
}
