---
name: crime-series
description: Research one criminal case and write it as a 3-part Vietnamese true-crime serial (kỳ án) for the Facebook page, then save it to the lake. Use when asked to write a kỳ án / crime series, or given a case link or summary.
---

# Crime Series — one case → 3 kỳ

This is the **crime vertical**, separate from `immigration-pipeline`. That skill crawls RSS
and turns news items into short posts. This one takes a **single case** — often years old,
often a cold case — researches it, and writes a long serialised feature.

**Read `CRIME_SOP.md` (same folder) in full before writing. Follow it absolutely.**
Everything about title format, the word-conversion table, the hard content limits, tone,
the 3-act split, the three comments and the self-check lives there.

## Input

One of:
- a URL to a case (news story, DOJ press release, court listing), or
- a plain-text case summary the user pastes.

If neither is present, ask for one. **Do not invent a case.**

## Step 0 — Which market?

Crime series lives on its own page. Get its id:

```bash
curl -s http://localhost:3000/api/pages | python3 -c "import json,sys; [print(p['id'], p['name']) for p in json.load(sys.stdin)['pages']]"
```

Use the page named **Crime Series**. If it does not exist, stop and tell the user to create
it in the app first — do not write the series onto a geographic market page.

## Where cases come from

Cases are **not** crawled. The pool is an archive of decided cases, not a feed, and past
cases are as good as recent ones (better, usually: a case that reached appeal has a full
record). Three routes, in order of yield:

1. **CourtListener search API — open, no token.** Measured: `Nguyen murder` in the
   California Court of Appeal alone returns ~298 opinions; five surnames in that one court
   return 568. `POST /api/crime/discover` sweeps surnames × courts and fills the queue.
2. **County DA press archives** — Orange County and Harris County. Article pages fetch
   fine; their feeds are 403. Best for recent convictions with clean fact summaries.
3. **County court record search by name** — Harris County District Clerk (free, by name),
   Orange County Case Index. Best for exact dates, charges and sentences.

**An appellate opinion is the ideal source**: one document narrating crime, investigation
and trial, in the public domain. If a published opinion exists, all three kỳ are writable.

**No signup is required, and none of this costs money.** The search API needs no token, and
`claude -p` runs on the existing subscription at zero marginal cost.

**Opinion full text is the one thing that is walled**, everywhere. Tested and confirmed
blocked: CourtListener's opinion endpoint (401), its public page (202 Cloudflare), the
court's own PDF on courts.ca.gov (403), Justia (403), FindLaw (403). Do not waste a run
trying to scrape them.

**Work around it rather than through it.** The open search API already returns everything
needed to *identify* a case: `caseName`, `dateFiled`, `court`, `docketNumber`, `judge`,
`citation`, plus a short `snippet`. Take those identifiers and gather the narrative from
sources that are fetchable:

- the county DA press release for that case (article pages fetch fine; only their feeds 403)
- local press coverage found by searching the case name, date and county
- the county court record search for exact charges and sentence

That combination is what produced both existing series, neither of which used opinion text.

**Optional speed-up:** a CourtListener account is free and gives an API token worth 125
requests/day, enough for 8 series. It saves research time by returning the opinion narrative
directly. Set `COURTLISTENER_TOKEN` if you want it. It is a convenience, not a requirement.

**Discovered candidates are leads, not vetted cases.** Many appeals turn on procedure and
carry no usable narrative. Apply the record-proportionality rule and reject the thin ones;
rejecting is cheap and expected.

## Step 1 — Gather and verify

Fetch the URL, then widen to the four source groups in `CRIME_SOP.md` §1 (DOJ/FBI/Justia/
CourtListener · local US press · Vietnamese-American press · investigative non-fiction).

Build the fact checklist before writing a word:

- exact dates, street address, neighbourhood, city, state
- victims and perpetrators: full names, ages, occupations, relationships, motive as
  established by the court
- scene and forensic evidence: weapon, DNA, camera, cell-tower, tyre/shoe marks
- legal outcome: court, judge, prosecutor, exact charge, exact sentence

**Vietnamese names must be spelled as the Vietnamese-language US press spells them** — that
is what those sources are in the list for.

**If the record cannot support three parts, write fewer, or decline the case.** Padding with
speculation is the one failure this SOP does not tolerate. Say so plainly rather than filling.

## Step 2 — Split into three acts

Per `CRIME_SOP.md` §6: KỲ I crime & mystery · KỲ II investigation & manhunt · KỲ III trial
& legacy. Each over 3,000 words of flowing prose, not bullets.

**Length comes from depth, not from more facts (§1).** Reach it by rendering the place and
hour, the atmosphere of the scene, the rhythm of the investigation, the air of the
courtroom, and the community's reaction. You may reconstruct setting; you may **not** put
thoughts or dialogue into a real person's head unless the record has them.

Every kỳ needs the two-beat opening and two-beat close in §5, and the beats differ for
first, middle and final instalment.

## Step 3 — Language pass

Four separate read-throughs, not one, and not while drafting:

1. **Vietnamese only (§1).** Translate every agency name, charge and technical term. No
   English anywhere, including in parentheses. `image_prompt` is the sole exception.
2. **No em dashes (§1).** Replace every `—`.
3. **Conversion table (§3a).** Narrative verbs only; charge names keep their correct legal
   Vietnamese.
4. **Hard limits (§3b).** Cut every description of how a killing, assault or self-harm was
   carried out; give the forensic conclusion and its legal weight instead.

Then check the two structural rules that are easy to forget: `body_text` opens with the
case title and the kỳ title on their own lines (so one copy takes everything), and no
editorial note survives in the body — those belong in `summary`.

## Step 4 — Save

One POST for the whole series. **Not `/api/pipeline/gold`** — that route resolves items
through the silver layer and silently drops anything without a matching `silver_id`.

```bash
curl -s -X POST http://localhost:3000/api/crime/series \
  -H 'Content-Type: application/json' \
  -d '{
    "marketId": "<crime page id>",
    "seriesTitle": "🩸 ĐẠI ÁN …",
    "parts": [
      {"part_no":1,"emoji_title":"🥀 KỲ I: …","body_text":"…","hashtags":"…",
       "comment_1":"📌 TÓM TẮT KỲ I: …","comment_2":"…","comment_3":"…",
       "summary":"…","image_prompt":"…","source_name":"DOJ / Houston Chronicle",
       "article_url":"https://…"},
      {"part_no":2, "…": "…"},
      {"part_no":3, "…": "…"}
    ]
  }'
```

All three parts share one `series_id`, generated server-side, and order by `part_no`.

## Step 5 — Report

Tell the user: series title, the three kỳ titles, word count per kỳ, which sources were
used, and anything you deliberately cut or could not verify. If you declined a case or
dropped to fewer than three parts, lead with that.
