'use client';

/**
 * `Kit mới`, `Nhân bản`, `Xoá` — the way in that the Bộ nhận diện page never had.
 *
 * Every new kit is a copy of one that already renders. A kit assembled from nothing has no
 * card preset, no frame and no voice, and the first thing it would do is fail the renderer;
 * the useful blank page is "the one I already like, under a new name".
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';

export interface KitChoice {
  id: string;
  name: string;
  shipped: boolean;
}

async function post(body: { name: string; from: string }): Promise<{ id?: string; error?: string }> {
  const r = await fetch('/api/studio/kits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => ({}))) as { kit?: { id: string }; error?: string };
  return { id: b.kit?.id, error: b.error };
}

export function NewKitButton({ kits }: { kits: KitChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [from, setFrom] = useState(kits[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setErr(null);
    const { id, error } = await post({ name, from });
    setBusy(false);
    if (error || !id) {
      setErr(error ?? 'Không tạo được.');
      return;
    }
    router.push(`/studio/kits/${id}`);
  }

  if (!open) {
    return (
      <button type="button" data-testid="kit-new" onClick={() => setOpen(true)} className="st-btn st-primary st-sm">
        <Plus strokeWidth={2.5} />
        Bộ mới
      </button>
    );
  }

  return (
    <div data-testid="kit-new-form" className="st-card flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        autoFocus
        data-testid="kit-new-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên bộ nhận diện"
        className="st-field w-[200px]"
      />
      <select data-testid="kit-new-from" value={from} onChange={(e) => setFrom(e.target.value)} className="st-field w-auto">
        {kits.map((k) => (
          <option key={k.id} value={k.id}>
            chép từ: {k.name}
          </option>
        ))}
      </select>
      <button type="button" data-testid="kit-new-go" disabled={busy || !from} onClick={make} className="st-btn st-sm st-primary">
        {busy ? 'Đang tạo…' : 'Tạo'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="st-btn st-sm st-ghost">
        Huỷ
      </button>
      {err && <span className="w-full text-xs text-[hsl(var(--destructive))]">{err}</span>}
    </div>
  );
}

export function KitRowActions({ kit }: { kit: KitChoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function duplicate() {
    setBusy(true);
    const { id, error } = await post({ name: `${kit.name} (bản chép)`, from: kit.id });
    setBusy(false);
    if (error || !id) setErr(error ?? 'Không chép được.');
    else router.push(`/studio/kits/${id}`);
  }

  async function remove() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/studio/kits/${kit.id}`, { method: 'DELETE' });
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) setErr(b.error ?? `HTTP ${r.status}`);
    else router.refresh();
  }

  return (
    <>
      <button
        type="button"
        data-testid={`kit-copy-${kit.id}`}
        disabled={busy}
        onClick={duplicate}
        title="Nhân bản"
        aria-label="Nhân bản"
        className="st-btn st-sm st-ghost"
      >
        <Copy strokeWidth={2.25} />
      </button>
      {!kit.shipped && (
        <button
          type="button"
          data-testid={`kit-delete-${kit.id}`}
          disabled={busy}
          onClick={remove}
          title="Xoá"
          aria-label="Xoá"
          className="st-btn st-sm st-ghost"
        >
          <Trash2 strokeWidth={2.25} />
        </button>
      )}
      {err && (
        <span data-testid={`kit-error-${kit.id}`} className="w-full text-xs text-[hsl(var(--destructive))]">
          {err}
        </span>
      )}
    </>
  );
}
