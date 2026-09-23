/**
 * GET /api/studio/card — the Brand Kit's themeable card.
 *
 * A SECOND renderer, beside /api/image/card and not a change to it. That one owns the
 * "101 Chuyện Úc" brand overlay, the og:image upgrade and the focal-point crop, and it is
 * the measured path for the pipeline's own cards — it stays exactly as it is.
 *
 * This one owns what the Brand Kit drawing asks for and that one has no parameters for:
 * theme · font · radius · title size · highlight colour · 9:16. A kit picks between them
 * with card.engine.
 *
 * ponytail: backgrounds here are fetch + cover-crop. No focal-point detection and no
 * og:image upgrade — a kit that needs those picks engine "classic".
 */
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import {
  FONTS,
  RATIOS,
  fontFile,
  paletteFor,
  titleSizeFor,
  type ThemeName,
} from '@/lib/studio/card/theme';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fontCache = new Map<string, Buffer>();
function font(name: string): Buffer {
  const file = path.join(process.cwd(), fontFile(name));
  let buf = fontCache.get(file);
  if (!buf) {
    buf = fs.readFileSync(file);
    fontCache.set(file, buf);
  }
  return buf;
}

/** Cover-crop a remote image to the frame. Null on anything going wrong — never throws. */
async function background(url: string, w: number, h: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const out = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(w, h, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new Response('Not found', { status: 404 });
  const q = req.nextUrl.searchParams;

  const title = (q.get('title') ?? 'TIÊU ĐỀ MẪU').replace(/\s+/g, ' ').trim().toUpperCase();
  const hl = (q.get('hl') ?? '').trim().toUpperCase();
  const [W, H] = RATIOS[q.get('ratio') ?? '4:5'] ?? RATIOS['4:5'];
  const pal = paletteFor((q.get('theme') ?? 'sang') as ThemeName, q.get('highlightColor') ?? undefined);
  const face = q.get('font') ?? FONTS[0];
  const radius = Math.min(96, Math.max(0, Number(q.get('radius') ?? 0) || 0));
  const size = titleSizeFor(title.length, Number(q.get('titleSize')) || undefined);

  const bgUrl = q.get('bg');
  const bg = bgUrl ? await background(bgUrl, W, H) : null;

  // How wide the text block is and where it sits. Defaults are the composition the card had
  // before these existed: full width, bottom-aligned.
  const width = Math.min(100, Math.max(40, Number(q.get('width')) || 100));
  const yPct = Math.min(100, Math.max(0, Number(q.get('y') ?? 100)));
  // "Chụp nhóm": the headline plus the comments that were chosen, on one card.
  const comments = q.getAll('c').filter((c) => c.trim()).slice(0, 3);

  // The highlighted clause is matched as a run of words, so the paint follows the words
  // rather than a character offset that shifts when the title is edited.
  const words = title.split(' ');
  const hlWords = hl ? hl.split(' ') : [];
  const at = hlWords.length ? words.findIndex((_, i) => words.slice(i, i + hlWords.length).join(' ') === hl) : -1;
  const painted = words.map((w, i) => ({
    w,
    on: at >= 0 && i >= at && i < at + hlWords.length,
  }));

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          backgroundColor: pal.bg,
          borderRadius: radius,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {bg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} alt="" />
        )}
        {bg && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: Math.round(H * 0.62),
              background: `linear-gradient(to bottom, rgba(0,0,0,0), ${pal.scrim})`,
              display: 'flex',
            }}
          />
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: `${width}%`,
            padding: Math.round(W * 0.075),
            paddingBottom: Math.round(W * 0.09),
            borderTop: `4px solid ${pal.rule}`,
            // 100 keeps the block where it has always been; anything less lifts it, and
            // `auto` above it is what pushes it down in the first place.
            marginTop: yPct >= 100 ? 'auto' : Math.round((H * yPct) / 100),
          }}
        >
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {painted.map((p, i) => (
            <span
              key={i}
              style={{
                color: p.on ? pal.hl : pal.fg,
                fontSize: size,
                fontFamily: 'Kit',
                lineHeight: 1.16,
                marginRight: Math.round(size * 0.26),
              }}
            >
              {p.w}
            </span>
          ))}
        </div>

        {comments.map((c, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              marginTop: Math.round(size * 0.42),
              paddingLeft: Math.round(size * 0.34),
              borderLeft: `${Math.max(3, Math.round(size * 0.07))}px solid ${pal.hl}`,
              color: pal.fg,
              opacity: 0.88,
              fontSize: Math.round(size * 0.46),
              fontFamily: 'Kit',
              lineHeight: 1.3,
            }}
          >
            {c.length > 130 ? `${c.slice(0, 130)}…` : c}
          </div>
        ))}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [{ name: 'Kit', data: font(face) as any, weight: 700, style: 'normal' }],
    },
  );
}
