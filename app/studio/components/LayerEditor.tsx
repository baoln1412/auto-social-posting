'use client';

/**
 * Chỉnh lớp — a canvas over the reel frame, and the stack beside it.
 *
 * The boxes are positioned in per cent, so what is on screen is the same 0..1 the kit stores
 * and the overlay pass multiplies out at 1080×1920. Dragging divides the pointer delta by
 * the canvas's measured size rather than by a remembered constant — the canvas is responsive
 * and a hard-coded width would put every layer somewhere else on a narrow screen.
 *
 * The two rows at the bottom of the stack are locked and say so: make-reel.py burns the card
 * and the subtitle in before this pass runs, so every layer the owner adds is above them by
 * construction. Drawing them as movable would be a control that cannot work.
 */
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Flag, Image as ImageIcon, Minus, Move, Plus, RotateCcw, Square, Type, Undo2, X } from 'lucide-react';
import {
  FRAME_LABELS,
  LAYER_LABELS,
  MAX_LAYERS,
  canAdd,
  copyFrom,
  inPaintOrder,
  moveLayer,
  newLayer,
  reorder,
  resizeLayer,
  type FrameKey,
  type Layer,
  type LayerType,
} from '@/lib/studio/layers';
import {
  HANDLE_LABELS,
  PlacementHandles,
  placementTouched,
  type CardPlacement,
  type Handle,
  type PlacementPatch,
} from './PlacementHandles';
import type { Layout } from '@/lib/studio/steps/filters';

/**
 * What the engine draws and this screen can now move. It used to be two locked rows
 * explaining that make-reel.py burns the card and the subtitle in before this pass runs —
 * true, and beside the point: the headline and the badge are card parameters and the band
 * has a position, so all three move without the overlay pass being involved at all.
 */
export interface PlacementProps {
  engine: 'classic' | 'studio';
  ratio: string;
  layout: Layout;
  /** The effective caption style; `pos` is read from it. */
  caption: Record<string, unknown>;
  card: CardPlacement;
  titleLen: number;
  onChange: (patch: PlacementPatch) => void;
  onReset: () => void;
}

const CAPS = 'st-label text-muted-foreground';
const BTN = 'st-btn st-sm';
const TOOL_ICONS = { text: Type, image: ImageIcon, shape: Square, banner: Flag } as const;
/** Canvas widths the zoom pills step through, in rem. */
const ZOOMS = [12, 16, 20];
/** Engine rows, in the order the renderers paint them. */
const PLACED_ROWS: Handle[] = ['logo', 'title', 'caption'];

export type LayerMap = Partial<Record<FrameKey, Layer[]>>;

export function LayerEditor({
  frameSrc,
  value,
  onChange,
  media,
  placement,
}: {
  /** The composed reel frame the layers sit on. */
  frameSrc: string;
  value: LayerMap;
  onChange: (next: LayerMap) => void;
  media: { id: string; name: string }[];
  placement: PlacementProps;
}) {
  const [frame, setFrame] = useState<FrameKey>('body');
  const [picked, setPicked] = useState<string | null>(null);
  const [handle, setHandle] = useState<Handle | null>(null);
  const [history, setHistory] = useState<LayerMap[]>([]);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);

  const layers = value[frame] ?? [];

  /** Every change goes through here, so undo has one place to remember. */
  const put = (next: Layer[]) => {
    setHistory((h) => [...h.slice(-24), value]);
    onChange({ ...value, [frame]: next });
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      onChange(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  const add = (type: LayerType) => {
    if (!canAdd(layers)) return;
    const id = `l${Date.now().toString(36)}`;
    put([...layers, newLayer(type, layers, id)]);
    setPicked(id);
  };

  /** Pointer drag → a delta in frame units. */
  const drag = (id: string, e: React.PointerEvent, mode: 'move' | 'resize') => {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    let lastX = e.clientX;
    let lastY = e.clientY;
    let work = layers;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - lastX) / box.width;
      const dy = (ev.clientY - lastY) / box.height;
      lastX = ev.clientX;
      lastY = ev.clientY;
      work = mode === 'move' ? moveLayer(work, id, dx, dy) : resizeLayer(work, id, dx, dy);
      onChange({ ...value, [frame]: work });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // One history entry per gesture, not one per pixel.
      setHistory((h) => [...h.slice(-24), value]);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const other: FrameKey = frame === 'body' ? 'hook' : 'body';

  return (
    <div data-testid="layer-editor" className="flex flex-col gap-3 lg:flex-row">
      {/* One outlined strip, not a stack of shadowed buttons: the reference's toolbar. */}
      <div className="st-card flex shrink-0 flex-row gap-0.5 self-start p-1 lg:flex-col">
        {(Object.keys(LAYER_LABELS) as LayerType[]).map((t) => {
          const Icon = TOOL_ICONS[t];
          return (
            <button
              key={t}
              type="button"
              data-testid={`layer-add-${t}`}
              disabled={!canAdd(layers)}
              onClick={() => add(t)}
              className="flex w-14 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-semibold hover:bg-muted disabled:opacity-40"
            >
              <Icon size={16} strokeWidth={2.25} />
              {LAYER_LABELS[t]}
            </button>
          );
        })}
        <span className="my-0.5 border-t-2 border-border" />
        <button
          type="button"
          data-testid="layer-undo"
          disabled={history.length === 0}
          onClick={undo}
          className="flex w-14 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <Undo2 size={16} strokeWidth={2.25} />
          Lấy lại
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <div className="flex gap-1.5">
          {(Object.keys(FRAME_LABELS) as FrameKey[]).map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`layer-frame-${f}`}
              aria-pressed={frame === f}
              onClick={() => setFrame(f)}
              className={`st-chip ${frame === f ? 'st-on' : ''}`}
            >
              {FRAME_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="relative">
        <div
          ref={canvas}
          data-testid="layer-canvas"
          className="st-stage relative aspect-[9/16]"
          style={{ width: `${ZOOMS[zoom]}rem`, maxWidth: '100%' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frameSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* Below the owner's layers on purpose: this screen is for arranging those, and a
              full-width caption handle over them swallows the pointer before a layer sees it. */}
          <PlacementHandles
            canvas={canvas}
            engine={placement.engine}
            ratio={placement.ratio}
            layout={placement.layout}
            caption={placement.caption}
            card={placement.card}
            titleLen={placement.titleLen}
            picked={handle}
            onPick={setHandle}
            onChange={placement.onChange}
          />
          {inPaintOrder(layers).map((l) => (
            <div
              key={l.id}
              data-testid={`layer-box-${l.id}`}
              data-x={l.x.toFixed(4)}
              data-y={l.y.toFixed(4)}
              onPointerDown={(e) => {
                setPicked(l.id);
                if (!l.locked) drag(l.id, e, 'move');
              }}
              style={{
                position: 'absolute',
                left: `${l.x * 100}%`,
                top: `${l.y * 100}%`,
                width: `${l.w * 100}%`,
                height: `${l.h * 100}%`,
                background: l.type === 'shape' || l.type === 'banner' ? (l.props?.bg ?? '#FFFFFF') : 'transparent',
                opacity: l.props?.opacity ?? 1,
                borderRadius: l.props?.radius ?? 0,
                outline: picked === l.id ? '2px solid hsl(var(--primary))' : '1px dashed rgba(255,255,255,.35)',
                color: l.props?.color ?? '#FFFFFF',
                fontSize: `${(l.props?.size ?? 0.035) * 100}cqh`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: l.locked ? 'not-allowed' : 'move',
                touchAction: 'none',
              }}
            >
              {l.type !== 'image' && l.type !== 'shape' ? l.props?.text : null}
              {picked === l.id && !l.locked && (
                <span
                  data-testid={`layer-resize-${l.id}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    drag(l.id, e, 'resize');
                  }}
                  className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm bg-[hsl(var(--primary))]"
                />
              )}
            </div>
          ))}
        </div>
        {/* The reference's zoom cluster, beside the stage. */}
        <div data-testid="layer-zoom" className="absolute -right-11 bottom-2 flex flex-col items-center gap-1">
          <button type="button" aria-label="Phóng to" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} className="st-btn st-sm st-icon w-9">
            <Plus strokeWidth={2.5} />
          </button>
          <span className="st-num text-[11px]">{Math.round((ZOOMS[zoom] / 16) * 100)}%</span>
          <button type="button" aria-label="Thu nhỏ" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))} className="st-btn st-sm st-icon w-9">
            <Minus strokeWidth={2.5} />
          </button>
        </div>
        </div>
      </div>

      <aside className="w-full shrink-0 lg:w-64">
        <div className="st-card flex flex-col gap-2 p-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-bold">Lớp</h3>
            <span data-testid="layer-count" className="st-num text-[11px] text-muted-foreground">
              {layers.length}/{MAX_LAYERS}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">kéo để sắp xếp</span>
          </div>

          <ol data-testid="layer-list" className="flex flex-col gap-1">
            {[...inPaintOrder(layers)].reverse().map((l) => (
              <li
                key={l.id}
                data-testid={`layer-row-${l.id}`}
                className={`flex items-center gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-xs ${
                  picked === l.id ? 'border-primary bg-sidebar-accent' : 'border-transparent hover:bg-muted'
                }`}
              >
                <button type="button" onClick={() => setPicked(l.id)} className="min-w-0 flex-1 truncate text-left">
                  {LAYER_LABELS[l.type]}
                  {l.props?.text ? ` · ${l.props.text}` : ''}
                </button>
                <button
                  type="button"
                  title="Lên một lớp"
                  data-testid={`layer-up-${l.id}`}
                  onClick={() => put(reorder(layers, l.id, 1))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowUp size={13} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  title="Xuống một lớp"
                  data-testid={`layer-down-${l.id}`}
                  onClick={() => put(reorder(layers, l.id, -1))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowDown size={13} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  title="Xoá lớp"
                  data-testid={`layer-del-${l.id}`}
                  onClick={() => put(layers.filter((x) => x.id !== l.id))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={13} strokeWidth={2.25} />
                </button>
              </li>
            ))}

            {/* Listed so the stack makes sense; locked because the engine already drew them. */}
            {PLACED_ROWS.filter((h) => h !== 'logo' || placement.engine === 'classic').map((h) => (
              <li
                key={h}
                data-testid={`layer-place-${h}`}
                className={`flex items-center gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-xs ${
                  handle === h ? 'border-primary bg-sidebar-accent' : 'border-transparent hover:bg-muted'
                }`}
              >
                <button type="button" onClick={() => setHandle(h)} className="min-w-0 flex-1 truncate text-left">
                  {HANDLE_LABELS[h]}
                </button>
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Move size={11} strokeWidth={2.5} /> kéo trên khung
                </span>
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between gap-2 border-t-2 border-border pt-2">
            <span className="text-[10px] leading-snug text-muted-foreground">
              Phụ đề chỉ chạy dọc — dải chữ luôn rộng bằng khung hình.
            </span>
            <button
              type="button"
              data-testid="place-reset"
              onClick={placement.onReset}
              disabled={!placementTouched(placement.card, placement.caption.pos)}
              className={`${BTN} shrink-0`}
            >
              <RotateCcw size={12} strokeWidth={2.5} />
              Về mặc định
            </button>
          </div>

          {picked && layers.some((l) => l.id === picked) && (
            <LayerProps
              layer={layers.find((l) => l.id === picked)!}
              media={media}
              onChange={(next) => put(layers.map((l) => (l.id === next.id ? next : l)))}
            />
          )}

          <button
            type="button"
            data-testid="layer-copy"
            disabled={(value[other] ?? []).length === 0}
            onClick={() =>
              put([
                ...layers,
                ...copyFrom(value[other] ?? [], (i) => `c${Date.now().toString(36)}${i}`),
              ].slice(0, MAX_LAYERS))
            }
            className="st-btn st-sm st-ghost"
          >
            <Copy strokeWidth={2.25} />
            Sao chép từ {FRAME_LABELS[other]}
          </button>
        </div>
      </aside>
    </div>
  );
}

/** The selected layer's own fields. Small on purpose: the canvas is where placing happens. */
function LayerProps({
  layer,
  media,
  onChange,
}: {
  layer: Layer;
  media: { id: string; name: string }[];
  onChange: (l: Layer) => void;
}) {
  const set = (props: Partial<NonNullable<Layer['props']>>) =>
    onChange({ ...layer, props: { ...(layer.props ?? {}), ...props } });

  return (
    <div data-testid="layer-props" className="flex flex-col gap-1.5 border-t border-border pt-2">
      {layer.type !== 'image' && layer.type !== 'shape' && (
        <label className={CAPS}>
          chữ
          <input
            data-testid="layer-text"
            value={layer.props?.text ?? ''}
            onChange={(e) => set({ text: e.target.value })}
            className="pen-line-sm ml-1 w-full rounded-md bg-background px-1.5 py-0.5 font-sans text-xs text-foreground"
          />
        </label>
      )}
      {layer.type === 'image' && (
        <label className={CAPS}>
          tệp
          <select
            data-testid="layer-media"
            value={layer.props?.media ?? ''}
            onChange={(e) => set({ media: e.target.value || undefined })}
            className="pen-line-sm ml-1 rounded-md bg-background px-1 py-0.5 font-sans text-xs font-semibold text-foreground"
          >
            <option value="">— chọn —</option>
            {media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={CAPS}>
        nhóm
        <input
          data-testid="layer-group"
          placeholder="(không)"
          value={layer.group ?? ''}
          onChange={(e) => onChange({ ...layer, group: e.target.value || undefined })}
          className="pen-line-sm ml-1 w-20 rounded-md bg-background px-1.5 py-0.5 font-sans text-xs text-foreground"
        />
      </label>
    </div>
  );
}
