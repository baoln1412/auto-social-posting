'use client';

/**
 * Connect a chat with a one-time code. Never "paste your chat id": a chat id is neither
 * discoverable nor memorable, and pasting the wrong one sends the owner's reels to a stranger.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TelegramSettings({
  blocked,
  chatId,
  enabled,
}: {
  blocked: string | null;
  chatId: string | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [bot, setBot] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const res = await fetch('/api/studio/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const b = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setErr(b.error ?? `HTTP ${res.status}`);
        return null;
      }
      return b;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="telegram-settings"
      className="pen-line-static flex flex-col gap-3 rounded-[var(--radius)] bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Thông báo Telegram</h2>
        <span
          data-testid="tg-state"
          className="pen-line-sm rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
        >
          {blocked ? 'chưa có token' : chatId ? (enabled ? 'đang bật' : 'đã nối, đang tắt') : 'chưa nối'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Video dựng xong và bước nào lỗi sẽ gửi vào chat bạn chọn. Mặc định tắt.
      </p>

      {blocked ? (
        <p data-testid="tg-blocked" className="font-mono text-[11px] text-[hsl(var(--warning))]">
          {blocked}
        </p>
      ) : chatId ? (
        <>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">chat {chatId}</span>
            <label className="ml-auto flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                data-testid="tg-switch"
                checked={enabled}
                disabled={busy}
                onChange={async (e) => {
                  await call('switch', { on: e.target.checked });
                  router.refresh();
                }}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Bật gửi
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="tg-test"
              disabled={busy}
              onClick={async () => {
                if (await call('test')) setNote('Đã gửi thử.');
              }}
              className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Gửi thử
            </button>
            <button
              type="button"
              data-testid="tg-forget"
              disabled={busy}
              onClick={async () => {
                await call('forget');
                router.refresh();
              }}
              className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Ngắt kết nối
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            data-testid="tg-connect"
            disabled={busy}
            onClick={async () => {
              const b = await call('code');
              if (b) {
                setCode(b.code);
                setBot(b.bot);
              }
            }}
            className="pen-line-sm self-start rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            Kết nối
          </button>

          {code && (
            <div className="flex flex-col gap-2">
              <p className="text-xs">
                Mở{' '}
                <span className="font-mono">
                  {bot ? `@${bot}` : 'bot của bạn'}
                </span>{' '}
                trên Telegram và gửi mã này:
              </p>
              <code
                data-testid="tg-code"
                className="pen-line-static self-start rounded-md bg-background px-3 py-1.5 font-mono text-lg tracking-widest"
              >
                {code}
              </code>
              <button
                type="button"
                data-testid="tg-linked"
                disabled={busy}
                onClick={async () => {
                  if (await call('link')) router.refresh();
                }}
                className="pen-line-sm self-start rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Tôi đã gửi
              </button>
            </div>
          )}
        </>
      )}

      {note && <p className="text-xs text-[hsl(var(--success))]">{note}</p>}
      {err && (
        <p data-testid="tg-error" className="text-xs text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}
    </section>
  );
}
