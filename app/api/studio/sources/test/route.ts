/**
 * POST /api/studio/sources/test — the wizard's gate.
 *
 * A source that cannot answer must not become a channel, so this returns the first three real
 * items or the reason it could not, and the wizard refuses to continue on the reason.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SOURCES, type SourceConfig, type SourceKind } from '@/lib/studio/sources';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'run')) return NextResponse.json({ error: 'Không được phép.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    kind?: SourceKind;
    config?: SourceConfig;
  };
  const def = body.kind ? SOURCES[body.kind] : undefined;
  if (!def) return NextResponse.json({ error: 'Nguồn không hợp lệ.' }, { status: 400 });

  const blocked = def.blocked();
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  try {
    const items = await def.list(body.config ?? {}, 3);
    if (items.length === 0) {
      return NextResponse.json({ error: 'Nguồn chạy được nhưng chưa có bài nào.' }, { status: 400 });
    }
    return NextResponse.json({
      items: items.slice(0, 3).map((i) => ({
        id: i.id,
        title: i.title,
        source: i.source ?? null,
        comments: i.comments.length,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
