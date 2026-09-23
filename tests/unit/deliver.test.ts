import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tg-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

/** A stand-in for api.telegram.org, so the whole path is exercised without a bot token. */
interface Call {
  method: string;
  body: string;
}
const calls: Call[] = [];
let server: http.Server;
let reply: (method: string) => unknown = () => ({ ok: true, result: {} });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const method = (req.url ?? '').split('/').pop()!.split('?')[0];
      calls.push({ method, body });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply(method)));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo, DEMO_CHANNEL_ID } = await import('@/lib/studio/demo/seed');
const { createRun, advance, getRun } = await import('@/lib/studio/runs');
const { getSetting, setSetting } = await import('@/lib/studio/settings');
const D = await import('@/lib/studio/deliver');
const { can } = await import('@/lib/studio/tier');

/** Run every step of a demo run. The rail's length is the rail's business, not a number. */
async function walk(id: string): Promise<void> {
  const { ALL_STEPS } = await import('@/lib/studio/steps/types');
  for (let i = 0; i < ALL_STEPS.length; i++) await advance(id);
}

beforeEach(() => {
  resetStudioDbForTests();
  seedDemo();
  calls.length = 0;
  reply = () => ({ ok: true, result: {} });
});

describe('the deliver permission', () => {
  it('belongs to the owner alone — a demo visitor cannot make the bot send anything', () => {
    expect(can('owner', 'deliver')).toBe(true);
    expect(can('member', 'deliver')).toBe(false);
    expect(can('demo', 'deliver')).toBe(false);
  });
});

describe('settings', () => {
  it('reads back what it stored, and a default when nothing is stored', () => {
    expect(getSetting('telegram.chat_id', null)).toBeNull();
    setSetting('telegram.chat_id', '4242');
    expect(getSetting('telegram.chat_id', null)).toBe('4242');
  });

  it('is off until the owner turns it on', () => {
    expect(D.deliveryOn()).toBe(false);
    setSetting('telegram.enabled', '1');
    setSetting('telegram.chat_id', '4242');
    expect(D.deliveryOn()).toBe(true);
  });

  it('stays off with a chat but no switch, and with a switch but no chat', () => {
    setSetting('telegram.chat_id', '4242');
    expect(D.deliveryOn()).toBe(false);
    resetStudioDbForTests();
    setSetting('telegram.enabled', '1');
    expect(D.deliveryOn()).toBe(false);
  });
});

describe('connecting a chat by one-time code', () => {
  it('issues a code and remembers it', async () => {
    reply = () => ({ ok: true, result: { username: 'desoul_bot' } });
    const { code, bot } = await D.startLink();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(bot).toBe('desoul_bot');
    expect(getSetting('telegram.code', null)).toBe(code);
  });

  it('links the chat whose message carried that code', async () => {
    reply = () => ({ ok: true, result: { username: 'b' } });
    const { code } = await D.startLink();

    reply = (m) =>
      m === 'getUpdates'
        ? { ok: true, result: [{ message: { chat: { id: 9911 }, text: `/start ${code}` } }] }
        : { ok: true, result: {} };

    expect(await D.finishLink()).toEqual({ chatId: '9911' });
    expect(getSetting('telegram.chat_id', null)).toBe('9911');
    // The code is spent, so a replayed message cannot re-link the bot later.
    expect(getSetting('telegram.code', null)).toBeNull();
  });

  it('refuses a chat that sent some other text', async () => {
    reply = () => ({ ok: true, result: { username: 'b' } });
    await D.startLink();
    reply = (m) =>
      m === 'getUpdates'
        ? { ok: true, result: [{ message: { chat: { id: 1 }, text: 'xin chào' } }] }
        : { ok: true, result: {} };
    await expect(D.finishLink()).rejects.toThrow();
    expect(getSetting('telegram.chat_id', null)).toBeNull();
  });
});

describe('delivery from a run', () => {
  async function connected() {
    setSetting('telegram.chat_id', '4242');
    setSetting('telegram.enabled', '1');
  }

  it('sends nothing at all while delivery is off', async () => {
    const id = createRun({ channelId: DEMO_CHANNEL_ID, itemRef: 'demo:1' });
    await walk(id);
    expect(getRun(id)!.run.status).toBe('done');
    expect(calls).toHaveLength(0);
  });

  it('sends the finished video once the owner switches it on', async () => {
    await connected();
    const id = createRun({ channelId: DEMO_CHANNEL_ID, itemRef: 'demo:1' });
    await walk(id);
    const sent = calls.filter((c) => c.method === 'sendVideo' || c.method === 'sendDocument');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain('4242');
  });

  it('sends a failed step as a message naming the step', async () => {
    await connected();
    const id = createRun({
      channelId: DEMO_CHANNEL_ID,
      itemRef: 'demo:1',
      overrides: { demo: { boom: 'draft' } },
    });
    await advance(id);
    await advance(id);
    const msgs = calls.filter((c) => c.method === 'sendMessage');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain('draft');
    expect(msgs[0].body).toContain('4242');
  });

  it('never lets a delivery failure break the run it was reporting on', async () => {
    await connected();
    reply = () => ({ ok: false, description: 'chat not found' });
    const id = createRun({ channelId: DEMO_CHANNEL_ID, itemRef: 'demo:1' });
    await walk(id);
    expect(getRun(id)!.run.status).toBe('done');
  });

  it('does not send the same finished run twice when a later step is re-run', async () => {
    await connected();
    const id = createRun({ channelId: DEMO_CHANNEL_ID, itemRef: 'demo:1' });
    await walk(id);
    calls.length = 0;
    await advance(id, { step: 'image' });
    expect(calls.filter((c) => c.method === 'sendVideo')).toHaveLength(0);
  });
});

describe('when there is no bot token', () => {
  it('says so instead of hiding the feature', async () => {
    const t = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(D.telegramBlocked()).toMatch(/token/i);
    await expect(D.startLink()).rejects.toThrow(/token/i);
    process.env.TELEGRAM_BOT_TOKEN = t;
    expect(D.telegramBlocked()).toBeNull();
  });
});
