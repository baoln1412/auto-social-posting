/** PUT /api/studio/kits/[id] — save an edited kit, but only if it still validates. */
import { NextRequest, NextResponse } from 'next/server';
import { studioDb } from '@/lib/studio/db';
import { validateKit } from '@/lib/studio/kits/schema';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'edit_kit')) {
    return NextResponse.json({ error: 'Chế độ xem thử không sửa được bộ nhận diện.' }, { status: 403 });
  }

  const kit = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!kit) return NextResponse.json({ error: 'Body không phải JSON.' }, { status: 400 });

  // The schema is the contract another product will adopt — storing a kit that breaks it
  // would export the breakage with it.
  const err = validateKit({ ...kit, id: params.id });
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const r = studioDb()
    .prepare(
      `UPDATE studio_kits SET name=?, json=?, updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       WHERE id=?`,
    )
    .run(String(kit.name ?? params.id), JSON.stringify({ ...kit, id: params.id }), params.id);
  if (r.changes === 0) return NextResponse.json({ error: 'Không có bộ này.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
