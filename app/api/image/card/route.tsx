/**
 * GET /api/image/card — render a branded news card (per the design SOP).
 *
 * Layers (bottom → top):  article photo → red→transparent gradient →
 *   { title (white + #F8EF63 highlight) · watermark · circle inset w/ red stroke }.
 *
 * All graphics/text are composited deterministically (next/og = Satori) so
 * Vietnamese diacritics and exact-hex highlights are pixel-correct. Only the
 * BACKGROUND may come from an AI model (Case 2) — everything above is code.
 *
 * Query params (all optional — default to the CuongNguyenEurope sample):
 *   title=…            full ALL-CAPS headline
 *   hl=…|…             '|'-separated exact phrases to paint yellow
 *   watermark=…        brand text (70% white)
 *   bg=<url>           background photo (Case 1). Omitted → dark placeholder.
 *   inset=<url>        secondary photo → circle + red stroke, top-left
 *   ratio=1:1 | 4:5    default 4:5
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RED = '#9F181B';
const YELLOW = '#F8EF63';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const fontBold = fs.readFileSync(path.join(FONT_DIR, 'BeVietnamPro-Bold.ttf'));
const fontBlack = fs.readFileSync(path.join(FONT_DIR, 'BeVietnamPro-Black.ttf'));

const UA = 'Mozilla/5.0 (compatible; CardBot/1.0)';

/**
 * Option 1 — ask the source CDN for a LARGER variant (free, biggest win):
 *  - strip WordPress `-800x600` size suffix → usually the full-res original
 *  - bump explicit width/height query params (w/width/maxwidth/h/height) to 1600
 *  - bump thumbor/imgproxy `/fit-in/300x200/` segments
 * Returns the upgraded URL (caller falls back to the original if it 404s).
 */
function upgradeUrl(u: string): string {
  try {
    let s = u.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))/i, '$1');
    s = s.replace(/([?&](?:w|width|maxwidth)=)\d+/gi, (_m, p) => `${p}1600`);
    s = s.replace(/([?&](?:h|height)=)\d+/gi, (_m, p) => `${p}1600`);
    s = s.replace(/\/fit-in\/\d{2,4}x\d{2,4}\//i, '/fit-in/1600x2000/');
    return s;
  } catch {
    return u;
  }
}

async function fetchBuf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Fetch the article page's og:image / twitter:image — the FULL-SIZE, correctly
 * signed image. This is the real fix for feeds (e.g. Guardian's i.guim.co.uk)
 * that only put a tiny signed thumbnail in the RSS, where URL-bumping 401s.
 */
async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? m[1].replace(/&amp;/g, '&') : null;
  } catch {
    return null;
  }
}

/** Min dimension of an image buffer, or 0 on failure. */
async function minDim(buf: Buffer): Promise<number> {
  try {
    const m = await sharp(buf).metadata();
    return Math.min(m.width ?? 0, m.height ?? 0);
  } catch {
    return 0;
  }
}

const FOCAL_CACHE = path.join(process.cwd(), 'data', 'focal-cache');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

/**
 * Ask Gemini vision where the real subject of a news photo is (a face, or the
 * midpoint between two faces) — sharp's built-in `attention` crop is a
 * saliency/entropy heuristic and can lock onto a busy graphic (a seal, a
 * logo) instead of a person. Cached to disk by image hash so it's a one-time
 * cost per unique photo, not per render. Returns null (→ falls back to
 * 'attention') on any failure — must never block card rendering.
 */
async function detectFocalPoint(buf: Buffer): Promise<{ x: number; y: number } | null> {
  if (!GEMINI_API_KEY) return null;
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const cacheFile = path.join(FOCAL_CACHE, `${hash}.json`);
  try {
    if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    /* ignore cache read errors */
  }

  try {
    const small = await sharp(buf).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } },
              {
                text:
                  'This is a news article photo that will be cropped MUCH tighter (often to under half the ' +
                  "width or height). Identify the ONE most important focal point that MUST stay visible — " +
                  "almost always a person's face. If there are multiple people, DO NOT average between them " +
                  '— a midpoint crop can end up cutting into every face instead of keeping any of them ' +
                  'intact. Pick the single most prominent/foreground person instead. Respond with ONLY this ' +
                  'JSON, no other text: {"x": <0-1 fraction, left-right>, "y": <0-1 fraction, top-bottom>}',
              },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 60 },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const m = text.match(/\{[^}]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    const focal = { x: Math.min(1, Math.max(0, parsed.x)), y: Math.min(1, Math.max(0, parsed.y)) };
    try {
      fs.mkdirSync(FOCAL_CACHE, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(focal));
    } catch {
      /* cache write is best-effort */
    }
    return focal;
  } catch {
    return null;
  }
}

/** Cover-crop to WxH around a specific focal point (0-1 fractions) instead of
 * trusting sharp's saliency heuristic. */
async function extractAtFocal(buf: Buffer, w: number, h: number, focal: { x: number; y: number }): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const srcW = meta.width ?? w;
  const srcH = meta.height ?? h;
  const scale = Math.max(w / srcW, h / srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);
  const scaled = await sharp(buf).resize(scaledW, scaledH, { fit: 'fill' }).toBuffer();
  const left = Math.min(Math.max(Math.round(focal.x * scaledW - w / 2), 0), scaledW - w);
  const top = Math.min(Math.max(Math.round(focal.y * scaledH - h / 2), 0), scaledH - h);
  return sharp(scaled).extract({ left, top, width: w, height: h }).toBuffer();
}

/**
 * Cover-crop a buffer to WxH with sharpen (+ optional vignette), → data URI.
 * Option 3: unsharp mask (stronger when upscaling a small source) + a subtle
 *           radial vignette to disguise softness on low-res photos.
 * `smartFocal` — try the Gemini vision focal-point crop first (real article
 * photos only; skip for the inset thumbnail and AI-generated backgrounds,
 * where the added vision call isn't worth it).
 */
async function processBuf(buf: Buffer, w: number, h: number, vignette: boolean, smartFocal = false): Promise<string | null> {
  try {
    const meta = await sharp(buf).metadata();
    const srcMin = Math.min(meta.width ?? 0, meta.height ?? 0);
    const upscaling = (meta.width ?? 0) < w || (meta.height ?? 0) < h;
    const sigma = upscaling ? (srcMin < w * 0.5 ? 1.4 : 1.0) : 0.6;

    const focal = smartFocal ? await detectFocalPoint(buf) : null;
    const cropped = focal ? await extractAtFocal(buf, w, h, focal) : null;

    let pipe = cropped
      ? sharp(cropped).sharpen({ sigma })
      : sharp(buf).resize(w, h, { fit: 'cover', position: 'attention' }).sharpen({ sigma });
    if (vignette) {
      const vig = Buffer.from(
        `<svg width="${w}" height="${h}"><defs>` +
          `<radialGradient id="v" cx="50%" cy="42%" r="75%">` +
          `<stop offset="55%" stop-color="black" stop-opacity="0"/>` +
          `<stop offset="100%" stop-color="black" stop-opacity="0.26"/>` +
          `</radialGradient></defs>` +
          `<rect width="${w}" height="${h}" fill="url(#v)"/></svg>`,
      );
      pipe = pipe.composite([{ input: vig, blend: 'over' }]);
    }
    const out = await pipe.jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Fetch a remote image and cover-crop it to WxH, returned as a data URI.
 * Option 1: try a larger CDN variant first, fall back to the original.
 */
async function toDataUri(url: string, w: number, h: number, vignette = false, smartFocal = false): Promise<string | null> {
  const upgraded = upgradeUrl(url);
  let buf = upgraded !== url ? await fetchBuf(upgraded) : null;
  if (!buf) buf = await fetchBuf(url);
  if (!buf) return null;
  return processBuf(buf, w, h, vignette, smartFocal);
}

/**
 * Case 2 (article has NO image) — generate an illustrative background from the
 * post's `image_prompt` (the LLM-chosen visual concept) via FLUX schnell on
 * fal.ai. ~$0.003/image, and CACHED to disk by prompt hash so it costs once per
 * post, not per view. Inert (returns null → branded placeholder) unless FAL_KEY
 * is set. `no text` keeps garbled lettering out of the AI image.
 */
const GEN_CACHE = path.join(process.cwd(), 'data', 'gen-cache');

async function generateBackground(prompt: string): Promise<Buffer | null> {
  const key = process.env.FAL_KEY;
  if (!key || !prompt.trim()) return null;

  const hash = crypto.createHash('sha1').update(prompt).digest('hex').slice(0, 16);
  const cacheFile = path.join(GEN_CACHE, `${hash}.jpg`);
  try {
    if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile);
  } catch {
    /* ignore cache read errors */
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt.trim()}, editorial news illustration, realistic, dramatic lighting, high detail, no text, no watermark`,
        image_size: 'portrait_4_3',
        num_images: 1,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const imgUrl: string | undefined = j?.images?.[0]?.url;
    if (!imgUrl) return null;
    const buf = await fetchBuf(imgUrl);
    if (!buf) return null;
    try {
      fs.mkdirSync(GEN_CACHE, { recursive: true });
      fs.writeFileSync(cacheFile, buf);
    } catch {
      /* cache write is best-effort */
    }
    return buf;
  } catch {
    return null;
  }
}

/** Split the title into ordered segments, flagging which are highlighted. */
function segment(title: string, phrases: string[]): { text: string; hl: boolean }[] {
  const active = phrases.map((p) => p.trim()).filter(Boolean);
  if (active.length === 0) return [{ text: title, hl: false }];
  const segs: { text: string; hl: boolean }[] = [];
  let rest = title;
  while (rest.length > 0) {
    // earliest matching phrase in the remaining string
    let best = -1, bestLen = 0;
    for (const p of active) {
      const i = rest.toLowerCase().indexOf(p.toLowerCase());
      if (i !== -1 && (best === -1 || i < best)) { best = i; bestLen = p.length; }
    }
    if (best === -1) { segs.push({ text: rest, hl: false }); break; }
    if (best > 0) segs.push({ text: rest.slice(0, best), hl: false });
    segs.push({ text: rest.slice(best, best + bestLen), hl: true });
    rest = rest.slice(best + bestLen);
  }
  return segs;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  // Strip emoji/flags (the card headline is plain text), tidy space-before-colon.
  const rawTitle = q.get('title') ??
    'ĐÀI LOAN: LAO ĐỘNG VIỆT NAM BỎ TRỐN TIÊM FILLER CHUI, THU 100 TRIỆU MỖI NGÀY';
  const title = rawTitle
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+:/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const hl = (q.get('hl') ?? 'TIÊM FILLER CHUI,|THU 100 TRIỆU MỖI NGÀY').split('|');
  const watermark = q.get('watermark') ?? '#CuongNguyenEurope';
  const ratio = q.get('ratio') === '1:1' ? '1:1' : '4:5';
  const W = 1080;
  const H = ratio === '1:1' ? 1080 : 1350;

  let bgUrl = q.get('bg');
  const insetUrl = q.get('inset');
  const articleUrl = q.get('article');
  const imagePrompt = q.get('imagePrompt') ?? '';

  // If the RSS image is a small thumbnail (or missing), pull the article's
  // full-size og:image instead — the real fix for tiny signed thumbnails.
  if (articleUrl) {
    const probe = bgUrl ? (await fetchBuf(upgradeUrl(bgUrl))) ?? (await fetchBuf(bgUrl)) : null;
    const small = !probe || (await minDim(probe)) < 600;
    if (small) {
      const og = await fetchOgImage(articleUrl);
      if (og) bgUrl = og;
    }
  }

  let [bg, inset] = await Promise.all([
    bgUrl ? toDataUri(bgUrl, W, H, true, true) : Promise.resolve(null),
    insetUrl ? toDataUri(insetUrl, 320, 320) : Promise.resolve(null),
  ]);

  // Case 2 — article has no usable image → generate one from image_prompt.
  if (!bg) {
    const gen = await generateBackground(imagePrompt || title);
    if (gen) bg = await processBuf(gen, W, H, true);
  }

  // Auto-fit headline size by length.
  const L = title.length;
  const fontSize = L <= 45 ? 78 : L <= 70 ? 64 : L <= 95 ? 54 : 46;
  const lineGap = Math.round(fontSize * 0.42); // → line spacing ≈ 90–95px feel
  const wordGap = Math.round(fontSize * 0.26);

  // Flatten segments to per-word spans so text wraps naturally while keeping colour.
  const words: { t: string; hl: boolean }[] = [];
  for (const s of segment(title, hl)) {
    for (const w of s.text.split(/\s+/).filter(Boolean)) words.push({ t: w, hl: s.hl });
  }

  return new ImageResponse(
    (
      <div style={{ position: 'relative', width: W, height: H, display: 'flex', backgroundColor: bg ? '#141414' : '#6d1518', fontFamily: 'BVP', overflow: 'hidden' }}>
        {/* Layer 1 — background photo */}
        {bg && <img src={bg} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />}

        {/* Layer 2 — red → transparent gradient (bottom) */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(H * 0.56), display: 'flex', backgroundImage: `linear-gradient(to top, ${RED} 0%, rgba(159,24,27,0.92) 24%, rgba(159,24,27,0) 100%)` }} />

        {/* Layer 3 — watermark (centred, 70% white) */}
        <div style={{ position: 'absolute', top: Math.round(H * 0.44), left: 0, right: 0, display: 'flex', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 50, fontWeight: 700, letterSpacing: 1 }}>
          {watermark}
        </div>

        {/* Layer 3 — circle inset with red stroke (top-left) */}
        {inset && (
          <img src={inset} width={300} height={300} style={{ position: 'absolute', top: 48, left: 48, width: 300, height: 300, borderRadius: 300, border: `8px solid ${RED}`, objectFit: 'cover' }} />
        )}

        {/* Layer 3 — headline (white + yellow highlight), centre-aligned.
            Satori ignores flex `gap`, so word/line spacing is set via per-span
            margins; symmetric horizontal margins keep each wrapped line centred. */}
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 72 - lineGap, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end' }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: w.hl ? YELLOW : '#FFFFFF', fontSize, fontWeight: 900, lineHeight: 1, marginLeft: Math.round(wordGap / 2), marginRight: Math.round(wordGap / 2), marginBottom: lineGap, textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>
              {w.t}
            </span>
          ))}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: 'BVP', data: fontBold, weight: 700, style: 'normal' },
        { name: 'BVP', data: fontBlack, weight: 900, style: 'normal' },
      ],
    },
  );
}
