import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-runs-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo, DEMO_CHANNEL_ID } = await import('@/lib/studio/demo/seed');
const { TEMPLATES, canContinue, shouldAutoContinue, effectiveKit } = await import(
  '@/lib/studio/steps/types'
);
const { createRun, getRun, advance } = await import('@/lib/studio/runs');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  resetStudioDbForTests();
  seedDemo();
});

const demoRun = (over: Record<string, unknown> = {}, mode = 'read-post') =>
  createRun({ channelId: DEMO_CHANNEL_ID, mode: mode as any, itemRef: 'demo:1', overrides: over });

// INSERT OR REPLACE re-inserts the row, so rowid moves exactly when a step re-ran. A
// timestamp cannot say that — two runs inside one millisecond stamp the same ISO string.
const stepRowid = (runId: string, name: string): number | undefined =>
  (studioDb()
    .prepare('SELECT rowid FROM studio_steps WHERE run_id=? AND name=?')
    .get(runId, name) as { rowid: number } | undefined)?.rowid;

describe('run templates', () => {
  it('read-post walks fetch → draft → image → reel', () => {
    expect(TEMPLATES['read-post']).toEqual(['fetch', 'draft', 'image', 'reel']);
  });

  it('text-to-reel has no fetch step — the owner supplied the text', () => {
    expect(TEMPLATES['text-to-reel']).not.toContain('fetch');
  });

  it('a new run starts on the first step of its mode', () => {
    const id = demoRun({}, 'text-to-reel');
    expect(getRun(id)!.run.current_step).toBe(TEMPLATES['text-to-reel'][0]);
  });
});

describe('canContinue()', () => {
  const ok = { status: 'ok' as const, gate: null };

  it('lets a gateless step through on success', () => {
    expect(canContinue(ok, false)).toBe(true);
  });

  it('blocks a failed step', () => {
    expect(canContinue({ status: 'error', gate: null }, false)).toBe(false);
  });

  it('blocks while a gate has findings', () => {
    expect(canContinue({ status: 'ok', gate: { checked: 3, findings: ['no source'] } }, true)).toBe(
      false,
    );
  });

  it('blocks a gate that never ran — checked=0 is not a pass', () => {
    expect(canContinue({ status: 'ok', gate: { checked: 0, findings: [] } }, true)).toBe(false);
    expect(canContinue({ status: 'ok', gate: null }, true)).toBe(false);
  });

  it('passes a gate that ran and found nothing', () => {
    expect(canContinue({ status: 'ok', gate: { checked: 3, findings: [] } }, true)).toBe(true);
  });
});

describe('shouldAutoContinue()', () => {
  const free = { usd: 0, note: '' };
  const paid = { usd: 0.02, note: 'gemini' };

  it('is off unless the channel asked for it', () => {
    expect(shouldAutoContinue({ auto_continue: 0 } as any, free)).toBe(false);
  });

  it('skips the button for a free step', () => {
    expect(shouldAutoContinue({ auto_continue: 1 } as any, free)).toBe(true);
  });

  it('always stops at a step that spends, even with auto_continue on', () => {
    expect(shouldAutoContinue({ auto_continue: 1 } as any, paid)).toBe(false);
  });
});

describe('advance()', () => {
  it('walks a demo run to done', async () => {
    const id = demoRun();
    for (let i = 0; i < TEMPLATES['read-post'].length; i++) await advance(id);
    const r = getRun(id)!;
    expect(r.run.status).toBe('done');
    expect(Object.keys(r.steps).sort()).toEqual(['draft', 'fetch', 'image', 'reel']);
  });

  it('writes a studio_steps row for every step it ran', async () => {
    const id = demoRun();
    await advance(id);
    await advance(id);
    const rows = studioDb().prepare('SELECT name, status FROM studio_steps WHERE run_id=?').all(id);
    expect(rows).toEqual([
      { name: 'fetch', status: 'ok' },
      { name: 'draft', status: 'ok' },
    ]);
  });

  it('writes a row on failure too, with the error', async () => {
    const id = demoRun({ demo: { boom: 'draft' } });
    await advance(id);
    await advance(id);
    const r = getRun(id)!;
    expect(r.run.status).toBe('error');
    expect(r.steps.draft!.status).toBe('error');
    expect(r.steps.draft!.error).toMatch(/boom/i);
    expect(r.run.current_step).toBe('draft');
  });

  it('resume re-runs only the failed step and keeps the finished one', async () => {
    const id = demoRun({ demo: { boom: 'draft' } });
    await advance(id);
    await advance(id);
    const fetchRow = stepRowid(id, 'fetch');

    studioDb()
      .prepare('UPDATE studio_runs SET overrides_json=? WHERE id=?')
      .run(JSON.stringify({}), id);
    await advance(id);

    const r = getRun(id)!;
    expect(r.steps.draft!.status).toBe('ok');
    expect(stepRowid(id, 'fetch')).toBe(fetchRow);
    expect(r.run.current_step).toBe('image');
  });

  it('a blocked gate stops the run where it is', async () => {
    const id = demoRun({ demo: { gateFail: true } });
    await advance(id);
    await advance(id);
    const r = getRun(id)!;
    expect(r.run.status).toBe('blocked');
    expect(r.steps.draft!.gate!.findings.length).toBeGreaterThan(0);
    expect(r.run.current_step).toBe('draft');
  });

  it('stores the scene selection on the run and reads it back', async () => {
    const id = demoRun();
    await advance(id);
    await advance(id, { selection: { commentIds: ['c2', 'c4'], hideUnselected: true } });
    expect(getRun(id)!.run.selection).toEqual({ commentIds: ['c2', 'c4'], hideUnselected: true });
  });

  it('re-runs an earlier step when asked, without losing the later rows', async () => {
    const id = demoRun();
    await advance(id);
    await advance(id);
    const first = stepRowid(id, 'fetch');
    await advance(id, { step: 'fetch' });
    expect(stepRowid(id, 'fetch')).not.toBe(first);
    expect(getRun(id)!.steps.draft).toBeTruthy();
    expect(getRun(id)!.run.current_step).toBe('draft');
  });
});

describe('overrides', () => {
  it('merge over the kit', () => {
    const kit = { id: 'k', name: 'K', frame: { ratio: '9:16', layout: 'card-top' } };
    const merged = effectiveKit(kit as any, { frame: { layout: 'continuous' } } as any);
    expect(merged.frame).toEqual({ ratio: '9:16', layout: 'continuous' });
  });

  it('never write back to the kit row', async () => {
    const before = studioDb().prepare('SELECT * FROM studio_kits WHERE id=?').get('demo');
    const id = demoRun({ frame: { layout: 'continuous' }, music: 'groove' });
    for (let i = 0; i < TEMPLATES['read-post'].length; i++) await advance(id);
    expect(studioDb().prepare('SELECT * FROM studio_kits WHERE id=?').get('demo')).toEqual(before);
  });
});

describe('the spend guard', () => {
  it('lets a free step through even when spending is forbidden', async () => {
    const id = demoRun();
    await advance(id, { allowSpend: false });
    expect(getRun(id)!.steps.fetch!.status).toBe('ok');
  });

  it('refuses a priced step for a tier that may not spend', async () => {
    const id = demoRun({ demo: { cost: 0.04 } });
    await advance(id, { allowSpend: false });
    const r = getRun(id)!;
    expect(r.run.status).toBe('error');
    expect(r.steps.fetch!.error).toMatch(/không được phép chi/);
    expect(r.run.current_step).toBe('fetch');
  });

  it('runs the same priced step once spending is allowed, and books the price', async () => {
    const id = demoRun({ demo: { cost: 0.04 } });
    await advance(id, { allowSpend: true });
    const r = getRun(id)!;
    expect(r.steps.fetch!.status).toBe('ok');
    expect(r.steps.fetch!.cost.usd).toBe(0.04);
  });
});
