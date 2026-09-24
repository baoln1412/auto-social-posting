/**
 * /api/pipeline/run — trigger / poll a FULL pipeline cycle on demand.
 *
 * POST  → spawn deploy/run-pipeline.sh (crawl → silver → gold via Claude Code),
 *         detached, so a config change can be tested without waiting for the 4h
 *         schedule. Returns immediately. Refuses if a run is already in progress.
 * GET   → { running, since } — read from the lockfile the script maintains.
 *
 * Concurrency is guarded by two lockfiles — data/pipeline.wrapper.lock (run-pipeline.sh,
 * held for the whole script) and data/pipeline.lock (the agent, taken in its Step 0).
 * Either one fresh means a run is live. Older than STALE_MS is treated as a crashed run
 * and ignored / cleared.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync, statSync, rmSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'deploy', 'run-pipeline.sh');
// Two locks, either of which means a cycle is live. run-pipeline.sh holds the wrapper
// lock for the whole script; the agent it spawns takes pipeline.lock seconds later in
// its own Step 0. Watching only the agent's would read "idle" during that startup gap
// and let this route spawn a second wrapper on top of the first.
const LOCKS = [
  path.join(ROOT, 'data', 'pipeline.wrapper.lock'),
  path.join(ROOT, 'data', 'pipeline.lock'),
];
const STALE_MS = 30 * 60 * 1000; // a run older than 30 min is presumed dead

function lockState(): { running: boolean; since: string | null; stale: boolean } {
  const mtimes = LOCKS.filter(existsSync).map((p) => statSync(p).mtimeMs);
  if (!mtimes.length) return { running: false, since: null, stale: false };
  // Freshest wins: the agent's lock is re-taken after the wrapper's, and a live cycle
  // is only as dead as its most recent sign of life.
  const mtime = Math.max(...mtimes);
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
    if (state.stale) {
      for (const l of LOCKS) {
        try { if (existsSync(l)) rmSync(l); } catch { /* ignore */ }
      }
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
