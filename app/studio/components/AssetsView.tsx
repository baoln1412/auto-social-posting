'use client';

/**
 * Uploads only. Fetching Pinterest stickers or MyInstants sounds is a licensing problem this
 * project does not need, so there is no "browse" here on purpose.
 *
 * Five tabs as the reference draws them (tv-21). Ảnh nền and Video nền are one `bg` kind split
 * by extension — the engine does not care which it gets, but the person looking for their clip
 * does. `Hiệu ứng` is shown locked with its reason rather than left out: a tab that exists in
 * the reference and not here reads as missing, and "SFX là tệp trong Nhạc nền" is the answer.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Film, Image as ImageIcon, Lock, Music, Sparkles, Sticker, Upload } from 'lucide-react';
import type { MediaKind, MediaRow } from '@/lib/studio/assets';

type Tab = {
  id: string;
  label: string;
  Icon: typeof ImageIcon;
  kind?: MediaKind;
  accept?: string;
  /** Which of the kind's rows belong on this tab; all of them when absent. */
  only?: (m: MediaRow) => boolean;
  locked?: string;
  blank?: string;
};

const isVideo = (m: MediaRow) => /\.(mp4|mov|webm)$/i.test(m.name);

const TABS: Tab[] = [
  {
    id: 'bg',
    label: 'Ảnh nền',
    Icon: ImageIcon,
    kind: 'bg',
    accept: '.png,.jpg,.jpeg,.webp',
    only: (m) => !isVideo(m),
    blank: 'Ảnh nền dùng trong tab Khung hình của Bộ nhận diện.',
  },
  {
    id: 'bgvideo',
    label: 'Video nền',
    Icon: Film,
    kind: 'bg',
    accept: '.mp4,.mov,.webm',
    only: isVideo,
    blank: 'Video nền chạy sau thẻ thay cho ảnh tĩnh.',
  },
  { id: 'sticker', label: 'Sticker', Icon: Sticker, kind: 'sticker', accept: '.png,.webp', blank: 'Nhãn dán đặt lên khung ở tab Nhãn dán.' },
  { id: 'fx', label: 'Hiệu ứng', Icon: Sparkles, locked: 'SFX là tệp trong Nhạc nền — tải lên ở đó rồi chọn trong tab Giọng đọc.' },
  { id: 'music', label: 'Nhạc nền', Icon: Music, kind: 'music', accept: '.mp3,.m4a,.wav', blank: 'Nhạc nền và tiếng động đều là tệp âm thanh ở đây.' },
];

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetsView({
  media,
  quota,
}: {
  media: MediaRow[];
  quota: { bytes: number; files: number; pct: number; full: boolean };
}) {
  const router = useRouter();
  const [tabId, setTabId] = useState(TABS[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tab = TABS.find((t) => t.id === tabId)!;

  async function upload(kind: MediaKind, file: File) {
    setBusy(true);
    setErr(null);
    const body = new FormData();
    body.append('kind', kind);
    body.append('file', file);
    try {
      const res = await fetch('/api/studio/media', { method: 'POST', body });
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(b.error ?? `HTTP ${res.status}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/studio/media/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  const countOf = (t: Tab) =>
    t.kind ? media.filter((m) => m.kind === t.kind && (t.only ? t.only(m) : true)).length : 0;
  const rows = tab.kind ? media.filter((m) => m.kind === tab.kind && (tab.only ? tab.only(m) : true)) : [];

  return (
    <div className="st-card flex flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[17px] font-bold" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
          Tệp của bạn
        </h2>
        <span data-testid="quota-label" className="ml-auto text-xs text-muted-foreground">
          <span className="st-num">{mb(quota.bytes)}</span> / <span className="st-num">50 MB</span> ·{' '}
          <span className="st-num">{quota.files}</span> / <span className="st-num">30</span> tệp
        </span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Tệp ở đây chỉ thuộc về bản cài này và dùng lại được cho mọi video. Không lấy từ nơi khác — chỉ tải lên.
      </p>

      <div className={`st-meter ${quota.full ? 'st-full' : ''}`}>
        <i data-testid="quota-bar" style={{ width: `${Math.max(2, quota.pct)}%` }} />
      </div>

      <div data-testid="asset-tabs" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`asset-tab-${t.id}`}
            onClick={() => setTabId(t.id)}
            className={`st-chip ${t.id === tabId ? 'st-on' : 'st-soft'}`}
          >
            {t.locked ? <Lock strokeWidth={2.25} /> : <t.Icon strokeWidth={2.25} />}
            {t.label}
            {t.kind && countOf(t) > 0 && <span className="st-num">{countOf(t)}</span>}
          </button>
        ))}
      </div>

      {tab.locked ? (
        <div data-testid="asset-locked" className="st-blank">
          <Lock strokeWidth={2.25} />
          <b>Không có mục riêng cho hiệu ứng</b>
          <span>{tab.locked}</span>
          <button type="button" onClick={() => setTabId('music')} className="st-btn st-sm">
            Mở Nhạc nền
          </button>
        </div>
      ) : (
        <>
          {err && (
            <p data-testid="asset-error" className="text-sm text-[hsl(var(--destructive))]">
              {err}
            </p>
          )}

          {rows.length === 0 ? (
            <div data-testid="asset-empty" className="st-blank">
              <tab.Icon strokeWidth={2.25} />
              <b>Chưa có {tab.label.toLowerCase()} nào</b>
              <span>{tab.blank}</span>
              <UploadButton tab={tab} busy={busy} full={quota.full} onFile={upload} primary />
            </div>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-4">
                {rows.map((m) => (
                  <li key={m.id} data-testid={`media-${tab.kind}`} className="st-card flex flex-col gap-2 p-2">
                    {tab.kind === 'music' ? (
                      <audio src={m.url} controls className="w-full" />
                    ) : isVideo(m) ? (
                      <video src={m.url} muted className="w-full rounded-md" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.name} title={m.name} className="w-full rounded-md" />
                    )}
                    <span className="truncate text-[11px]" title={m.name}>
                      {m.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="st-num text-[10px] text-muted-foreground">{mb(m.bytes)}</span>
                      <button
                        type="button"
                        data-testid={`delete-${m.id}`}
                        onClick={() => remove(m.id)}
                        className="st-btn st-sm st-ghost ml-auto px-2 py-0.5 text-[10px]"
                      >
                        Xoá
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <UploadButton tab={tab} busy={busy} full={quota.full} onFile={upload} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function UploadButton({
  tab,
  busy,
  full,
  onFile,
  primary = false,
}: {
  tab: Tab;
  busy: boolean;
  full: boolean;
  onFile: (kind: MediaKind, f: File) => void;
  primary?: boolean;
}) {
  return (
    <label className={`st-btn st-sm ${primary ? 'st-primary' : 'self-start'} cursor-pointer`}>
      <Upload strokeWidth={2.25} />
      {busy ? 'Đang tải lên…' : full ? 'Hết dung lượng' : `Tải ${tab.label.toLowerCase()} lên`}
      <input
        type="file"
        hidden
        data-testid={`upload-${tab.id}`}
        accept={tab.accept}
        disabled={busy || full}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && tab.kind) onFile(tab.kind, f);
          e.target.value = '';
        }}
      />
    </label>
  );
}
