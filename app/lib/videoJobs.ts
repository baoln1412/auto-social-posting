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
import { setGoldVideo } from './lake';
import { localizeMediaUrl } from './localMedia';

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
  /** Stage currently running, e.g. 'captions'. Set from make-reel.py's ::step: markers. */
  step?: string;
  /** 0-100 within the current stage; only 'captions' reports one. */
  pct?: number;
  /** Stages already finished, in completion order. */
  done?: string[];
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
  includeIntro?: boolean;
  includeLayout?: boolean;
  style?: string;
  voice?: string;
  postId?: string;
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
      media: (payload.media ?? []).map((m) => ({ ...m, url: localizeMediaUrl(m.url) })),
    }),
  );
  jobs.set(id, { id, status: 'running' });

  // make-reel.py shells out to ffmpeg by bare name — needs /opt/homebrew/bin on PATH too.
  const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` };
  const args = [SCRIPT, '--json', inFile, outFile];
  if (payload.includeIntro === false) args.push('--no-intro');
  if (payload.includeLayout === false) args.push('--no-layout');
  if (payload.style) args.push('--style', payload.style);
  // Only ever the owner's cloned voice or nothing: the renderer's default is edge-tts, and an
  // arbitrary string here would reach make-reel.py as an edge-tts voice name, which fails deep
  // inside the TTS step rather than here.
  if (payload.voice === 'bao') args.push('--voice', 'bao');
  const child = spawn(PYTHON, args, { cwd: ROOT, env });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  // stdout carries the ::step: markers AND must be drained regardless - an unread pipe
  // stalls the child at 64KB, which would look exactly like a hung render.
  let buf = '';
  // Bounded tail of the non-marker stdout, kept for the error message — this is where
  // ffmpeg's reason for failing actually arrives.
  let tail = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const m = /^::step:([a-z]+):(.+)$/.exec(line.trim());
      if (!m) {
        tail = (tail + line + '\n').slice(-2000);
        continue;
      }
      const [, name, state] = m;
      const job = jobs.get(id);
      if (!job) continue;
      const done = job.done ?? [];
      if (state === 'done' || state === 'skipped') {
        jobs.set(id, { ...job, step: name, pct: undefined, done: done.includes(name) ? done : [...done, name] });
      } else {
        const pct = /^(\d+)%$/.exec(state)?.[1];
        jobs.set(id, { ...job, step: name, pct: pct ? Number(pct) : undefined, done });
      }
    }
  });

  child.on('close', (code) => {
    unlink(inFile, () => {});
    if (code === 0 && existsSync(outFile)) {
      const file = `${id}.mp4`;
      jobs.set(id, { id, status: 'done', file });
      // Best-effort — a post record can vanish (deleted) between the render
      // starting and finishing; the file itself is still there either way.
      if (payload.postId) setGoldVideo(payload.postId, file, payload.narration).catch(() => {});
    } else {
      const prev = jobs.get(id);
      // make-reel.py print()s its reasons — and ffmpeg's error tail — to STDOUT, so that
      // leads. stderr used to win outright, and it is often just interpreter noise on
      // shutdown: faster-whisper's leaked-semaphore warning replaced the real cause and
      // left "Lỗi ở bước: Ghép video" with nothing actionable under it.
      const why = [tail.trim().slice(-450), stderr.trim().slice(-200)]
        .filter(Boolean).join('\n— stderr —\n');
      jobs.set(id, { ...prev, id, status: 'error', error: why || `exit ${code}` });
    }
  });
  child.on('error', (err) => {
    jobs.set(id, { id, status: 'error', error: String(err) });
  });

  return id;
}
