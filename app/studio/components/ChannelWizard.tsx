'use client';

/**
 * Five screens, one progress rail. Step 2 is a gate, not a form: a source that cannot answer
 * does not become a channel, because a broken channel only reveals itself at 4am when the
 * schedule runs it.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SourceOption {
  kind: string;
  label: string;
  hint: string;
  needs: 'market' | 'url' | 'text' | 'none';
  blocked: string | null;
}
export interface Market {
  id: string;
  name: string;
  country_code?: string;
}
export interface KitOpt {
  id: string;
  name: string;
}
interface TestItem {
  id: string;
  title: string;
  source: string | null;
  comments: number;
}

const STEPS = ['Nguồn', 'Thử lấy bài', 'Làm gì', 'Bộ nhận diện', 'Xong'];
const MAKES = [
  { id: 'post', label: 'Bài đăng' },
  { id: 'image', label: 'Ảnh thẻ' },
  { id: 'reel', label: 'Video dọc' },
];

export function ChannelWizard({
  sources,
  markets,
  kits,
}: {
  sources: SourceOption[];
  markets: Market[];
  kits: KitOpt[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<string>('gold');
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [items, setItems] = useState<TestItem[] | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [makes, setMakes] = useState<string[]>(['post', 'reel']);
  const [kitId, setKitId] = useState(kits[0]?.id ?? '');
  const [name, setName] = useState('');
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const def = sources.find((s) => s.kind === kind);

  // A different source invalidates the proof that the last one worked.
  useEffect(() => {
    setItems(null);
    setTestErr(null);
  }, [kind, marketId, url, text]);

  const config = () => ({
    marketId: def?.needs === 'market' ? marketId : undefined,
    url: def?.needs === 'url' ? url : undefined,
    text: def?.needs === 'text' ? text : undefined,
  });

  async function runTest() {
    setTesting(true);
    setTestErr(null);
    setItems(null);
    try {
      const res = await fetch('/api/studio/sources/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, config: config() }),
      });
      const b = (await res.json().catch(() => ({}))) as { items?: TestItem[]; error?: string };
      if (!res.ok || !b.items) setTestErr(b.error ?? `HTTP ${res.status}`);
      else setItems(b.items);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaveErr(null);
    const res = await fetch('/api/studio/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, kind, config: config(), kitId, makes }),
    });
    const b = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !b.id) {
      setSaveErr(b.error ?? `HTTP ${res.status}`);
      return;
    }
    router.push('/studio/channels');
    router.refresh();
  }

  const canGo =
    step === 0
      ? Boolean(def && !def.blocked)
      : step === 1
        ? Boolean(items?.length)
        : step === 2
          ? makes.length > 0
          : true;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <ol data-testid="wizard-rail" className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s}
            data-testid={`rail-${i}`}
            data-active={i === step}
            className={`pen-line-sm rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
              i === step
                ? 'bg-primary text-primary-foreground'
                : i < step
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'bg-card text-muted-foreground'
            }`}
          >
            {i + 1} · {s}
          </li>
        ))}
      </ol>

      <div className="pen-line-static min-h-[18rem] rounded-[var(--radius)] bg-card p-5">
        {step === 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Kênh này lấy bài từ đâu?</legend>
            {sources.map((s) => (
              <label
                key={s.kind}
                data-testid={`source-${s.kind}`}
                className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 ${
                  s.blocked ? 'opacity-55' : 'hover:bg-secondary'
                } ${kind === s.kind ? 'bg-sidebar-accent' : ''}`}
              >
                <input
                  type="radio"
                  name="kind"
                  className="mt-1 accent-[hsl(var(--primary))]"
                  checked={kind === s.kind}
                  disabled={Boolean(s.blocked)}
                  onChange={() => setKind(s.kind)}
                />
                <span>
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  {s.blocked && (
                    <span
                      data-testid={`blocked-${s.kind}`}
                      className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--warning))]"
                    >
                      {s.blocked}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold">Thử lấy bài thật</h2>
            {def?.needs === 'market' && (
              <select
                data-testid="cfg-market"
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="pen-line-static rounded-md bg-background px-3 py-2 text-sm"
              >
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {def?.needs === 'url' && (
              <input
                data-testid="cfg-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="pen-line-static rounded-md bg-background px-3 py-2 text-sm"
              />
            )}
            {def?.needs === 'text' && (
              <textarea
                data-testid="cfg-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Dán nội dung…"
                className="pen-line-static resize-none rounded-md bg-background p-3 text-sm"
              />
            )}

            <button
              type="button"
              data-testid="run-test"
              onClick={runTest}
              disabled={testing}
              className="pen-line-sm self-start rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {testing ? 'Đang thử…' : 'Thử lấy'}
            </button>

            {testErr && (
              <p data-testid="test-error" className="text-sm text-[hsl(var(--destructive))]">
                {testErr}
              </p>
            )}
            {items && (
              <ul data-testid="test-items" className="flex flex-col gap-1">
                {items.map((i) => (
                  <li key={i.id} data-testid="test-item" className="rounded-md bg-secondary px-2 py-1.5 text-sm">
                    <span className="font-medium">{i.title}</span>
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {i.source ?? '—'} · {i.comments} bình luận
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 2 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Kênh này làm ra gì?</legend>
            {MAKES.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-secondary">
                <input
                  type="checkbox"
                  data-testid={`make-${m.id}`}
                  className="accent-[hsl(var(--primary))]"
                  checked={makes.includes(m.id)}
                  onChange={(e) =>
                    setMakes((v) => (e.target.checked ? [...v, m.id] : v.filter((x) => x !== m.id)))
                  }
                />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Dùng bộ nhận diện nào?</legend>
            {kits.map((k) => (
              <label key={k.id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-secondary">
                <input
                  type="radio"
                  name="kit"
                  data-testid={`kit-${k.id}`}
                  className="accent-[hsl(var(--primary))]"
                  checked={kitId === k.id}
                  onChange={() => setKitId(k.id)}
                />
                <span className="text-sm">{k.name}</span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold">Đặt tên kênh</h2>
            <input
              data-testid="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Tin định cư Mỹ"
              className="pen-line-static rounded-md bg-background px-3 py-2 text-sm"
            />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt>Nguồn</dt>
              <dd className="text-foreground">{def?.label}</dd>
              <dt>Đã thử</dt>
              <dd className="text-foreground">{items?.length ?? 0} bài thật</dd>
              <dt>Làm ra</dt>
              <dd className="text-foreground">{makes.join(', ')}</dd>
              <dt>Bộ nhận diện</dt>
              <dd className="text-foreground">{kits.find((k) => k.id === kitId)?.name ?? '—'}</dd>
            </dl>
            {saveErr && <p className="text-sm text-[hsl(var(--destructive))]">{saveErr}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="wizard-back"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Quay lại
        </button>
        {step < 4 ? (
          <button
            type="button"
            data-testid="wizard-next"
            disabled={!canGo}
            onClick={() => setStep((s) => s + 1)}
            className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            Tiếp
          </button>
        ) : (
          <button
            type="button"
            data-testid="wizard-save"
            disabled={!name.trim()}
            onClick={save}
            className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            Tạo kênh
          </button>
        )}
        {step === 1 && !items && (
          <span className="text-xs text-muted-foreground">
            Phải lấy được bài thật thì mới đi tiếp.
          </span>
        )}
      </div>
    </div>
  );
}
