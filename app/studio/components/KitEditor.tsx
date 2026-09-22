'use client';

/**
 * Preview canvas in the middle, tab strip along the bottom, presets and fields on the right.
 *
 * The canvas is the real /api/image/card with this kit's parameters — Satori composition is
 * local and free, so a preview of a card can simply be a card.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardParams } from '@/lib/studio/kits/load';
import type { Kit } from '@/lib/studio/steps/types';

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'enum';
  options?: string[];
  min?: number;
  max?: number;
}
export interface TabSpec {
  key: string;
  label: string;
  fields: FieldSpec[];
  presets: { id: string; values: Record<string, unknown> }[];
  /** The owner's own uploads for this tab, from Kho tài nguyên. */
  media?: { id: string; name: string; url: string; field: string }[];
}

const SAMPLE = {
  title: 'MỸ: CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG',
};

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

export function KitEditor({ kit: initial, tabs }: { kit: Kit; tabs: TabSpec[] }) {
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

  const tab = tabs.find((t) => t.key === active)!;
  const values = (kit[active] ?? {}) as Record<string, unknown>;
  const src = useMemo(() => `/api/image/card?${cardParams(kit, SAMPLE)}`, [kit]);

  const patch = (next: Record<string, unknown>) => {
    setKit((k) => ({ ...k, [active]: { ...((k[active] ?? {}) as object), ...next } }));
    setSaved(false);
  };

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

  return (
    <div className="flex flex-col gap-4">
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

            {tab.presets.length > 0 && (
              <div data-testid="preset-gallery" className="flex flex-wrap gap-1.5">
                {tab.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`preset-${tab.key}-${p.id}`}
                    onClick={() => patch(p.values)}
                    className={`pen-line-sm rounded-md px-2 py-1 text-xs font-semibold ${
                      values.preset === p.id ? 'bg-primary text-primary-foreground' : 'bg-card'
                    }`}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            )}

            {tab.media && tab.media.length > 0 && (
              <div data-testid="kit-media" className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
              <label key={f.key} className="flex items-center justify-between gap-3">
                <span className="text-xs">{f.label}</span>
                {f.type === 'enum' ? (
                  <select
                    data-testid={`field-${tab.key}-${f.key}`}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => patch({ [f.key]: e.target.value })}
                    className="pen-line-static rounded-md bg-background px-2 py-1 text-xs"
                  >
                    <option value="">(mặc định)</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    data-testid={`field-${tab.key}-${f.key}`}
                    checked={Boolean(values[f.key])}
                    onChange={(e) => patch({ [f.key]: e.target.checked })}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
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
                    className="pen-line-static w-32 rounded-md bg-background px-2 py-1 text-xs"
                  />
                )}
              </label>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                data-testid="kit-save"
                disabled={saving}
                onClick={save}
                className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
              {saved && (
                <span data-testid="kit-saved" className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--success))]">
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
              <span className="font-mono text-[10px] text-muted-foreground">
                {summarise(t, (kit[t.key] ?? {}) as Record<string, unknown>)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
