/**
 * Telegram delivery — opt-in, owner-only, off until switched on.
 *
 * Nothing here is allowed to break a run. A notification that fails is a notification that
 * failed; the three-minute render it was reporting on is still finished and still on disk.
 */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { getSetting, setSetting } from './settings';

const BASE = () => process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org';
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';

/** Why Telegram cannot be used right now, or null. Listed either way — never hidden. */
export function telegramBlocked(): string | null {
  return TOKEN() ? null : 'Chưa có TELEGRAM_BOT_TOKEN trong môi trường.';
}

export function deliveryOn(): boolean {
  return getSetting('telegram.enabled', '0') === '1' && Boolean(getSetting('telegram.chat_id', null));
}

export function chatId(): string | null {
  return getSetting('telegram.chat_id', null);
}

async function api<T = any>(method: string, body?: FormData | object): Promise<T> {
  const blocked = telegramBlocked();
  if (blocked) throw new Error(blocked);
  const init: RequestInit = { method: 'POST', signal: AbortSignal.timeout(60_000) };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await fetch(`${BASE()}/bot${TOKEN()}/${method}`, init);
  const json = (await res.json().catch(() => ({ ok: false, description: 'phản hồi không phải JSON' }))) as any;
  if (!json.ok) throw new Error(json.description ?? `Telegram trả về ${res.status}.`);
  return json.result as T;
}

/**
 * Start linking a chat: issue a one-time code the owner sends to the bot.
 *
 * A code rather than asking the owner for a chat id — a chat id is neither discoverable nor
 * memorable, and pasting the wrong one sends their reels to a stranger.
 */
export async function startLink(): Promise<{ code: string; bot: string | null }> {
  const me = await api<{ username?: string }>('getMe');
  const code = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  setSetting('telegram.code', code);
  return { code, bot: me?.username ?? null };
}

/** Find the chat that sent the code, and remember it. */
export async function finishLink(): Promise<{ chatId: string }> {
  const code = getSetting('telegram.code', null);
  if (!code) throw new Error('Chưa tạo mã kết nối.');

  const updates = await api<any[]>('getUpdates', { limit: 50, timeout: 0 });
  const hit = (updates ?? []).find((u) =>
    String(u?.message?.text ?? '')
      .toUpperCase()
      .includes(code),
  );
  if (!hit) throw new Error(`Chưa thấy tin nhắn nào chứa mã ${code}. Gửi mã cho bot rồi thử lại.`);

  const id = String(hit.message.chat.id);
  setSetting('telegram.chat_id', id);
  // Spent, so a replayed update cannot re-link the bot to someone else later.
  setSetting('telegram.code', null);
  return { chatId: id };
}

export function unlink(): void {
  setSetting('telegram.chat_id', null);
  setSetting('telegram.code', null);
  setSetting('telegram.enabled', '0');
}

export async function sendMessage(text: string): Promise<void> {
  const chat = chatId();
  if (!chat) throw new Error('Chưa kết nối chat nào.');
  await api('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
}

export async function sendVideo(path: string, caption: string): Promise<void> {
  const chat = chatId();
  if (!chat) throw new Error('Chưa kết nối chat nào.');
  const form = new FormData();
  form.append('chat_id', chat);
  form.append('caption', caption.slice(0, 1024));
  form.append('video', new Blob([fs.readFileSync(path)], { type: 'video/mp4' }), 'reel.mp4');
  await api('sendVideo', form);
}

/** Swallows everything. A delivery is never a reason for a run to fail. */
async function quietly(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`[studio/deliver] ${what}:`, e instanceof Error ? e.message : e);
  }
}

export async function deliverFailure(step: string, error: string, runId: string): Promise<void> {
  if (!deliveryOn()) return;
  await quietly('sendMessage', () =>
    sendMessage(`❌ Bước "${step}" lỗi.\n\n${error.slice(0, 600)}\n\nLượt chạy: ${runId}`),
  );
}

export async function deliverReel(path: string, title: string, runId: string): Promise<void> {
  if (!deliveryOn()) return;
  await quietly('sendVideo', () => sendVideo(path, `✅ ${title}\n\n${runId}`));
}
