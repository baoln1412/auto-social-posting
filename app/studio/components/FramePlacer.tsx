'use client';

/**
 * Đặt vị trí — the run screen's placement surface.
 *
 * Chrome around PlacementHandles: the composed frame the preview just drew, at a size you
 * can grab, plus the way back to the kit's own answer. The handles and every number they
 * move live in PlacementHandles, which the kit editor's layer stage hosts as well.
 */
import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { PlacementHandles, placementTouched, type CardPlacement, type Handle, type PlacementPatch } from './PlacementHandles';
import type { Layout } from '@/lib/studio/steps/filters';
import type { StepOptions } from '@/lib/studio/steps/types';

export function FramePlacer({
  src,
  engine,
  ratio,
  layout,
  captionDefaults,
  titleLen,
  opts,
  onChange,
}: {
  /** The composed frame the preview just drew — card, caption band and sticker together. */
  src: string;
  engine: 'classic' | 'studio';
  ratio: string;
  layout: Layout;
  captionDefaults: Record<string, unknown>;
  titleLen: number;
  opts: StepOptions;
  onChange: (o: StepOptions) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Handle | null>(null);

  const card = (opts.card ?? {}) as CardPlacement;
  const caption = { ...captionDefaults, ...((opts.captions ?? {}) as Record<string, unknown>) };

  const apply = (patch: PlacementPatch) =>
    onChange({
      ...opts,
      ...(patch.card ? { card: { ...(opts.card as object), ...patch.card } } : {}),
      ...(patch.caption ? { captions: { ...(opts.captions as object), ...patch.caption } } : {}),
    });

  const reset = () => {
    const { y, width, logoX, logoY, ...restCard } = card;
    const { pos, ...restCaps } = (opts.captions ?? {}) as Record<string, unknown>;
    onChange({ ...opts, card: restCard, captions: restCaps });
  };

  const touched = placementTouched(card, (opts.captions as { pos?: number } | undefined)?.pos);

  return (
    <div data-testid="frame-placer" className="st-card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="st-label text-muted-foreground">Đặt vị trí</span>
        <button type="button" data-testid="place-reset" onClick={reset} disabled={!touched} className="st-btn st-sm">
          <RotateCcw className="h-3 w-3" aria-hidden />
          Về mặc định
        </button>
      </div>

      <div ref={canvas} className="st-stage relative mx-auto w-full max-w-[15rem] touch-none select-none" style={{ aspectRatio: '1080 / 1920' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" data-testid="preview-frame" className="absolute inset-0 h-full w-full rounded-md object-contain" draggable={false} />
        <PlacementHandles
          canvas={canvas}
          engine={engine}
          ratio={ratio}
          layout={layout}
          caption={caption}
          card={card}
          titleLen={titleLen}
          picked={picked}
          onPick={setPicked}
          onChange={apply}
        />
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Kéo để đặt lại chỗ. Phụ đề chỉ chạy dọc — dải chữ luôn rộng bằng khung hình.
        {engine !== 'classic' && ' Bộ nhận diện này không có logo trên thẻ.'}
      </p>
    </div>
  );
}
