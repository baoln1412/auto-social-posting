'use client';

/**
 * The per-run drawer. Everything here is merged over the kit for this run only and never
 * written back — a `<details>` because the browser already has a disclosure widget.
 */
import type { Overrides } from '@/lib/studio/steps/types';
import { PRESETS } from '@/app/lib/captionPresets';
import { valueLabel } from '@/lib/studio/kits/labels';

export interface KitOption {
  id: string;
  name: string;
}
/** The owner's uploads, for the controls that pick one. */
export interface MediaOption {
  id: string;
  name: string;
}

const FIELD = 'pen-line-static rounded-md bg-card px-2 py-1 text-xs';
const ROW = 'flex items-center justify-between gap-3 py-1.5';

export function OverrideDrawer({
  value,
  onChange,
  kits,
  open,
  runId,
  kitId,
  sounds = [],
}: {
  value: Overrides;
  onChange: (next: Overrides) => void;
  kits: KitOption[];
  open?: boolean;
  /** Set on the run page: enables "Mở cấu hình đầy đủ →" and the save-choice it leads to. */
  runId?: string;
  kitId?: string;
  sounds?: MediaOption[];
}) {
  const set = (patch: Overrides) => onChange({ ...value, ...patch });
  const caps = (value.captions ?? {}) as Record<string, unknown>;
  const count = Object.keys(value).filter((k) => k !== 'demo').length;

  return (
    <details open={open} data-testid="override-drawer" className="pen-line-static rounded-md bg-card">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold">
        ⚙ Tuỳ chỉnh riêng lượt này
        {count > 0 && <span className="ml-2 text-[11px] font-semibold text-primary"><span className="st-num">{count}</span> thay đổi</span>}
      </summary>

      <div className="border-t border-border px-3 py-2">
        <label className={ROW}>
          <span className="text-xs">Bộ nhận diện</span>
          <select
            className={FIELD}
            data-testid="ov-kit"
            value={value.kitId ?? ''}
            onChange={(e) => set({ kitId: e.target.value || undefined })}
          >
            <option value="">(theo kênh)</option>
            {kits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <label className={ROW}>
          <span className="text-xs">Độ dài</span>
          <select
            className={FIELD}
            value={value.durationBand ?? 'medium'}
            onChange={(e) => set({ durationBand: e.target.value as Overrides['durationBand'] })}
          >
            <option value="short">Ngắn</option>
            <option value="medium">Vừa</option>
            <option value="long">Dài</option>
          </select>
        </label>

        <label className={ROW}>
          <span className="text-xs">Chọn bình luận</span>
          <select
            className={FIELD}
            data-testid="ov-comment-mode"
            value={value.commentMode ?? 'auto'}
            onChange={(e) => set({ commentMode: e.target.value as Overrides['commentMode'] })}
          >
            <option value="auto">Tự động</option>
            <option value="manual">Tự chọn</option>
          </select>
        </label>

        <label className={ROW}>
          <span className="text-xs">Nhạc nền</span>
          <select
            className={FIELD}
            value={value.music ?? 'none'}
            onChange={(e) => set({ music: e.target.value as Overrides['music'] })}
          >
            <option value="none">Tắt</option>
            <option value="soft">Nhỏ</option>
            <option value="default">Mặc định</option>
            <option value="loud">To</option>
          </select>
        </label>

        <label className={ROW}>
          <span className="text-xs">Cách kể</span>
          <select
            className={FIELD}
            data-testid="ov-narration"
            value={String((value.post as any)?.narration ?? '')}
            onChange={(e) =>
              set({
                post: { ...((value.post ?? {}) as object), narration: e.target.value || undefined },
              } as Overrides)
            }
          >
            <option value="">(theo kit)</option>
            <option value="verbatim">{valueLabel('verbatim')}</option>
            <option value="ai">{valueLabel('ai')}</option>
          </select>
        </label>

        <label className={ROW}>
          <span className="text-xs">Mẫu phụ đề</span>
          <select
            className={FIELD}
            data-testid="ov-caption-preset"
            value={String(caps.preset ?? '')}
            onChange={(e) =>
              set({ captions: { ...caps, preset: e.target.value || undefined } } as Overrides)
            }
          >
            <option value="">(theo kit)</option>
            {Object.entries(PRESETS).map(([id, v]) => (
              <option key={id} value={id}>
                {String((v as { label?: string }).label ?? id)}
              </option>
            ))}
          </select>
        </label>

        {(
          [
            ['reviewBeforeRender', 'Duyệt trước khi dựng', true],
            ['includeIntro', 'Cảnh mở đầu', true],
            ['includeLayout', 'Bố cục khung hình', true],
            ['readTitle', 'Đọc tiêu đề trước caption', false],
          ] as const
        ).map(([key, label, dflt]) => (
          <label key={key} className={ROW}>
            <span className="text-xs">{label}</span>
            <input
              type="checkbox"
              data-testid={`ov-${key}`}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={(value[key] as boolean | undefined) ?? dflt}
              onChange={(e) => set({ [key]: e.target.checked })}
            />
          </label>
        ))}

        <label className={ROW}>
          <span className="text-xs">Outro kêu gọi</span>
          <input
            className={`${FIELD} w-40`}
            data-testid="ov-outro"
            placeholder="(không có)"
            title="Một thẻ kết hiện ở mấy giây cuối"
            value={value.outro ?? ''}
            onChange={(e) => set({ outro: e.target.value || undefined })}
          />
        </label>

        <label className={ROW}>
          <span className="text-xs">Âm thanh SFX</span>
          <select
            className={FIELD}
            data-testid="ov-sfx"
            title="Phát ở mỗi lần chuyển cảnh"
            value={value.sfx ?? ''}
            onChange={(e) => set({ sfx: e.target.value || undefined })}
          >
            <option value="">(không có)</option>
            {sounds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {runId && kitId && (
          <a
            href={`/studio/kits/${kitId}?run=${runId}`}
            data-testid="ov-full-config"
            className="mt-1 block py-1.5 st-label text-muted-foreground hover:text-primary"
          >
            ⚙ Mở cấu hình đầy đủ →
          </a>
        )}
      </div>
    </details>
  );
}
