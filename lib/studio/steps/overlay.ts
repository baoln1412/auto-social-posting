/**
 * Stickers, composited AFTER make-reel.py — beside the engine, never inside it.
 *
 * deploy/make-reel.py is the measured $0 path and stays unedited; this is one ffmpeg pass
 * over its output. If the overlay fails, the reel is still a finished reel, so a failure
 * here is logged and swallowed rather than losing a three-minute render.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { mediaById } from '../assets';
import type { Kit } from './types';

const run = promisify(execFile);

export type Where = 'cover' | 'intro' | 'reactions';

/** Seconds the intro sticker stays up. make-reel's intro is about this long. */
export const INTRO_SEC = 3;

/**
 * Bottom-right, clear of the caption band. Pure, so the filter can be asserted without
 * spending a render to find out ffmpeg rejected it.
 */
export function overlayFilter(where: Where[]): string | null {
  if (where.includes('cover')) return '[0][1]overlay=W-w-40:H-h-320';
  if (where.includes('intro')) {
    return `[0][1]overlay=W-w-40:H-h-320:enable='between(t,0,${INTRO_SEC})'`;
  }
  return null;
}

export function overlayArgs(input: string, png: string, out: string, filter: string): string[] {
  return [
    '-y',
    '-i', input,
    '-i', png,
    '-filter_complex', filter,
    // Audio is untouched: re-encoding it would cost quality for nothing.
    '-c:a', 'copy',
    '-movflags', '+faststart',
    out,
  ];
}

export interface StickerTab {
  set?: string;
  where?: Where[];
}

/** True if the file at `mp4` was replaced by a stickered version. */
export async function applyStickers(mp4: string, kit: Kit): Promise<boolean> {
  const tab = (kit.stickers ?? {}) as StickerTab;
  const filter = overlayFilter(tab.where ?? []);
  if (!filter || !tab.set) return false;

  const sticker = mediaById(tab.set);
  if (!sticker || !fs.existsSync(sticker.path)) return false;

  const out = `${mp4}.stickered.mp4`;
  try {
    await run('/opt/homebrew/bin/ffmpeg', overlayArgs(mp4, sticker.path, out, filter), {
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
      maxBuffer: 8 * 1024 * 1024,
    });
    fs.renameSync(out, mp4);
    return true;
  } catch (e) {
    // A missing sticker must not lose the render it was going on top of.
    console.warn('[studio/overlay] sticker pass failed:', e instanceof Error ? e.message : e);
    fs.rmSync(out, { force: true });
    return false;
  }
}

/** The owner's uploaded background, as media make-reel.py can fetch. */
export function backgroundMedia(kit: Kit): { url: string; kind: 'image' | 'video' } | null {
  const id = ((kit.frame ?? {}) as { background?: string }).background;
  if (!id) return null;
  const row = mediaById(id);
  if (!row || !fs.existsSync(row.path)) return null;
  return {
    url: `file://${row.path}`,
    kind: /\.mp4$/i.test(path.extname(row.path)) ? 'video' : 'image',
  };
}
