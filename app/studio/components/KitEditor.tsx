'use client';

/**
 * Preview canvas in the middle, tab strip along the bottom, presets and fields on the right.
 *
 * The canvas is the real /api/image/card with this kit's parameters — Satori composition is
 * local and free, so a preview of a card can simply be a card.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardParams, cardPath, captionStyle } from '@/lib/studio/kits/load';
import { frameUrl } from '@/lib/studio/frame-url';
import { TAB_LABELS, labelFor, valueLabel } from '@/lib/studio/kits/labels';
import { LayerEditor, type LayerMap } from './LayerEditor';
import { PRESETS } from '@/app/lib/captionPresets';
import { contrastRatio, paletteFor, type ThemeName } from '@/lib/studio/card/theme';
import type { Kit } from '@/lib/studio/steps/types';

export interface FieldSpec {
  key: string;
  label: string;
  hint?: string;
  type: 'text' | 'number' | 'boolean' | 'enum' | 'color' | 'list';
  options?: string[];
  min?: number;
  max?: number;
}
export interface TabSpec {
  key: string;
  label: string;
  hint?: string;
  fields: FieldSpec[];
  presets: { id: string; values: Record<string, unknown> }[];
  /** The owner's own uploads for this tab, from Kho tài nguyên. */
  media?: { id: string; name: string; url: string; field: string }[];
}

const SAMPLE = {
  title: 'MỸ: CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG',
};
/** One line of narration, so the caption band has something of the right shape to draw. */
const SAMPLE_CUE = 'CỤ BÀ 82 TUỔI BỊ LỪA MẤT 2.500 ĐÔ';
/** Tabs whose change is only visible on a whole frame, not on the card alone. */
const FRAME_TABS = new Set(['captions', 'frame', 'stickers', 'signature', 'voice']);

/** One line per tab, so the strip says what each tab is currently set to. */
function summarise(tab: TabSpec, values: Record<string, unknown>): string {
  // The preset name leads: it is the one word that says which of these a tab is on, and the
  // field list deliberately excludes it.
  const preset = values.preset ? String(values.preset) : null;
  const parts = [
    preset,
    ...tab.fields.map((f) => {
      const v = values[f.key];
      // A field whose value IS the preset name adds nothing: "listicle · listicle · short".
      return v === undefined || v === '' || String(v) === preset ? null : String(v);
    }),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

/**
 * Đọc thử → Nghe thử: one sentence in the chosen voice, before a three-minute render.
 *
 * The sample uses make-reel.py's own rate — it hardcodes rate="+25%" and that file is never
 * edited — so what is heard here is what the reel will sound like. That is also why there is
 * no speed knob: a control the renderer cannot honour would be a promise Studio cannot keep.
 */
function VoiceTry({ voiceId }: { voiceId: string }) {
  const [text, setText] = useState(
    'Kiểu dân ông duy nhất mà tôi muốn cưới: một, không khí thị. Hai, tôn trọng cơ thể của người khác.',
  );
  const [on, setOn] = useState(false);
  const q = new URLSearchParams({ text: text.slice(0, 300) });
  if (voiceId) q.set('voice', voiceId);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="st-label text-muted-foreground">
        Đọc thử
      </span>
      <textarea
        data-testid="voice-sample-text"
        value={text}
        rows={3}
        onChange={(e) => {
          setText(e.target.value);
          setOn(false);
        }}
        className="pen-line-static w-full resize-y rounded-md bg-background p-2 text-xs outline-none"
      />
      {on ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio data-testid="voice-sample-audio" src={`/api/studio/tts-sample?${q}`} controls autoPlay className="h-8 w-full" />
      ) : (
        <button
          type="button"
          data-testid="voice-listen"
          onClick={() => setOn(true)}
          className="pen-line-sm self-start rounded-md bg-card px-2 py-1 text-xs font-semibold"
        >
          ▷ Nghe thử
        </button>
      )}
    </div>
  );
}

export function KitEditor({
  kit: initial,
  tabs,
  runId,
  samplePlate,
}: {
  kit: Kit;
  tabs: TabSpec[];
  /** Set when opened from a run's drawer: saving then asks which of the two it meant. */
  runId?: string;
  /**
   * The picture the frame tabs draw the caption band over. Passed from the server because
   * make-reel.py opens a path, and a client component has no idea where the repo is.
   */
  samplePlate?: string;
}) {
  const router = useRouter();
  const [kit, setKit] = useState<Kit>(initial);
  // Opens on the tab the canvas is showing. Landing on `identity` next to a card preview
  // asks the owner to work out which panel drives the picture.
  const [active, setActive] = useState(
    tabs.some((t) => t.key === 'card') ? 'card' : (tabs[0]?.key ?? 'card'),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** The reference's two modes: look at the frame, or arrange what is on it. */
  const [mode, setMode] = useState<'preview' | 'layers'>('preview');

  const tab = tabs.find((t) => t.key === active)!;
  const values = (kit[active] ?? {}) as Record<string, unknown>;
  /**
   * The canvas is the real thing, not a schema form: the card for the card tabs, and the
   * composed reel frame — the same one the run page shows — for the tabs whose effect is
   * only visible with a caption band and a sticker on it.
   */
  const src = useMemo(
    () =>
      FRAME_TABS.has(active)
        ? frameUrl({ text: SAMPLE_CUE, style: captionStyle(kit), plate: samplePlate })
        : `${cardPath(kit)}?${cardParams(kit, SAMPLE)}`,
    [kit, active],
  );

  const patch = (next: Record<string, unknown>) => {
    setKit((k) => ({ ...k, [active]: { ...((k[active] ?? {}) as object), ...next } }));
    setSaved(false);
  };

  /**
   * Choosing a preset REPLACES the tab; it does not merge into it. Merging kept the previous
   * kit's highlightColor through a theme change, which painted the demo kit's yellow onto the
   * newspaper theme's white — 1.2:1, and unreadable.
   */
  const applyPreset = (values: Record<string, unknown>) => {
    setKit((k) => ({ ...k, [active]: { ...values } }));
    setSaved(false);
  };

  // The same arithmetic the layout gate will judge by, run while the owner is still choosing.
  const warn = (() => {
    if (active !== 'card' || (values.engine ?? 'classic') !== 'studio') return null;
    const pal = paletteFor(values.theme as ThemeName, values.highlightColor as string | undefined);
    const r = contrastRatio(pal.hl, pal.bg);
    if (r >= 3) return null;
    return `Màu nhấn chỉ đạt ${r.toFixed(2)}:1 trên nền ${pal.bg} — dưới ngưỡng 3:1, cổng ảnh sẽ chặn.`;
  })();

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/studio/kits/${kit.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(kit),
      });
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(b.error ?? `HTTP ${res.status}`);
      else {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * "Chỉ lượt này": the tab being edited becomes this run's override and the owner goes
   * straight back. Nothing is written to the kit — that is the whole point of the choice,
   * and overrides have never written back to a kit since slice 2.
   */
  async function saveToRun() {
    if (!runId) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/studio/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        // In layer mode the thing being edited is kit.layers, not the active tab — sending
        // the tab would save something the owner was not looking at.
        body: JSON.stringify({
          overrides: mode === 'layers' ? { layers: kit.layers } : { [active]: values },
        }),
      });
      if (!res.ok) {
        setErr(((await res.json().catch(() => ({}))) as any).error ?? `HTTP ${res.status}`);
        return;
      }
      router.push(`/studio/runs/${runId}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {(['preview', 'layers'] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`kit-mode-${m}`}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`pen-line-sm rounded-md px-2.5 py-1 text-xs font-semibold ${
              mode === m ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
          >
            {m === 'preview' ? '👁 Xem trước' : '✎ Chỉnh lớp'}
          </button>
        ))}
      </div>

      {mode === 'layers' ? (
        <LayerEditor
          frameSrc={frameUrl({ text: SAMPLE_CUE, style: captionStyle(kit), plate: samplePlate })}
          value={(kit.layers ?? {}) as LayerMap}
          onChange={(layers) => {
            setKit((k) => ({ ...k, layers }));
            setSaved(false);
          }}
          media={tabs
            .flatMap((t) => t.media ?? [])
            .map((m) => ({ id: m.id, name: m.name }))}
        />
      ) : null}

      {mode === 'layers' && (
        // The save row lives inside the tab panel, which this mode hides — so it gets its
        // own. A screen that cannot save what it just edited is not a screen.
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="kit-save"
            disabled={saving}
            onClick={save}
            className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : runId ? 'Lưu vào bộ nhận diện' : 'Lưu'}
          </button>
          {runId && (
            <button
              type="button"
              data-testid="kit-save-run"
              disabled={saving}
              onClick={saveToRun}
              className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Chỉ lượt này
            </button>
          )}
          {saved && (
            <span data-testid="kit-saved" className="st-label text-[hsl(var(--success))]">
              đã lưu
            </span>
          )}
          {err && <span className="text-xs text-[hsl(var(--destructive))]">{err}</span>}
        </div>
      )}

      {/* Not merely hidden: a hidden panel keeps its buttons in the DOM, and two elements
          with the same testid is a page where "click save" has no single answer. */}
      {mode === 'preview' && (
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="kit-canvas"
            src={src}
            alt=""
            className="pen-line-static max-h-[26rem] rounded-[var(--radius)]"
          />
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          <div className="pen-line-static flex flex-col gap-3 rounded-[var(--radius)] bg-card p-4">
            <h2 className="text-sm font-semibold">{tab.label}</h2>
            {tab.hint && <p className="-mt-2 text-[11px] text-muted-foreground">{tab.hint}</p>}

            {tab.presets.length > 0 && active === 'captions' ? (
              // The reference shows a wall of rendered styles, not a list of names — a
              // caption preset is a look, and a look is judged by looking. Each thumbnail is
              // the same composed frame the run page draws, at this preset.
              <div data-testid="preset-gallery" className="grid grid-cols-2 gap-1.5">
                {tab.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`preset-${tab.key}-${p.id}`}
                    onClick={() => applyPreset(p.values)}
                    className={`pen-line-sm overflow-hidden rounded-md ${
                      values.preset === p.id ? 'ring-2 ring-[hsl(var(--primary))]' : ''
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frameUrl({ text: SAMPLE_CUE, style: { preset: p.id }, plate: samplePlate })}
                      alt=""
                      loading="lazy"
                      data-testid={`preset-thumb-${p.id}`}
                      className="aspect-[9/16] w-full object-cover object-center"
                      style={{ objectPosition: 'center 46%' }}
                    />
                    <span className="block bg-card px-1 py-0.5 text-[10px] font-semibold">
                      {PRESETS[p.id]?.label ?? p.id}
                    </span>
                  </button>
                ))}
              </div>
            ) : tab.presets.length > 0 ? (
              <div data-testid="preset-gallery" className="flex flex-wrap gap-1.5">
                {tab.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`preset-${tab.key}-${p.id}`}
                    onClick={() => applyPreset(p.values)}
                    className={`pen-line-sm rounded-md px-2 py-1 text-xs font-semibold ${
                      values.preset === p.id ? 'bg-primary text-primary-foreground' : 'bg-card'
                    }`}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            ) : null}

            {active === 'voice' && <VoiceTry voiceId={String(values.voiceId ?? '')} />}

            {warn && (
              <p
                data-testid="kit-contrast-warning"
                className="pen-line-sm rounded-md bg-[hsl(var(--warning))] px-2 py-1 text-[11px] text-[hsl(var(--warning-foreground))]"
              >
                {warn}
              </p>
            )}

            {tab.media && tab.media.length > 0 && (
              <div data-testid="kit-media" className="flex flex-col gap-1.5">
                <span className="st-label text-muted-foreground">
                  Tệp của bạn
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tab.media.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      title={m.name}
                      data-testid={`media-pick-${m.id}`}
                      onClick={() => patch({ [m.field]: m.id })}
                      className={`pen-line-sm max-w-[8rem] truncate rounded-md px-2 py-1 text-[10px] font-semibold ${
                        values[m.field] === m.id ? 'bg-primary text-primary-foreground' : 'bg-card'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab.fields.map((f) => (
              <label key={f.key} className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs">{f.label}</span>
                  {f.hint && (
                    <span className="text-[10px] leading-snug text-muted-foreground">{f.hint}</span>
                  )}
                </span>
                {f.type === 'enum' ? (
                  <select
                    data-testid={`field-${tab.key}-${f.key}`}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => patch({ [f.key]: e.target.value })}
                    className="pen-line-static shrink-0 rounded-md bg-background px-2 py-1 text-xs"
                  >
                    <option value="">(mặc định)</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {valueLabel(o)}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'color' ? (
                  // <input type="color"> has no empty state — it is always showing some
                  // colour — so "chưa đặt, theo giao diện" is carried on data-unset and
                  // given a way back. Without the ↺ the first click on the swatch would
                  // pin a colour the owner could never remove.
                  <span
                    data-testid={`field-${tab.key}-${f.key}`}
                    data-unset={values[f.key] === undefined ? 'true' : 'false'}
                    data-value={String(values[f.key] ?? '')}
                    className="flex shrink-0 items-center gap-1"
                  >
                    <input
                      type="color"
                      data-testid={`swatch-${tab.key}-${f.key}`}
                      value={String(values[f.key] ?? '#FFFFFF')}
                      onChange={(e) => patch({ [f.key]: e.target.value.toUpperCase() })}
                      className="h-6 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {values[f.key] === undefined ? 'theo giao diện' : String(values[f.key])}
                    </span>
                    {values[f.key] !== undefined && (
                      <button
                        type="button"
                        title="Bỏ, dùng màu của giao diện"
                        data-testid={`clear-${tab.key}-${f.key}`}
                        onClick={() => patch({ [f.key]: undefined })}
                        className="text-[11px] text-muted-foreground hover:text-primary"
                      >
                        ↺
                      </button>
                    )}
                  </span>
                ) : f.type === 'list' ? (
                  <input
                    type="text"
                    data-testid={`field-${tab.key}-${f.key}`}
                    value={(Array.isArray(values[f.key]) ? (values[f.key] as string[]) : []).join(' ')}
                    onChange={(e) =>
                      patch({ [f.key]: e.target.value.split(/\s+/).filter(Boolean) })
                    }
                    className="pen-line-static w-32 shrink-0 rounded-md bg-background px-2 py-1 text-xs"
                  />
                ) : f.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    data-testid={`field-${tab.key}-${f.key}`}
                    checked={Boolean(values[f.key])}
                    onChange={(e) => patch({ [f.key]: e.target.checked })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    data-testid={`field-${tab.key}-${f.key}`}
                    min={f.min}
                    max={f.max}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) =>
                      patch({
                        [f.key]:
                          f.type === 'number'
                            ? e.target.value === ''
                              ? undefined
                              : Number(e.target.value)
                            : e.target.value,
                      })
                    }
                    className="pen-line-static w-32 shrink-0 rounded-md bg-background px-2 py-1 text-xs"
                  />
                )}
              </label>
            ))}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {runId && (
                <p className="w-full text-[11px] leading-snug text-muted-foreground">
                  Mở từ một lượt chạy. Lưu vào bộ nhận diện đổi mọi video sau này; chỉ lượt này
                  thì bộ nhận diện giữ nguyên.
                </p>
              )}
              <button
                type="button"
                data-testid="kit-save"
                disabled={saving}
                onClick={save}
                className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? 'Đang lưu…' : runId ? 'Lưu vào bộ nhận diện' : 'Lưu'}
              </button>
              {runId && (
                <button
                  type="button"
                  data-testid="kit-save-run"
                  disabled={saving}
                  onClick={saveToRun}
                  className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Chỉ lượt này
                </button>
              )}
              {saved && (
                <span data-testid="kit-saved" className="st-label text-[hsl(var(--success))]">
                  đã lưu
                </span>
              )}
            </div>
            {err && (
              <p data-testid="kit-error" className="text-xs text-[hsl(var(--destructive))]">
                {err}
              </p>
            )}
          </div>
        </aside>
      </div>

      )}

      {mode === 'preview' && (
      <ol data-testid="tab-strip" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              data-testid={`tab-${t.key}`}
              data-active={t.key === active}
              onClick={() => setActive(t.key)}
              className={`pen-line-sm flex min-w-[8rem] flex-col items-start rounded-md px-2.5 py-1.5 text-left ${
                t.key === active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'bg-card'
              }`}
            >
              <span className="text-xs font-semibold">{t.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {summarise(t, (kit[t.key] ?? {}) as Record<string, unknown>)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      )}
    </div>
  );
}
