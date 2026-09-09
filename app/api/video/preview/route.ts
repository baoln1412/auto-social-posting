import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
// launchd's PATH for com.immigration.web excludes /opt/homebrew/bin, so a bare
// 'python3' resolves to the system interpreter with no PIL. Same constraint
// documented in app/lib/videoJobs.ts — follow its spawn pattern.
const PYTHON = '/opt/homebrew/bin/python3';
const SCRIPT = join(ROOT, 'deploy', 'make-reel.py');
// make-reel.py's own plate fetch has a 20s urllib timeout; bound the child well
// under that so a stalled remote host can't park a request that long.
const TIMEOUT_MS = 15000;

export async function POST(req: NextRequest) {
  let dir: string | undefined;
  try {
    const body = await req.json();
    const text = body?.text;
    const style = body?.style;
    // brief's "Produces" line names this `plateUrl`; its own Step 1 sample code
    // reads `plate` instead. Accept either so a mismatched caller still works.
    const plate = body?.plateUrl ?? body?.plate ?? null;

    dir = mkdtempSync(join(tmpdir(), 'reel-prev-'));
    const cfg = join(dir, 'cfg.json');
    const png = join(dir, 'out.png');
    writeFileSync(cfg, JSON.stringify({ text: text ?? '', style: style ?? {}, plate }));

    const result = await new Promise<{ ok: true } | { ok: false; reason: string }>((resolve) => {
      const child = spawn(PYTHON, [SCRIPT, '--preview-frame', cfg, png], {
        cwd: ROOT,
        env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ ok: false, reason: 'preview timed out' });
      }, TIMEOUT_MS);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? { ok: true } : { ok: false, reason: `preview failed (exit ${code})` });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, reason: `preview failed: ${err}` });
      });
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }
    const buf = readFileSync(png);
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    // ponytail: whole dir, not just cfg/out.png — this fires on every debounced
    // style tweak, so leftover files would strand a dir per preview.
    if (dir) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}
