'use client';

/**
 * Cấu hình video — the reference's three columns and a tab strip (mock-v3/03-config).
 *
 * Frame chips on the left choose what the phone shows: Thân (a body scene, the composed
 * frame), Mở đầu (the title read first), Bìa (the card alone at the kit's ratio). The phone
 * is the one dark surface, in a pen bezel. The panel on the right is the active tab, drawn
 * as icon + title + helper rows: exclusive choices with few options are radio cards, numbers
 * are sliders with the value in mono beside a number input, on/off is a toggle. The strip
 * along the bottom is eight cards, each with a two-line summary of what it is set to.
 *
 * The canvas is the real thing, never a schema form: the card route with this kit's parameters
 * for Bìa; for Thân the composed frame the run page draws — the card placed where the S12
 * pass puts it (or as the plate for `multi`), the caption band from make-reel.py's own
 * render_cue — because a preview that draws its own version of either starts lying.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Captions,
  Check,
  Eye,
  FileText,
  Frame,
  Image as ImageIcon,
  Layers,
  List,
  Mic,
  Music,
  PenLine,
  Smile,
  Sparkles,
  Tv,
  Zap,
} from 'lucide-react';
import { cardParams, cardPath, captionStyle } from '@/lib/studio/kits/load';
import { frameUrl } from '@/lib/studio/frame-url';
import { TAB_LABELS, valueLabel } from '@/lib/studio/kits/labels';
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
const FRAME_TABS = new Set(['captions', 'frame', 'stickers', 'signature', 'voice', 'music']);

type FrameChip = 'body' | 'hook' | 'cover';
const CHIPS: { id: FrameChip; label: string; Icon: typeof Frame }[] = [
  { id: 'body', label: 'Thân', Icon: Frame },
  { id: 'hook', label: 'Mở đầu', Icon: Zap },
  { id: 'cover', label: 'Bìa', Icon: ImageIcon },
];

const TAB_ICONS: Record<string, typeof Frame> = {
  identity: Tv,
  post: FileText,
  voice: Mic,
  frame: Frame,
  card: ImageIcon,
  captions: Captions,
  signature: PenLine,
  stickers: Smile,
  music: Music,
};

/**
 * The exclusive choices the reference draws as cards with a description under each, and what
 * the code actually does when the kit leaves one unset — so an unset field shows the option
 * that will happen, marked `mặc định`, instead of showing nothing selected.
 * `steps/draft.ts` reads `narration !== 'ai'`; `steps/overlay.ts` `layoutOf` falls back to
 * `multi`; `kits/load.ts` reads `comments ?? 'none'`.
 */
const RADIO_FIELDS: Record<string, string> = {
  'post.narration': 'verbatim',
  'frame.layout': 'multi',
  'card.comments': 'none',
};

/** One line per tab, in words: the preset's name, then each field's labelled value. */
function summarise(tab: TabSpec, values: Record<string, unknown>): string {
  const preset = values.preset ? String(values.preset) : null;
  const presetLabel = preset ? (tab.key === 'captions' ? (PRESETS[preset]?.label ?? preset) : valueLabel(preset)) : null;
  const parts = [
    presetLabel,
    ...tab.fields.map((f) => {
      const v = values[f.key];
      if (v === undefined || v === '' || String(v) === preset) return null;
      if (f.type === 'boolean') return v ? f.label.toLowerCase() : null;
      if (f.type === 'list') return Array.isArray(v) ? `${v.length} ${f.label.toLowerCase()}` : null;
      if (f.type === 'number') return `${f.label.toLowerCase()} ${v}`;
      return valueLabel(String(v));
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
  const [text, setText] = useState('Kiểu đàn ông duy nhất mà tôi muốn cưới: một, không kì thị. Hai, biết làm việc nhà.');
  const [play, setPlay] = useState<string | null>(null);
  const q = new URLSearchParams({ voice: voiceId, text }).toString();
  return (
    <div className="st-group">
      <div className="st-gt">
        <Mic strokeWidth={2.25} />
        Đọc thử
      </div>
      <textarea
        data-testid="voice-sample-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[13px]"
      />
      {play && <audio data-testid="voice-sample-audio" src={`/api/studio/tts-sample?${q}`} controls autoPlay className="w-full" />}
      <button type="button" data-testid="voice-listen" onClick={() => setPlay(q)} className="st-btn st-sm self-start">
        ▶ Nghe thử
      </button>
    </div>
  );
}

export function KitEditor({
  kit: initial,
  tabs,
  runId,
  kits = [],
  background,
}: {
  kit: Kit;
  tabs: TabSpec[];
  /** Set when opened from a run's drawer: saving then asks which of the two it meant. */
  runId?: string;
  /** Every kit, for the picker in the toolbar. */
  kits?: { id: string; name: string }[];
  /** Absolute path of this kit's background image, if it names one — passed from the server. */
  background?: string | null;
}) {
  const router = useRouter();
  const [kit, setKit] = useState<Kit>(initial);
  const [active, setActive] = useState(tabs.some((t) => t.key === 'card') ? 'card' : (tabs[0]?.key ?? 'card'));
  const [chipPick, setChipPick] = useState<FrameChip | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showJson, setShowJson] = useState(false);
  /** The reference's two modes: look at the frame, or arrange what is on it. */
  const [mode, setMode] = useState<'preview' | 'layers'>('preview');

  const tab = tabs.find((t) => t.key === active)!;
  const values = (kit[active] ?? {}) as Record<string, unknown>;
  // Card tabs open on the card; frame tabs open on a body scene. A chip the owner picked
  // wins until the tab changes the default underneath it.
  const chip: FrameChip = chipPick ?? (FRAME_TABS.has(active) ? 'body' : 'cover');
  const layout = ((kit.frame ?? {}) as { layout?: 'card-top' | 'continuous' | 'multi' }).layout ?? 'multi';

  const cardUrl = `${cardPath(kit)}?${cardParams(kit, SAMPLE)}`;
  const src = useMemo(() => {
    if (chip === 'cover') return cardUrl;
    return frameUrl({
      text: chip === 'hook' ? SAMPLE.title : SAMPLE_CUE,
      style: captionStyle(kit),
      plate: cardUrl,
      layout,
      background: background ?? null,
    });
  }, [kit, chip, cardUrl, layout, background]);

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
        body: JSON.stringify({ overrides: mode === 'layers' ? { layers: kit.layers } : { [active]: values } }),
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

  const saveRow = (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {runId && (
        <p className="w-full text-[11px] leading-snug text-muted-foreground">
          Mở từ một lượt chạy. Lưu vào bộ nhận diện đổi mọi video sau này; chỉ lượt này thì bộ nhận diện giữ nguyên.
        </p>
      )}
      <button type="button" data-testid="kit-save" disabled={saving} onClick={save} className="st-btn st-sm st-primary">
        <Check strokeWidth={2.5} />
        {saving ? 'Đang lưu…' : runId ? 'Lưu vào bộ nhận diện' : 'Lưu'}
      </button>
      {runId && (
        <button type="button" data-testid="kit-save-run" disabled={saving} onClick={saveToRun} className="st-btn st-sm">
          Chỉ lượt này
        </button>
      )}
      {saved && (
        <span data-testid="kit-saved" className="text-[12px] font-semibold text-[hsl(var(--success))]">
          đã lưu
        </span>
      )}
      {err && (
        <p data-testid="kit-error" className="w-full text-xs text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}
    </div>
  );

  const TabIcon = TAB_ICONS[active] ?? Sparkles;

  return (
    <div className="flex flex-col gap-3">
      {/* The toolbar the reference keeps in its header: which kit, which mode, the JSON. */}
      <div data-testid="kit-toolbar" className="flex flex-wrap items-center gap-2">
        <select
          data-testid="kit-picker"
          value={kit.id}
          onChange={(e) => router.push(`/studio/kits/${e.target.value}`)}
          className="rounded-lg border-2 border-foreground bg-card px-2.5 py-1.5 text-[13px] font-bold"
        >
          {(kits.length ? kits : [{ id: kit.id, name: kit.name ?? kit.id }]).map((k) => (
            <option key={k.id} value={k.id}>
              ● {k.name}
            </option>
          ))}
        </select>
        <span className="st-seg">
          {(['preview', 'layers'] as const).map((m) => (
            <button key={m} type="button" data-testid={`kit-mode-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)} className={mode === m ? 'st-on' : ''}>
              {m === 'preview' ? <Eye strokeWidth={2.25} /> : <Layers strokeWidth={2.25} />}
              {m === 'preview' ? 'Xem trước' : 'Chỉnh lớp'}
            </button>
          ))}
        </span>
        <button type="button" data-testid="kit-json" aria-pressed={showJson} onClick={() => setShowJson((v) => !v)} className="st-btn st-sm">
          <List strokeWidth={2.25} />
          Xem cấu hình
        </button>
        {mode === 'layers' && <span className="ml-auto">{saveRow}</span>}
      </div>

      {showJson && (
        <pre data-testid="kit-json-view" className="st-quiet max-h-64 overflow-auto px-3 py-2 text-[11px]" style={{ fontFamily: "'Source Code Pro', monospace" }}>
          {JSON.stringify(kit, null, 2)}
        </pre>
      )}

      {mode === 'layers' ? (
        <LayerEditor
          frameSrc={frameUrl({ text: SAMPLE_CUE, style: captionStyle(kit), plate: cardUrl, layout, background: background ?? null })}
          value={(kit.layers ?? {}) as LayerMap}
          onChange={(layers) => {
            setKit((k) => ({ ...k, layers }));
            setSaved(false);
          }}
          media={tabs.flatMap((t) => t.media ?? []).map((m) => ({ id: m.id, name: m.name }))}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[72px_minmax(0,1fr)_336px]" style={{ height: 'min(640px, calc(100vh - 15rem))', gridTemplateRows: 'minmax(0, 1fr)' }}>
          {/* Which frame the phone shows. */}
          <div data-testid="frame-chips" className="flex gap-1.5 lg:flex-col">
            {CHIPS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                data-testid={`frame-${id}`}
                aria-pressed={chip === id}
                onClick={() => setChipPick(id)}
                className={`${chip === id ? 'st-card border-primary bg-sidebar-accent text-primary' : 'st-quiet text-muted-foreground'} px-1 py-2 text-center text-[11px] font-bold`}
              >
                <Icon size={16} strokeWidth={2.25} className="mx-auto mb-0.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 justify-center">
            <div className="st-stage st-phone h-full max-h-full w-auto" style={{ aspectRatio: '9 / 16' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-testid="kit-canvas" src={src} alt="" style={{ objectFit: chip === 'cover' ? 'contain' : 'cover' }} />
              <span className="st-tag st-eyebrow">{chip === 'cover' ? 'ẢNH BÀI VIẾT' : chip === 'hook' ? 'MỞ ĐẦU' : 'ẢNH BÀI VIẾT · CẢNH 2'}</span>
            </div>
          </div>

          <aside className="st-card flex flex-col gap-3 overflow-y-auto px-4 py-3.5">
            <div>
              <h2 className="flex items-center gap-2 text-[19px] font-bold" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
                <TabIcon size={20} strokeWidth={2.25} className="text-primary" />
                {tab.label}
              </h2>
              {tab.hint && <p className="text-[12.5px] text-muted-foreground">{tab.hint}</p>}
            </div>

            {tab.presets.length > 0 && active === 'captions' ? (
              // The reference shows a wall of rendered styles, not a list of names — a
              // caption preset is a look, and a look is judged by looking. Each thumbnail is
              // the same composed frame the run page draws, at this preset.
              <div className="st-group">
                <div className="st-gt">
                  <Sparkles strokeWidth={2.25} />
                  Mẫu có sẵn
                </div>
                <div data-testid="preset-gallery" className="grid grid-cols-2 gap-1.5">
                  {tab.presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-testid={`preset-${tab.key}-${p.id}`}
                      onClick={() => applyPreset(p.values)}
                      className={`overflow-hidden rounded-lg border-2 ${values.preset === p.id ? 'border-primary shadow-[3px_3px_0_hsl(var(--foreground))]' : 'border-foreground'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={frameUrl({ text: SAMPLE_CUE, style: { preset: p.id }, plate: cardUrl, layout, background: background ?? null })}
                        alt=""
                        loading="lazy"
                        data-testid={`preset-thumb-${p.id}`}
                        className="aspect-[9/16] w-full object-cover object-center"
                        style={{ objectPosition: 'center 46%' }}
                      />
                      <span className="block bg-card px-1 py-0.5 text-[10px] font-semibold">{PRESETS[p.id]?.label ?? p.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : tab.presets.length > 0 ? (
              <div className="st-group">
                <div className="st-gt">
                  <Sparkles strokeWidth={2.25} />
                  Mẫu có sẵn
                </div>
                <div data-testid="preset-gallery" className="flex flex-wrap gap-1.5">
                  {tab.presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-testid={`preset-${tab.key}-${p.id}`}
                      onClick={() => applyPreset(p.values)}
                      className={`st-chip ${values.preset === p.id ? 'st-on' : ''}`}
                    >
                      {valueLabel(p.id)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {active === 'voice' && <VoiceTry voiceId={String(values.voiceId ?? '')} />}

            {warn && (
              <p data-testid="kit-contrast-warning" className="rounded-lg border-2 border-foreground bg-[hsl(var(--warning))] px-2.5 py-1.5 text-[11.5px] text-[hsl(var(--warning-foreground))]">
                {warn}
              </p>
            )}

            {tab.media && tab.media.length > 0 && (
              <div data-testid="kit-media" className="st-group">
                <div className="st-gt">
                  <ImageIcon strokeWidth={2.25} />
                  Tệp của bạn
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tab.media.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      title={m.name}
                      data-testid={`media-pick-${m.id}`}
                      onClick={() => patch({ [m.field]: m.id })}
                      className={`st-chip max-w-[8rem] truncate ${values[m.field] === m.id ? 'st-on' : ''}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab.fields.map((f) => (
              <Field key={f.key} tab={tab.key} f={f} value={values[f.key]} onChange={(v) => patch({ [f.key]: v })} />
            ))}

            {saveRow}
          </aside>
        </div>
      )}

      {mode === 'preview' && (
        <ol data-testid="tab-strip" className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => {
            const Icon = TAB_ICONS[t.key] ?? Sparkles;
            return (
              <li key={t.key} className="min-w-[8.5rem] flex-1">
                <button
                  type="button"
                  data-testid={`tab-${t.key}`}
                  data-active={t.key === active}
                  onClick={() => {
                    setActive(t.key);
                    setChipPick(null);
                  }}
                  className={`st-tab w-full ${t.key === active ? 'st-on' : ''}`}
                >
                  <b>
                    <Icon strokeWidth={2.25} />
                    {t.label}
                  </b>
                  <small>{summarise(t, (kit[t.key] ?? {}) as Record<string, unknown>)}</small>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** One control, drawn the reference's way for its kind. Test ids are v2's, unchanged. */
function Field({
  tab,
  f,
  value,
  onChange,
}: {
  tab: string;
  f: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${tab}-${f.key}`;
  const head = (
    <div className="st-gt">
      <span className="text-[13.5px] font-bold">{f.label}</span>
    </div>
  );
  const help = f.hint ? <div className="st-help">{f.hint}</div> : null;

  const fallback = RADIO_FIELDS[`${tab}.${f.key}`];
  if (f.type === 'enum' && fallback !== undefined) {
    const effective = value === undefined || value === '' ? fallback : String(value);
    // A select still exists for the value — the same id v2 had, hidden — so the choice is
    // the cards and the contract is the same.
    return (
      <div className="st-group">
        {head}
        <select data-testid={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="sr-only">
          <option value="">(mặc định)</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {valueLabel(o, `${tab}.${f.key}`)}
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-2">
          {f.options?.map((o) => {
            const label = valueLabel(o, `${tab}.${f.key}`);
            const [name, desc] = label.includes('(') ? [label.slice(0, label.indexOf('(')).trim(), label.slice(label.indexOf('(') + 1, -1)] : [label, ''];
              const on = effective === o;
              return (
                <button key={o} type="button" data-testid={`radio-${tab}-${f.key}-${o}`} aria-pressed={on} onClick={() => onChange(o)} className={`st-radio ${on ? 'st-on' : ''}`}>
                  {on ? <Check strokeWidth={2.5} /> : <span className="mt-0.5 h-4 w-4 flex-none rounded-full border-2 border-muted-foreground" />}
                  <span>
                    <b>
                      {name}
                      {on && value === undefined && <span className="ml-1.5 text-[10px] font-semibold uppercase text-muted-foreground">mặc định</span>}
                    </b>
                    {desc && <span>{desc}</span>}
                  </span>
                </button>
              );
          })}
        </div>
        {help}
      </div>
    );
  }

  if (f.type === 'enum') {
    return (
      <label className="st-group">
        {head}
        <select data-testid={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[13px] font-semibold">
          <option value="">(mặc định)</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {valueLabel(o, `${tab}.${f.key}`)}
            </option>
          ))}
        </select>
        {help}
      </label>
    );
  }

  if (f.type === 'boolean') {
    return (
      <label className="st-group cursor-pointer">
        <div className="flex items-center gap-3">
          <span className="text-[13.5px] font-bold">{f.label}</span>
          <input type="checkbox" data-testid={id} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
          <span className={`st-toggle ml-auto ${value ? 'st-on' : ''}`} aria-hidden />
        </div>
        {help}
      </label>
    );
  }

  if (f.type === 'color') {
    // <input type="color"> has no empty state — it is always showing some colour — so "chưa
    // đặt, theo giao diện" is carried on data-unset and given a way back. Without the ↺ the
    // first click on the swatch would pin a colour the owner could never remove.
    return (
      <div className="st-group">
        {head}
        <span data-testid={id} data-unset={value === undefined ? 'true' : 'false'} data-value={String(value ?? '')} className="flex items-center gap-2">
          <input
            type="color"
            data-testid={`swatch-${tab}-${f.key}`}
            value={String(value ?? '#FFFFFF')}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-7 w-11 cursor-pointer rounded-md border-2 border-foreground bg-transparent p-0"
          />
          <span className={`text-[12px] ${value === undefined ? 'text-muted-foreground' : 'st-num'}`}>{value === undefined ? 'theo giao diện' : String(value)}</span>
          {value !== undefined && (
            <button type="button" title="Bỏ, dùng màu của giao diện" data-testid={`clear-${tab}-${f.key}`} onClick={() => onChange(undefined)} className="text-[12px] text-muted-foreground hover:text-primary">
              ↺
            </button>
          )}
        </span>
        {help}
      </div>
    );
  }

  if (f.type === 'list') {
    return (
      <label className="st-group">
        {head}
        <input
          type="text"
          data-testid={id}
          value={(Array.isArray(value) ? (value as string[]) : []).join(' ')}
          onChange={(e) => onChange(e.target.value.split(/\s+/).filter(Boolean))}
          className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[13px]"
        />
        {help}
      </label>
    );
  }

  if (f.type === 'number') {
    const n = value === undefined || value === '' ? undefined : Number(value);
    const min = f.min ?? 0;
    const max = f.max ?? Math.max(100, (n ?? 0) * 2);
    return (
      <div className="st-group">
        {head}
        <div className="flex items-center gap-2">
          <input
            type="range"
            aria-label={f.label}
            data-testid={`slider-${tab}-${f.key}`}
            min={min}
            max={max}
            value={n ?? min}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-[hsl(var(--primary))]"
          />
          <input
            type="number"
            data-testid={id}
            min={f.min}
            max={f.max}
            value={n ?? ''}
            placeholder="—"
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="st-num w-20 rounded-lg border-2 border-foreground bg-background px-2 py-1 text-right text-[13px]"
          />
        </div>
        {help}
      </div>
    );
  }

  return (
    <label className="st-group">
      {head}
      <input type="text" data-testid={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[13px]" />
      {help}
    </label>
  );
}
