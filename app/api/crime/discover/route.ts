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

// Asian surnames as spelled in US court records, not Vietnamese only.
//
// Surname is a proxy for ethnicity and an imperfect one. Lee, Park, Kim and Chan are also
// common non-Asian American surnames, so the sweep will surface cases outside the brief;
// the research step checks who the defendant actually is and rejects the rest. Casting wide
// and filtering late beats a narrow list that never surfaces a Hmong or Cambodian case.
const SURNAMES = [
  // Vietnamese
  'Nguyen', 'Tran', 'Le', 'Pham', 'Huynh', 'Vo', 'Vu', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly',
  // Chinese
  'Chen', 'Wang', 'Zhang', 'Liu', 'Lin', 'Huang', 'Wu', 'Chan', 'Cheung', 'Lam', 'Wong', 'Chin', 'Chow', 'Yee',
  // Korean
  'Kim', 'Park', 'Lee', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Shin',
  // Filipino
  'Bautista', 'Ramos', 'Aquino', 'Mendoza', 'Villanueva',
  // Hmong and Lao, concentrated in Sacramento, Fresno and the Twin Cities
  'Vang', 'Xiong', 'Yang', 'Thao', 'Lor', 'Her',
  // Cambodian
  'Sok', 'Chea', 'Meas',
  // Japanese
  'Tanaka', 'Yamamoto', 'Nakamura',
  // South Asian
  'Patel', 'Singh', 'Shah', 'Kumar',
];
// Courts where the Vietnamese-American communities in the brief actually are.
const COURTS = ['calctapp', 'cal', 'texapp', 'washctapp'];
// Pages to follow per surname/court. 5 x 20 covers the full result set for every surname
// tested, without hammering a free API.
const MAX_PAGES = 5;
// Only opinions filed from here on. This biases the pool toward recent CRIMES - not because
// old crimes are ineligible (CRIME_SOP.md §0a's hard floor is 2000, not a proxy for this),
// but because pre-2005 crimes were also covered in print that was never digitised, and PRESS
// is now the primary source bar (§2), not a photo. Leaving this at 2015 under-reaches a
// little into 2000-2009: an appeal about a crime that old still has to have been FILED
// recently to surface here. Worth lowering once there's real data on how often that binds,
// not before.
//
// It is a bias, not a guarantee, and cannot be more than that. An appeal is decided years
// after the offence, so a 2024 opinion is routinely a 1995 shooting - that exact case is in
// the lake. The crime date is only knowable from the opinion text, so the hard cutoff lives
// in the SOP where the writer can read it.
const FILED_AFTER = process.env.CRIME_FILED_AFTER || '2015-01-01';

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
// "X v. Y" between two private parties (or a private party and an LLC) is a civil suit -
// premises-liability, wrongful-death, insurance - that MENTIONS a killing in its facts
// without anyone being tried for it. The "murder" term in the query matches the facts, not
// a charge. Every US criminal prosecution has the sovereign as a named party, so its absence
// is close to definitive. Measured 2026-08-30: 2 of 8 attempts in one batch were civil suits
// that reached the writer - "Peng Wang... v. TREA Churchill on the Park, LLC" and "Ling
// Huang v. John Hackbarth" - each caught only after a research-budget spend.
const CRIMINAL_PARTY = /\b(People|State|Commonwealth|United States)\b/i;
// A writ proceeding, not a trial record - same shape as PROCEDURAL above, but the snippet
// doesn't always say "habeas" even when the caption does. Measured 2026-08-30: "Ex Parte
// Hiep Duc Ngo" reached the writer and cost two research-budget attempts on a case with no
// crime narrative to find in the first place.
const EX_PARTE = /^ex parte\b/i;

/**
 * Cheap, code-only existence check: does ANY news coverage turn up for this name at
 * all? Not a confirmation of relevance or accuracy - just whether the writer would
 * find zero press the moment it starts researching. Only applied to court-sweep
 * candidates: DA-sourced ones already carry the DA's own release as a real source,
 * satisfying CRIME_SOP.md §2 regardless of what else does or doesn't turn up.
 *
 * Soft signal only, never a hard filter (see press_hint's schema comment in lake.ts
 * for the measured cause and the immigration keyword-prefilter NO-GO precedent this
 * is deliberately softer than): a single query can miss coverage indexed under a
 * different name, so a zero-hit case is still queued - just claimed last.
 */
async function hasPressHint(name: string): Promise<boolean> {
  if (!name) return true; // nothing to search - don't penalize on missing data
  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}"`)}&hl=en&gl=US&ceid=US:en`,
      { headers: { 'User-Agent': 'auto-social-posting/1.0' }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return true; // fetch trouble - don't penalize, just skip the check
    return /<item>/i.test(await res.text());
  } catch {
    return true; // network hiccup - don't penalize
  }
}

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
 * Prosecutor press rooms, as a second way in.
 *
 * CourtListener only holds appellate opinions, and an appeal is decided years after the
 * offence - so every case it surfaces skews old. Recency here isn't chasing a photo anymore
 * (real-photo sourcing is optional now, §9a) - it's chasing PRESS: pre-2005 crimes were also
 * covered in print that was never digitised, and a case with zero digitised coverage often
 * has no accessible source at all under §2's "at least one real source" bar.
 *
 * A conviction or sentencing release names a RECENT crime that already has a final outcome,
 * which is the combination §2 needs for KỲ III.
 *
 * The release itself carries no usable photograph - every image on a checked LA County DA
 * conviction release was a logo or a social icon, and that no longer matters. It is a lead:
 * it gives the name, county and charge, and recent cases are covered by outlets that are
 * still online, which is where the real reporting - the thing §2 actually needs - lives.
 *
 * Only offices that answer a plain server-side fetch are listed. Orange County, Alameda and
 * Santa Clara all sit behind bot protection that returns 403 to any headers, so scraping them
 * from here is not possible; they would need a browser.
 */
const DA_SOURCES = [
  { name: 'Biện lý Hạt Los Angeles', index: 'https://da.lacounty.gov/media/news', link: '/media/news/' },
];
const OUTCOME = /\bconvict|sentenc|pleaded guilty|pled guilty|found guilty|jury (?:found|convicted)/i;
const DA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  // Load-bearing, and it looks like a formality. Let fetch negotiate compression and this CDN
  // answers 200 with a 6 KB stub containing no links at all; ask for identity and the same URL
  // returns the real 59 KB page with 30 releases. A 200 with no matches reads exactly like
  // "nothing published today", so the sweep silently found nothing until this was traced.
  'Accept-Encoding': 'identity',
};

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

/**
 * Candidates from prosecutor releases. Requires a recorded outcome, a surname from the list,
 * and a crime year at or after `minYear` — a release about a 1990s cold case is the very
 * thing this source exists to avoid.
 */
async function sweepDA(minYear: number, surnames: string[], limit: number, seen: Set<string>, blocked: string[]) {
  const found: { title: string; url: string; court: string; date: string; notes: string }[] = [];
  const thisYear = new Date().getFullYear();

  for (const src of DA_SOURCES) {
    if (found.length >= limit) break;

    // Nearly all the filtering happens on the INDEX, from the link text alone: it reads
    // "August 24, 2026: Man Convicted of 2023 Murder of …", which carries the outcome and the
    // offence year together. Fetching every release to learn the same thing tripped the site's
    // bot protection after about five requests and returned "Pardon Our Interruption" for the
    // rest, so the sweep must arrive at a shortlist before it starts opening pages.
    let candidates: { href: string; text: string; year: number }[] = [];
    try {
      const res = await fetch(src.index, { headers: DA_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { blocked.push(`${src.name}: http ${res.status}`); continue; }
      const html = await res.text();
      // The site answers 200 with a challenge page rather than an error, so a block is
      // indistinguishable from a quiet news day unless it is checked for and reported.
      if (/Pardon Our Interruption/i.test(html) || html.length < 15_000) {
        blocked.push(`${src.name}: chặn tự động (bot protection)`);
        continue;
      }
      const byHref = new Map<string, { href: string; text: string; year: number }>();
      for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = m[1].startsWith('http') ? m[1] : new URL(m[1], src.index).href;
        const text = strip(m[2]);
        if (!href.includes(src.link) || text.length < 25 || seen.has(href)) continue;
        if (!OUTCOME.test(text)) continue;
        // The offence year, not the release year. Ignore any year at or after the current one,
        // which is when the release was published rather than when the crime happened.
        const years = [...text.matchAll(/\b(19\d\d|20\d\d)\b/g)].map((n) => Number(n[1])).filter((y) => y < thisYear);
        // NOT the minimum year in the text: every page on this site mentions 2000 somewhere,
        // so a min-year test rejected all thirty releases while looking like a quiet day.
        const year = years.length ? Math.max(...years) : 0;
        if (year && year < minYear) continue;
        if (!byHref.has(href)) byHref.set(href, { href, text, year });
      }
      candidates = [...byHref.values()].slice(0, 8);
    } catch { continue; }

    // Only the shortlist gets opened, one at a time with a pause, to confirm the surname.
    for (const c of candidates) {
      if (found.length >= limit) break;
      let who = surnames.find((s) => new RegExp(`\\b${s}\\b`).test(c.text));
      if (!who) {
        try {
          await new Promise((r) => setTimeout(r, 1200));
          const res = await fetch(c.href, { headers: DA_HEADERS, signal: AbortSignal.timeout(15_000) });
          if (!res.ok) continue;
          const body = strip(await res.text()).slice(0, 6000);
          if (/Pardon Our Interruption/i.test(body)) break;  // rate-limited; stop, do not hammer
          who = surnames.find((s) => new RegExp(`\\b${s}\\b`).test(body));
        } catch { continue; }
      }
      if (!who) continue;
      seen.add(c.href);
      found.push({
        title: c.text.replace(/^\w+ \d{1,2}, \d{4}:\s*/, '').slice(0, 110),
        url: c.href,
        court: 'da',
        date: c.year ? `${c.year}-01-01` : '',
        notes: `${src.name} · họ ${who} · án đã tuyên${c.year ? ` · gây án ${c.year}` : ''} · ${c.text.slice(0, 130)}`,
      });
    }
  }
  return found;
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
    const body = (parsed.data ?? {}) as {
      marketId?: string; limit?: number; surnames?: string[]; courts?: string[];
      source?: string; minYear?: number;
    };
    const { marketId } = body;
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);
    const surnames = body.surnames?.length ? body.surnames : SURNAMES;
    const courts = body.courts?.length ? body.courts : COURTS;
    // 'both' by default: prosecutor releases supply recent, photographable cases, the courts
    // supply volume. Neither alone fills a daily batch.
    const source = (body.source ?? 'both') as 'courts' | 'da' | 'both';
    const minYear = Number(body.minYear ?? process.env.CRIME_MIN_CRIME_YEAR ?? 2000);

    // Dedup against everything already queued, written or rejected, so a repeat run does
    // not re-add a case that was already judged unusable.
    const existing = await listCrimeCases(marketId);
    const seen = new Set(existing.flatMap((c) => [c.source_url, c.title].filter(Boolean) as string[]));
    // Second key, on the underlying prosecution rather than the document. Read back out of
    // notes, where the sweep already records the docket and the caption line.
    const seenCases = new Set(existing.flatMap((c) => caseKeys(`${c.notes ?? ''} ${c.title ?? ''}`)));

    const found: { title: string; url: string; court: string; date: string; notes: string; pressHint?: boolean }[] = [];
    const daBlocked: string[] = [];

    // Prosecutor releases first: they are the recent, photographable cases, so they should
    // reach the queue ahead of whatever the court sweep turns up.
    if (source !== 'courts') {
      found.push(...await sweepDA(minYear, surnames, limit, seen, daBlocked));
    }

    outer: for (const court of courts) {
      if (source === 'da') break;
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
          `https://www.courtlistener.com/api/rest/v4/search/?q=${q}&type=o&court=${court}`
          + `&filed_after=${encodeURIComponent(FILED_AFTER)}`;
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
            if (EX_PARTE.test(title)) continue;
            if (title && !CRIMINAL_PARTY.test(title)) continue;
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
              pressHint: await hasPressHint(meta.defendant ?? title),
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
        // undefined (DA-sourced - never checked) defaults to 1, same as "hit found".
        press_hint: f.pressHint === false ? 0 : 1,
      });
    }

    // daBlocked is surfaced rather than swallowed: a prosecutor site answering with a
    // challenge page looks exactly like a day with no convictions announced.
    return NextResponse.json({ ok: true, added: found.length, cases: found, daBlocked });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Discovery failed' }, { status: 500 });
  }
}
