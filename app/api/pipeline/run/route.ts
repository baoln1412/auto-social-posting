/**
 * /api/pipeline/run — trigger / poll a FULL pipeline cycle on demand.
 *
 * POST  → spawn deploy/run-pipeline.sh (crawl → silver → gold via Claude Code),
 *         detached, so a config change can be tested without waiting for the 4h
 *         schedule. Returns immediately. Refuses if a run is already in progress.
 * GET   → { running, since } — read from the lockfile the script maintains.
 *
 * Concurrency is guarded by data/pipeline.lock (created by run-pipeline.sh at
 * start, removed on exit). A lock older than STALE_MS is treated as a crashed
 * run and ignored / cleared.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync, statSync, rmSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'deploy', 'run-pipeline.sh');
const LOCK = path.join(ROOT, 'data', 'pipeline.lock');
const STALE_MS = 30 * 60 * 1000; // a run older than 30 min is presumed dead

function lockState(): { running: boolean; since: string | null; stale: boolean } {
  if (!existsSync(LOCK)) return { running: false, since: null, stale: false };
  const mtime = statSync(LOCK).mtimeMs;
  const age = Date.now() - mtime;
  return { running: age < STALE_MS, since: new Date(mtime).toISOString(), stale: age >= STALE_MS };
}

export async function GET(): Promise<NextResponse> {
  const { running, since } = lockState();
  return NextResponse.json({ running, since });
}

export async function POST(): Promise<NextResponse> {
  try {
    const state = lockState();
    if (state.running) {
      return NextResponse.json({ ok: false, running: true, since: state.since, error: 'A pipeline run is already in progress.' }, { status: 409 });
    }
    // Clear a stale lock left by a crashed run so we can start fresh.
    if (state.stale && existsSync(LOCK)) {
      try { rmSync(LOCK); } catch { /* ignore */ }
    }

    const child = spawn('/bin/zsh', [SCRIPT], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return NextResponse.json({ ok: true, started: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pipeline/run]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
