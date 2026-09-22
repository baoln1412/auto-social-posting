'use client';

/**
 * Uploads only. Fetching Pinterest stickers or MyInstants sounds is a licensing problem this
 * project does not need, so there is no "browse" here on purpose.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MediaKind, MediaRow } from '@/lib/studio/assets';

const KINDS: { id: MediaKind; label: string; accept: string }[] = [
  { id: 'bg', label: 'Ảnh/video nền', accept: '.png,.jpg,.jpeg,.webp,.mp4' },
  { id: 'sticker', label: 'Nhãn dán', accept: '.png,.webp' },
  { id: 'music', label: 'Nhạc nền', accept: '.mp3,.m4a,.wav' },
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="pen-line-static rounded-[var(--radius)] bg-card p-4">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider">
          <span>Dung lượng</span>
          <span data-testid="quota-label">
            {mb(quota.bytes)} / 50 MB · {quota.files} / 30 tệp
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            data-testid="quota-bar"
            style={{ width: `${Math.max(2, quota.pct)}%` }}
            className={`h-full ${quota.full ? 'bg-[hsl(var(--destructive))]' : 'bg-primary'}`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <label
            key={k.id}
            className="pen-line-sm cursor-pointer rounded-md bg-card px-3 py-1.5 text-xs font-semibold"
          >
            + {k.label}
            <input
              type="file"
              hidden
              data-testid={`upload-${k.id}`}
              accept={k.accept}
              disabled={busy || quota.full}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(k.id, f);
                e.target.value = '';
              }}
            />
          </label>
        ))}
        {busy && <span className="text-xs text-muted-foreground">Đang tải lên…</span>}
      </div>

      {err && (
        <p data-testid="asset-error" className="text-sm text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}

      {KINDS.map((k) => {
        const rows = media.filter((m) => m.kind === k.id);
        return (
          <section key={k.id}>
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {k.label} · {rows.length}
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">Chưa có tệp nào.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-4">
                {rows.map((m) => (
                  <li key={m.id} data-testid={`media-${k.id}`} className="card-warm flex flex-col gap-2 p-2">
                    {k.id === 'music' ? (
                      <audio src={m.url} controls className="w-full" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.name} title={m.name} className="w-full rounded-md" />
                    )}
                    <span className="truncate text-[11px]" title={m.name}>
                      {m.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{mb(m.bytes)}</span>
                      <button
                        type="button"
                        data-testid={`delete-${m.id}`}
                        onClick={() => remove(m.id)}
                        className="ml-auto pen-line-sm rounded-md bg-card px-2 py-0.5 text-[10px] font-semibold"
                      >
                        Xoá
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
