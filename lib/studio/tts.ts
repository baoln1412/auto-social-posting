/**
 * One sentence through edge-tts, so a voice can be heard before a three-minute render.
 *
 * The same engine deploy/make-reel.py uses and the same `rate="+25%"` it hardcodes, called
 * through the module rather than the CLI (edge-tts is importable here, but its script is not
 * on launchd's PATH — the constraint app/lib/videoJobs.ts already documents). make-reel.py
 * is not touched: this is a second, smaller caller of the same library.
 *
 * Cached by (voice, rate, text): the owner auditions a voice by clicking the same button
 * repeatedly, and every click is a network round trip to Microsoft otherwise.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { hashOf } from './hash';

const run = promisify(execFile);

const PYTHON = '/opt/homebrew/bin/python3';
const CACHE_DIR = path.join(process.cwd(), 'data', 'studio-cache', 'tts');
/** make-reel.py's own default, so a sample sounds like the reel will. */
export const DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';
export const DEFAULT_RATE = '+25%';
/** One sentence. A sample long enough to need a progress bar is not a sample. */
export const MAX_CHARS = 300;

const SCRIPT = `
import asyncio, sys, edge_tts

async def main(text, voice, rate, out):
    comm = edge_tts.Communicate(text, voice, rate=rate)
    with open(out, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])

asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]))
`;

export interface Sample {
  text: string;
  voice?: string;
  rate?: string;
}

/** The mp3 for this sample, rendered once per (voice, rate, text). */
export async function ttsSample(s: Sample): Promise<Uint8Array> {
  const text = (s.text ?? '').trim().slice(0, MAX_CHARS);
  if (!text) throw new Error('Chưa có câu nào để đọc thử.');
  const voice = s.voice?.trim() || DEFAULT_VOICE;
  const rate = s.rate?.trim() || DEFAULT_RATE;

  const file = path.join(CACHE_DIR, `${hashOf(text, voice, rate)}.mp3`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return fs.readFileSync(file);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const part = `${file}.${process.pid}.part`;
  try {
    await run(PYTHON, ['-c', SCRIPT, text, voice, rate, part], {
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
      timeout: 30_000,
    });
    // Publish only after it is a real file: edge-tts is an unofficial API and a dropped
    // websocket answers with an empty stream, which would otherwise be cached as "the
    // sample for this voice" forever.
    if (!fs.existsSync(part) || fs.statSync(part).size <= 1000) {
      throw new Error('edge-tts không trả về âm thanh — thử lại.');
    }
    fs.renameSync(part, file);
    return fs.readFileSync(file);
  } finally {
    fs.rmSync(part, { force: true });
  }
}
