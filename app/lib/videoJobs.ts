/**
 * In-memory render job tracker for deploy/make-reel.py. One long-running Next
 * server process (launchd-managed, see CLAUDE.md) — a module-level Map is enough,
 * no DB table needed for ephemeral render jobs.
 * ponytail: jobs are lost on server restart; acceptable, they're re-triggerable.
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { writeFileSync, unlink, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'data', 'reels');
const SCRIPT = join(ROOT, 'deploy', 'make-reel.py');
// launchd's PATH for com.immigration.web doesn't include /opt/homebrew/bin, so
// a bare 'python3' resolves to the system interpreter (no PIL/edge-tts/faster-whisper).
const PYTHON = '/opt/homebrew/bin/python3';

export interface VideoJob {
  id: string;
  status: 'running' | 'done' | 'error';
  file?: string;
  error?: string;
}

const jobs = new Map<string, VideoJob>();

export function getJob(id: string): VideoJob | undefined {
  return jobs.get(id);
}

export function outputPath(file: string): string {
  return join(OUT_DIR, file);
}

export function startRenderJob(payload: {
  emojiTitle: string;
  narration: string;
  media?: { url: string; kind: 'image' | 'video' }[];
}): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const id = randomUUID();
  const inFile = join(OUT_DIR, `${id}.json`);
  const outFile = join(OUT_DIR, `${id}.mp4`);
  writeFileSync(
    inFile,
    JSON.stringify({
      emojiTitle: payload.emojiTitle,
      narration: payload.narration,
      media: payload.media ?? [],
    }),
  );
  jobs.set(id, { id, status: 'running' });

  // make-reel.py shells out to ffmpeg by bare name — needs /opt/homebrew/bin on PATH too.
  const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` };
  const child = spawn(PYTHON, [SCRIPT, '--json', inFile, outFile], { cwd: ROOT, env });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('close', (code) => {
    unlink(inFile, () => {});
    if (code === 0 && existsSync(outFile)) {
      jobs.set(id, { id, status: 'done', file: `${id}.mp4` });
    } else {
      jobs.set(id, { id, status: 'error', error: stderr.trim().slice(-500) || `exit ${code}` });
    }
  });
  child.on('error', (err) => {
    jobs.set(id, { id, status: 'error', error: String(err) });
  });

  return id;
}
