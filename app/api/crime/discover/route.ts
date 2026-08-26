/**
 * Case discovery for the crime vertical.
 *
 * The immigration side crawls RSS because news arrives. Crime series are case-led and the
 * useful pool is an archive, not a feed: cold cases decided decades ago. CourtListener's
 * search API is open (no token) and covers 3,359 jurisdictions, so the archive is
 * queryable, and an appellate opinion is both the discovery signal and, later, the source
 * document, since a published opinion narrates crime, investigation and trial.
 *
 * Measured: "Nguyen murder" in the California Court of Appeal alone returns ~298 opinions.
 *
 * Limits worth knowing:
 *  - Search (this endpoint's dependency) needs no auth. Fetching an opinion's FULL TEXT
 *    does: /api/rest/v4/opinions/<id>/ returns 401, and the public page is bot-walled.
 *    Set COURTLISTENER_TOKEN to let the writing step pull text automatically; without it
 *    the queue still fills and the case is researched by hand from its link.
 *  - Candidates are leads, not vetted cases. The skill still applies the record-
 *    proportionality rule and rejects anything too thin.
 *
 * POST /api/crime/discover  { marketId, limit?, surnames?, courts? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { addCrimeCase, listCrimeCases } from '@/app/lib/lake';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Common Vietnamese surnames, as spelled in US court records.
const SURNAMES = ['Nguyen', 'Tran', 'Le', 'Pham', 'Huynh', 'Vo', 'Vu', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly'];
// Courts where the Vietnamese-American communities in the brief actually are.
const COURTS = ['calctapp', 'cal', 'texapp', 'washctapp'];

interface Hit {
  caseName?: string; dateFiled?: string; absolute_url?: string; court?: string;
  docketNumber?: string;
  opinions?: { snippet?: string }[];
}

/**
 * A queue row reading "People v. Nguyen (2024)" is untriageable, and the sweep produces
 * many of them. The search snippet already carries the caption and often the opening
 * finding, so mine it for the three things that let a human choose: who the defendant
 * actually was, which county tried it, and what the court said happened.
 */
function readSnippet(snippet: string): { defendant?: string; county?: string; gist?: string } {
  const flat = snippet.replace(/\s+/g, ' ').trim();
  // Caption: "v. HO THAI NGUYEN, Defendant and Appellant"
  const def = /\bv\.\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}),?\s+Defendant/.exec(flat)
    ?? /\bv\.\s+([A-Z][A-Z\s.'-]{4,40}?),/.exec(flat);
  const county = /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+County/.exec(flat);
  // Snippet formats vary too much to parse reliably (modern PDF captions, LEXIS reprints,
  // narrative lead opinions), so rather than keep bolting on regexes, strip the known
  // boilerplate and show whatever is left. It always says something a human can judge.
  const gist = flat
    .replace(/Filed\s+\d+\/\d+\/\d+/gi, '')
    .replace(/CERTIFIED FOR (?:PARTIAL )?PUBLICATION/gi, '')
    .replace(/IN THE COURT OF APPEAL OF THE STATE OF CALIFORNIA/gi, '')
    .replace(/(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+APPELLATE DISTRICT/gi, '')
    .replace(/DIVISION\s+(?:ONE|TWO|THREE|FOUR|FIVE|SIX)/gi, '')
    .replace(/\[EDITORS'? NOTE[^\]]*\]/gi, '')
    .replace(/THE PEOPLE,?|Plaintiff and Respondent,?|Defendant and Appellant\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    defendant: def?.[1]?.trim().replace(/\s+/g, ' '),
    county: county?.[1]?.trim(),
    gist: gist.slice(0, 190),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const body = (parsed.data ?? {}) as { marketId?: string; limit?: number; surnames?: string[]; courts?: string[] };
    const { marketId } = body;
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);
    const surnames = body.surnames?.length ? body.surnames : SURNAMES;
    const courts = body.courts?.length ? body.courts : COURTS;

    // Dedup against everything already queued, written or rejected, so a repeat run does
    // not re-add a case that was already judged unusable.
    const existing = await listCrimeCases(marketId);
    const seen = new Set(existing.flatMap((c) => [c.source_url, c.title].filter(Boolean) as string[]));

    const found: { title: string; url: string; court: string; date: string; notes: string }[] = [];
    outer: for (const court of courts) {
      for (const surname of surnames) {
        if (found.length >= limit) break outer;
        // Two filters, both learned the hard way.
        //
        // caseName: scopes the surname to the PARTY. Free-text "Nguyen murder" matches the
        // name anywhere in the opinion (a witness, a juror, a cited case) and returned
        // People v. Ibarra / Sanchez / Temple / Jones, none of which serve this brief.
        //
        // The trial vocabulary excludes procedural appeals: §1170.95 resentencing
        // petitions and habeas rulings mention murder but contain no investigation or
        // trial narrative. The first scheduled run rejected exactly such a case, correctly,
        // after spending a full research cycle on it.
        // "affirmed" matters as much as the other two filters. A published opinion that
        // REVERSES leaves the story with no ending, and KỲ III requires a final judgment:
        // the second scheduled run rejected a strong case for exactly this reason, after a
        // full research cycle. In this court the split is 11 affirmed to 8 reversed, so the
        // term is worth its weight.
        const q = encodeURIComponent(`caseName:${surname} murder jury affirmed`);
        const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${q}&type=o&court=${court}`;
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'auto-social-posting/1.0' } });
          if (!res.ok) continue;
          const data = (await res.json()) as { results?: Hit[] };
          for (const r of data.results ?? []) {
            if (found.length >= limit) break;
            const title = (r.caseName ?? '').trim();
            // "In re X" is habeas or juvenile: a review of a prior proceeding, never a
            // trial record. Belt-and-braces on top of the query.
            if (/^in re\b/i.test(title)) continue;
            const link = r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : '';
            if (!title || !link || seen.has(link) || seen.has(title)) continue;
            seen.add(link);
            const meta = readSnippet(r.opinions?.[0]?.snippet ?? '');
            const label = meta.defendant
              ? `People v. ${meta.defendant.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase())}`
              : title;
            const bits = [
              meta.county ? `Hạt ${meta.county}` : '',
              r.docketNumber ? `hồ sơ ${r.docketNumber}` : '',
              meta.gist ?? '',
            ].filter(Boolean);
            found.push({
              title: label,
              url: link,
              court,
              date: r.dateFiled ?? '',
              notes: bits.join(' · ') || 'Chưa đọc được trích yếu, cần mở bản án để xác minh.',
            });
          }
        } catch {
          // One court/surname failing must not abort the sweep.
        }
      }
    }

    for (const f of found) {
      await addCrimeCase({
        market_id: marketId,
        title: `${f.title}${f.date ? ` (${f.date.slice(0, 4)})` : ''}`,
        source_url: f.url,
        notes: f.notes,
      });
    }

    return NextResponse.json({ ok: true, added: found.length, cases: found });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Discovery failed' }, { status: 500 });
  }
}
