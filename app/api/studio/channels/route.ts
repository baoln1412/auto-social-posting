/** POST /api/studio/channels — create a channel the wizard has already fetch-tested. */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { studioDb } from '@/lib/studio/db';
import { SOURCES, type SourceConfig, type SourceKind } from '@/lib/studio/sources';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const t = tier();
  if (!can(t, 'edit_kit')) {
    return NextResponse.json({ error: 'Chế độ xem thử không tạo được kênh.' }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    kind?: SourceKind;
    config?: SourceConfig;
    kitId?: string;
    makes?: string[];
  };
  if (!b.name?.trim()) return NextResponse.json({ error: 'Chưa đặt tên kênh.' }, { status: 400 });
  if (!b.kind || !SOURCES[b.kind]) {
    return NextResponse.json({ error: 'Nguồn không hợp lệ.' }, { status: 400 });
  }

  const id = randomUUID();
  studioDb()
    .prepare(
      `INSERT INTO studio_channels (id, name, market_id, kit_id, sources_json, tier_min, makes_json)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      b.name.trim(),
      b.config?.marketId ?? null,
      b.kitId ?? null,
      JSON.stringify([{ type: b.kind, ...(b.config ?? {}) }]),
      'owner',
      JSON.stringify(b.makes?.length ? b.makes : ['post', 'reel']),
    );
  return NextResponse.json({ id });
}
