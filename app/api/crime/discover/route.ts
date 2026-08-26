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
// Pages to follow per surname/court. 5 x 20 covers the full result set for every surname
// tested, without hammering a free API.
const MAX_PAGES = 5;

interface Hit {
  caseName?: string; dateFiled?: string; absolute_url?: string; court?: string;
  docketNumber?: string;
  opinions?: { snippet?: string }[];
}

// Opinions that review a prior proceeding rather than try a case: they mention murder but
// contain no investigation and no trial. The first scheduled run burned a research cycle
// on one of these.
const PROCEDURAL = /1170\.95|1172\.6|habeas|resentenc|petition for writ|coram nobis/i;
// A conviction that was reversed leaves the story with no ending, and KỲ III needs a final
// judgment. Reversals are skipped unless the same text also records an affirmance.
//
// "remand" and "vacat" used to sit here too, and measured against a labelled set they caught
// none of six real rejections while killing a good case outright: G053424 was remanded for a
// youth-offender parole hearing with the murder conviction left standing, and it went on to
// produce a series. A remand is not a missing ending.
const REVERSED = /\brevers/i;
const AFFIRMED = /affirm/i;
// Appeals that argue only about the sentence: Three Strikes priors, prior-prison-term and
// firearm enhancements, §654 double-counting. The crime is real but the opinion never
// narrates it, so there is no scene, no victim and no investigation to write from. Two of
// today's six rejections read exactly like this in the snippet, and no good case does.
const SENTENCE_ONLY = /\bstrike\b.{0,20}prior|prior.{0,20}\bstrike\b|§§?\s*667|1170\.12|667\.5|12022|\benhancements?\b|Penal Code section 654|§\s*654/i;

/**
 * One crime can appear in the archive several times over: the direct appeal, an order
 * modifying that opinion, a later resentencing appeal. Each is a separate CourtListener
 * record with its own URL, and captions vary ("People v. Ho Thai Nguyen" vs "People v.
 * Nguyen"), so URL and title both fail as identity. That is not hypothetical — a batch
 * wrote the same 1995 San Jose shooting twice, once from H050103 and once from H050103M.
 *
 * The trial court number is the one identifier that stays fixed across all of them, so
 * prefer it. Fall back to the appellate docket with any suffix letter stripped, which at
 * least collapses the modification-order case.
 */
function caseKeys(text: string, docket?: string): string[] {
  const keys: string[] = [];
  // Trial numbers are not all numeric: Santa Clara writes 191354, Orange County writes
  // 11WF0653, and some carry a hyphen (C-69210). Require a digit so the capture cannot
  // run away into the words that follow.
  const trial = /Super\.?(?:ior)?\.?\s*Ct\.?\s*(?:Nos?\.?)?\s*((?=[A-Z-]*\d)[A-Z0-9-]{5,})/i.exec(text);
  if (trial) keys.push(`sc:${trial[1].replace(/\W/g, '').toUpperCase()}`);
  // A fresh hit carries its docket as a field; a stored row only has it written into notes,
  // where the prefix varies ("H050103M", "No. D060327", "Docket Nos. C012228", "Crim. 3993").
  // Read a short window and take the first docket-shaped token in it.
  const raw = docket ?? /hồ sơ\s*(.{0,40})/i.exec(text)?.[1];
  const one = /[A-Z]{0,3}\d{3,}[A-Z]?/i.exec(raw ?? '')?.[0];
  if (one) keys.push(`d:${one.toUpperCase().replace(/([A-Z]*\d+)[A-Z]$/, '$1')}`);
  return keys;
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
    // Second key, on the underlying prosecution rather than the document. Read back out of
    // notes, where the sweep already records the docket and the caption line.
    const seenCases = new Set(existing.flatMap((c) => caseKeys(`${c.notes ?? ''} ${c.title ?? ''}`)));

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
        // Query broadly, filter in code. Putting "jury affirmed" in the query itself cut
        // California Court of Appeal results from 13 to 11 by demanding exact terms that a
        // given opinion may simply word differently, and a narrow query never reaches a
        // second page. Broad + code filter mines more of the archive and judges each hit on
        // what its snippet actually says.
        const q = encodeURIComponent(`caseName:${surname} murder`);
        let url: string | null =
          `https://www.courtlistener.com/api/rest/v4/search/?q=${q}&type=o&court=${court}`;
        let page = 0;
        try {
          // Follow the cursor. "caseName:Nguyen" alone returns 55 across pages of 20, so
          // stopping at page one leaves most of the archive unread.
          while (url && page < MAX_PAGES && found.length < limit) {
          page += 1;
          const res: Response = await fetch(url, { headers: { 'User-Agent': 'auto-social-posting/1.0' } });
          if (!res.ok) break;
          const data = (await res.json()) as { results?: Hit[]; next?: string | null };
          url = data.next ?? null;
          for (const r of data.results ?? []) {
            if (found.length >= limit) break;
            const snip = r.opinions?.[0]?.snippet ?? '';
            // Skip reviews of prior proceedings, and reversals with no recorded affirmance.
            if (PROCEDURAL.test(snip)) continue;
            if (REVERSED.test(snip) && !AFFIRMED.test(snip)) continue;
            if (SENTENCE_ONLY.test(snip)) continue;
            const title = (r.caseName ?? '').trim();
            // "In re X" is habeas or juvenile: a review of a prior proceeding, never a
            // trial record. Belt-and-braces on top of the query.
            if (/^in re\b/i.test(title)) continue;
            const link = r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : '';
            if (!title || !link || seen.has(link) || seen.has(title)) continue;
            // Same prosecution under a different document? Skip before spending a research
            // cycle on it. Checked against the sweep's own finds too, since the duplicate
            // pair usually arrives in one page of results.
            // Match on EITHER identifier. One record of a pair often prints the trial number
            // while the other only prints the docket, so requiring a single preferred key
            // splits the pair apart — that is how the same rejected case was researched twice.
            const keys = caseKeys(snip, r.docketNumber);
            if (keys.some((k) => seenCases.has(k))) continue;
            for (const k of keys) seenCases.add(k);
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
