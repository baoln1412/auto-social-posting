/**
 * Crime case queue.
 *
 * Crime series are case-led, not feed-led: no crawler surfaces a 1995 cold case, so the
 * scheduled run needs a list to draw down. This is that list.
 *
 * GET    /api/crime/cases?marketId=…&status=queued
 * POST   /api/crime/cases   { marketId, title, sourceUrl?, notes? }
 * PATCH  /api/crime/cases   { id, status, seriesId? }
 * DELETE /api/crime/cases?id=…
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  addCrimeCase, listCrimeCases, setCrimeCaseStatus, deleteCrimeCase,
} from '@/app/lib/lake';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';

const STATUSES = ['queued', 'researching', 'written', 'rejected'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get('marketId');
  if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
  const status = searchParams.get('status') ?? undefined;
  try {
    const cases = await listCrimeCases(marketId, status);
    return NextResponse.json({ cases, count: cases.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { marketId, title, sourceUrl, notes } = (parsed.data ?? {}) as Record<string, string>;
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
    // A case needs something to research from: a name, a link, or notes.
    if (!title?.trim() && !sourceUrl?.trim()) {
      return NextResponse.json({ error: 'title or sourceUrl is required' }, { status: 400 });
    }
    const id = await addCrimeCase({
      market_id: marketId,
      title: (title ?? sourceUrl ?? '').trim(),
      source_url: sourceUrl?.trim(),
      notes: notes?.trim(),
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { id, status, seriesId } = (parsed.data ?? {}) as Record<string, string>;
    if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    }
    await setCrimeCaseStatus(id, status, seriesId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    await deleteCrimeCase(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
