/**
 * A hard, server-enforced ceiling on how many alternate sources the writer may try to
 * find one case's judicial-record text.
 *
 * POST /api/crime/research-budget  { id }
 *   → { ok: true, attempts, remaining, allowed, sourcesLeft? }
 *
 * Why this exists as an endpoint rather than an instruction: measured on a real test, an
 * unsupervised research pass exhausted the legitimate sources (CourtListener direct,
 * Justia, FindLaw, Leagle, Casetext) and then kept going rather than stopping - 35 further
 * fetches against Reddit, Medium, SSRN, a law-school library homepage, and a guessed REST
 * endpoint, for 2.17M tokens and no result, on a case a plain browser check later confirmed
 * was genuinely inaccessible everywhere. Asking a model to count its own attempts and stop
 * is the same shape of self-policing this project already had to backstop with code once
 * (check-series.py, for the SOP's wording and word-count rules) - so the count lives here,
 * not in the writer's own running tally.
 *
 * Call this ONCE per attempt, before each fetch/search aimed at the opinion text itself -
 * not before ordinary news-coverage research, which this budget does not gate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { spendResearchAttempt } from '@/app/lib/lake';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';

// Five named legitimate sources for a judicial opinion's text (CRIME_SOP.md §2a), roughly
// one search + one fetch each. Not larger: the point is a ceiling low enough that hitting it
// reliably means the real sources are exhausted, not that the model was cut off early.
const MAX_ATTEMPTS = 8;
const NAMED_SOURCES = 'CourtListener direct, Justia (law.justia.com), FindLaw (caselaw.findlaw.com), Leagle, Casetext';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { id } = (parsed.data ?? {}) as { id?: string };
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { attempts, allowed } = await spendResearchAttempt(id, MAX_ATTEMPTS);
    const remaining = Math.max(0, MAX_ATTEMPTS - attempts);

    return NextResponse.json({
      ok: true,
      attempts,
      remaining,
      allowed,
      // Delivered at the point of the tool call, the highest-attention moment, rather than
      // relying on the model to recall a rule read once at the start of a long research run.
      message: allowed
        ? `Attempt ${attempts}/${MAX_ATTEMPTS}. Only try named sources: ${NAMED_SOURCES}. Nothing else.`
        : `Budget exhausted (${MAX_ATTEMPTS}/${MAX_ATTEMPTS}). STOP searching for the opinion text. `
          + 'Do not invent another source - no social media, no academic paper sites, no inmate '
          + 'lookups, no library or court homepages, no guessed URLs. Treat this case as having no '
          + 'accessible judicial record and proceed under CRIME_SOP.md §2\'s no-source discipline.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to spend research attempt' },
      { status: 500 },
    );
  }
}
