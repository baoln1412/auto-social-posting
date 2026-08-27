/**
 * Source photographs for a crime series, with faces censored before anything is stored.
 *
 * POST /api/crime/images  { seriesId, marketId, images: [{ url, credit? }] }
 *   → downloads each image, blurs every face found, keeps ONLY the censored copy,
 *     and attaches the results to every part of the series.
 *
 * The ordering is the whole point. The uncensored download lives in a temp file that is
 * never reachable through a URL, and is deleted whether censoring succeeds or fails. If
 * censoring fails, the image is DROPPED rather than stored: a picture we could not censor
 * is not a censored picture, and storing it would put an uncensored face one URL away.
 *
 * Detection is deliberately tuned to over-blur (deploy/censor-faces.py). It still will not
 * catch every face in a dense crowd, which is recorded per image as `faces` so the count is
 * visible rather than implied.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { setCrimeSeriesImages, getCrimeSeriesImages } from '@/app/lib/lake';
import { parseJsonBody } from '@/app/lib/jsonBody';

const run = promisify(execFile);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UPLOADS = join(process.cwd(), 'data', 'uploads');
const TMP = join(process.cwd(), 'data', 'tmp-uncensored');
const SCRIPT = join(process.cwd(), 'deploy', 'censor-faces.py');
const MAX_BYTES = 12e6;
const MAX_IMAGES = 6;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface Incoming { url?: string; credit?: string; role?: string; article?: string }
interface Stored { url: string; credit: string; source: string; article: string; role: Role; faces: number }

// What the picture shows. Anything unrecognised becomes 'khac' rather than being trusted
// through to the UI, which renders the role as a label.
const ROLES = ['victim', 'suspect', 'scene', 'khac'] as const;
type Role = (typeof ROLES)[number];
const role = (r?: string): Role =>
  (ROLES as readonly string[]).includes((r ?? '').trim()) ? ((r as string).trim() as Role) : 'khac';

/** Reject anything that is not a plain remote http(s) image before we fetch it. */
function usable(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { seriesId, images } = (parsed.data ?? {}) as { seriesId?: string; images?: Incoming[] };
    if (!seriesId) return NextResponse.json({ error: 'seriesId is required' }, { status: 400 });
    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'images[] is required' }, { status: 400 });
    }

    await mkdir(UPLOADS, { recursive: true });
    await mkdir(TMP, { recursive: true });

    const stored: Stored[] = [];
    const skipped: { url: string; why: string }[] = [];

    for (const item of images.slice(0, MAX_IMAGES)) {
      const src = usable(item.url ?? '');
      if (!src) { skipped.push({ url: item.url ?? '', why: 'not an http(s) url' }); continue; }

      let tmpPath = '';
      let outPath = '';
      try {
        const res = await fetch(src, {
          headers: {
            // News CDNs commonly 403 an unfamiliar agent; the referer is what several of
            // them actually check.
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            Referer: `${src.protocol}//${src.host}/`,
            Accept: 'image/avif,image/webp,image/jpeg,image/png,*/*',
          },
          redirect: 'follow',
        });
        if (!res.ok) { skipped.push({ url: src.href, why: `http ${res.status}` }); continue; }

        const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!OK_TYPES.includes(type)) { skipped.push({ url: src.href, why: `type ${type || 'unknown'}` }); continue; }

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) { skipped.push({ url: src.href, why: `too large (${buf.length})` }); continue; }
        if (buf.length < 5000) { skipped.push({ url: src.href, why: 'too small to be a photo' }); continue; }

        const id = randomUUID();
        // The uncensored file goes somewhere no route can serve, and is removed below.
        tmpPath = join(TMP, `${id}.bin`);
        outPath = join(UPLOADS, `${id}.jpg`);
        await writeFile(tmpPath, buf);

        const { stdout } = await run(
          'uv',
          ['run', '--quiet', '--python', '3.12', '--with', 'opencv-python-headless', '--with', 'numpy',
            SCRIPT, tmpPath, outPath],
          { timeout: 120_000, maxBuffer: 4e6 },
        );
        const faces = (JSON.parse(stdout) as { results?: { faces: number | null }[] }).results?.[0]?.faces;

        // null means the image could not be read or written — NOT that it had no faces.
        // Either way there is no censored artefact to serve, so nothing is kept.
        if (faces === null || faces === undefined) {
          skipped.push({ url: src.href, why: 'could not censor' });
          await unlink(outPath).catch(() => {});
          continue;
        }

        stored.push({
          url: `/api/image/upload?f=${id}.jpg`,
          credit: (item.credit ?? '').trim(),
          source: src.href,
          // The page the photo was published on, kept separate from the image URL: a CDN
          // path is not something you can open to check the caption or the licence.
          article: (item.article ?? '').trim(),
          role: role(item.role),
          faces,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'failed';
        skipped.push({
          url: src.href,
          // ENOENT here means uv is not on the server's PATH, which reads as a generic
          // failure otherwise and sends you looking at the image instead of the service.
          why: /ENOENT/.test(msg) ? 'uv not found on PATH — restart the web service' : msg.slice(0, 90),
        });
        if (outPath) await unlink(outPath).catch(() => {});
      } finally {
        // Runs on every path, including the throw: the uncensored copy never survives.
        if (tmpPath) await unlink(tmpPath).catch(() => {});
      }
    }

    // Merge with what the series already holds rather than replacing it, so attaching a
    // scene photo later does not silently drop the suspect photo attached earlier.
    const existing = await getCrimeSeriesImages(seriesId);
    const seen = new Set(existing.map((i) => i.source));
    const merged = [...existing, ...stored.filter((s) => !seen.has(s.source))];
    const parts = stored.length > 0 ? await setCrimeSeriesImages(seriesId, merged) : 0;
    return NextResponse.json({ ok: true, stored: stored.length, parts, images: stored, skipped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to attach images' },
      { status: 500 },
    );
  }
}
