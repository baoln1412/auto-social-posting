import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-hl-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { resetStudioDbForTests } = await import('@/lib/studio/db');
const { chooseHighlight, matchInTitle, ruleHighlight } = await import('@/lib/studio/highlight');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetStudioDbForTests());

const TITLE = 'MỸ: Cụ bà 82 tuổi ở Pomona bị lừa mất 2.500 đô vì chiêu vé số trúng thưởng';

describe('matchInTitle', () => {
  it('takes a span the model quoted exactly', () => {
    expect(matchInTitle(TITLE, 'bị lừa mất 2.500 đô')).toBe('bị lừa mất 2.500 đô');
  });

  it('returns the title’s own casing, not the model’s', () => {
    expect(matchInTitle(TITLE, 'CỤ BÀ 82 TUỔI')).toBe('Cụ bà 82 tuổi');
  });

  it('forgives quotes and trailing punctuation around the answer', () => {
    expect(matchInTitle(TITLE, '  "bị lừa mất 2.500 đô".  ')).toBe('bị lừa mất 2.500 đô');
  });

  it('refuses a span that is not in the title, however plausible', () => {
    expect(matchInTitle(TITLE, 'bị lừa mất 2500 đô')).toBeNull();
    expect(matchInTitle(TITLE, 'cụ bà bị lừa')).toBeNull();
  });

  it('refuses the whole title, which highlights nothing', () => {
    expect(matchInTitle(TITLE, TITLE)).toBeNull();
  });

  it('refuses an empty or one-character answer', () => {
    expect(matchInTitle(TITLE, '')).toBeNull();
    expect(matchInTitle(TITLE, 'M')).toBeNull();
  });
});

describe('chooseHighlight', () => {
  it('asks the model once and remembers the answer', async () => {
    const ask = vi.fn(async () => 'bị lừa mất 2.500 đô');
    expect(await chooseHighlight(TITLE, ask)).toBe('bị lừa mất 2.500 đô');
    expect(await chooseHighlight(TITLE, ask)).toBe('bị lừa mất 2.500 đô');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('falls back to the rule when the model answers with something not in the title', async () => {
    const ask = vi.fn(async () => 'một câu hoàn toàn khác');
    expect(await chooseHighlight(TITLE, ask)).toBe(ruleHighlight(TITLE, 'after-colon'));
  });

  it('falls back to the rule when the model is unreachable', async () => {
    const ask = vi.fn(async () => {
      throw new Error('GEMINI_API_KEY chưa có');
    });
    expect(await chooseHighlight(TITLE, ask)).toBe(ruleHighlight(TITLE, 'after-colon'));
  });

  it('does not cache a fallback — the next run should get a real answer', async () => {
    const bad = vi.fn(async () => {
      throw new Error('down');
    });
    await chooseHighlight(TITLE, bad);
    const good = vi.fn(async () => 'chiêu vé số trúng thưởng');
    expect(await chooseHighlight(TITLE, good)).toBe('chiêu vé số trúng thưởng');
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe('ruleHighlight', () => {
  it('is what it always was, so a kit that never asked for AI renders identically', () => {
    expect(ruleHighlight(TITLE, 'after-colon')).toBe(
      'Cụ bà 82 tuổi ở Pomona bị lừa mất 2.500 đô vì chiêu vé số trúng thưởng',
    );
    expect(ruleHighlight('A, B, C', 'first-clause')).toBe('A');
    expect(ruleHighlight(TITLE, 'none')).toBeNull();
  });
});

describe('the kit contract', () => {
  it('lets a kit ask for the model, and renders what it chose', async () => {
    const { cardParams } = await import('@/lib/studio/kits/load');
    const kit = { id: 'k', name: 'K', card: { engine: 'studio', highlight: 'ai' } } as never;
    const q = cardParams(kit, { title: TITLE, highlight: 'bị lừa mất 2.500 đô' });
    expect(q.get('hl')).toBe('bị lừa mất 2.500 đô');
  });

  it('falls back to the colon rule when nothing was chosen', async () => {
    const { cardParams } = await import('@/lib/studio/kits/load');
    const kit = { id: 'k', name: 'K', card: { engine: 'studio', highlight: 'ai' } } as never;
    expect(cardParams(kit, { title: TITLE }).get('hl')).toBe(ruleHighlight(TITLE, 'after-colon'));
  });

  it('ignores a chosen span on a kit that did not ask for one', async () => {
    const { cardParams } = await import('@/lib/studio/kits/load');
    const kit = { id: 'k', name: 'K', card: { engine: 'studio', highlight: 'first-clause' } } as never;
    expect(cardParams(kit, { title: 'A, B', highlight: 'B' }).get('hl')).toBe('A');
  });

  it('is a value the schema accepts, or no kit could ever use it', async () => {
    const { validateKit } = await import('@/lib/studio/kits/schema');
    const base = { id: 'k', name: 'K', schemaVersion: 1, identity: { channelName: 'K' } };
    expect(validateKit({ ...base, card: { highlight: 'ai' } })).toBeNull();
    expect(validateKit({ ...base, card: { highlight: 'nonsense' } })).not.toBeNull();
  });
});
