---
name: immigration-pipeline
description: Run one full immigration-news pipeline cycle (crawl → LLM filter/dedup → LLM generate Vietnamese content) over the local medallion lake. Use when asked to run the immigration pipeline, refresh content, or on the 4-hourly schedule.
---

# Immigration content pipeline (one cycle)

You orchestrate one full medallion cycle for the local immigration-news tool. The
Next.js app (http://localhost:3000) is the ONLY owner of the DuckDB lake — you
interact with it over HTTP, never by opening the DB file. Run the steps in order.

## Hard rules
- **Output language: Vietnamese.** All generated content (titles, body, summary,
  hashtags) MUST be written in natural Vietnamese for a Vietnamese audience.
- **Trusted sources only.** Only use/cite the approved sources (already enforced by
  the configured feeds): The Guardian, Newsweek, The New York Times, Fox News
  Digital, Times of India, SWR Aktuell, Yahoo News/Scout, Yahoo奇摩, China Times,
  Dân trí, and official provincial/municipal Police announcements. Do not invent
  facts or cite anything outside the article you are given.
- **LLM does filtering + dedup** (no keyword lists). You decide immigration
  relevance and same-event duplicates with judgement.
- **Sources are multilingual.** Article titles/descriptions may be in the source
  country's language — English (Guardian/Newsweek/NYT/Fox/Times of India),
  German (SWR Aktuell), Chinese (Yahoo奇摩, China Times), or Vietnamese (Dân trí).
  Read and classify each article **in its original language** — do NOT skip or
  down-rank an article just because it isn't English. Regardless of source
  language, the generated `body_text` output is always Vietnamese (§ Step 4).

## Step 1 — Crawl (bronze)
Run: `curl -s -X POST http://localhost:3000/api/pipeline/crawl`
This pulls the last 24h from every market's feeds into bronze and deletes bronze >7d.
(For a first run / backfill, you may use `?hours=168`.)

## Step 2 — List markets
Run: `curl -s http://localhost:3000/api/pages`
For each market note ALL of these config fields (they steer the pipeline and the
user edits them in Settings — always read them fresh each run):
- `id`, `name`, `countryName`, `language` (default vi)
- `glossary`, `wordingRules`, `writingStyle` — localisation context (Step 4)
- `systemPrompt` — extra master instruction for generation (Step 4); apply ON TOP
  of CONTENT_SOP.md when non-empty.
- `userPrompt` — extra per-market generation guidance/template (Step 4); apply
  when non-empty.
- `platformPrompts` — map of `platform → instruction`; when non-empty, also
  produce a `platform_drafts` entry per platform (Step 4).
- `keywordConfig` — relevance hints used during crawl pre-filter + Step 3 (see
  Step 3 note).
- `enabledTopics` — subset of the 12-topic taxonomy this market wants (see Step 3
  TOPIC TAXONOMY). Only classify an article into topics that appear in this list;
  if the article's topics don't intersect `enabledTopics`, drop it for this market.
  Treat an empty/absent list as "all 12 enabled".

## Step 3 — Classify → silver (per market)
> NOTE: bronze is already keyword-pre-filtered at crawl time using each market's
> `keywordConfig` (exclude/political keywords dropped, crime/tier gating applied
> when configured). Use the market's `keywordConfig.tier1`/`tier2` terms as extra
> relevance HINTS here, but your LLM judgement is still the deciding factor.

> ⚡ LOW-EFFORT STEP (save tokens): classification is a fast screening pass, not a
> reasoning task. Decide each article from its title + description in one quick
> read — do NOT deliberate, do NOT write out extended reasoning or thinking per
> article, and do NOT re-fetch the article body. A snap immigration-relevance +
> category + dedup call is enough. Reserve careful, high-effort work for Step 4
> (Vietnamese content generation), where quality matters.

For each market id:
1. `curl -s "http://localhost:3000/api/pipeline/bronze?marketId=<id>&status=unclassified&limit=100"`
   The response's `count` is **this page only** (capped by `limit`) — report the
   backlog from `pending`, never from the number of articles returned.
2. For EACH article decide:
   - `topics`: the list of topic ids (from the TAXONOMY below) the article fits —
     **but only ids that are in this market's `enabledTopics`.** An article can carry
     more than one topic. It is KEPT if the resulting list is non-empty; if it fits
     nothing in `enabledTopics`, return `topics: []` (it is dropped for this market).
     Judge relevance to the **Vietnamese diaspora audience of this market** — a story
     is in-scope when it materially affects Vietnamese people living in / connected to
     the market's country (their legal status, work, money, safety, health, family,
     housing, mobility, community, or ties home), OR is major news of that country a
     diaspora reader would want.
     **TOPIC TAXONOMY (12 — use these exact ids):**
     🔹 `immigration` — visas, policy/law, border/enforcement, asylum, citizenship, deportation, migration status.
     🔹 `labor` — jobs, wages, workplace rights, work permits, labor exploitation, unemployment.
     🔹 `education` — study-abroad, student visas, schools/universities, tuition, credential recognition.
     🔹 `finance-scams` — fraud/scams targeting the community, banking access, investment, remittance fees, and Vietnamese-run businesses (restaurant/nail/spa): licensing, taxes, wage/labor raids.
     🔹 `safety` — crimes affecting the community (as victims or defendants), policing, hate incidents, public-safety alerts.
     🔹 `health` — healthcare access, insurance, mental health, disease/outbreaks, public-health guidance.
     🔹 `travel` — passports, flights, border-crossing logistics, re-entry, travel advisories.
     🔹 `family` — children/schooling, family reunification, marriage/spousal issues, elder care.
     🔹 `housing` — rent, cost of living, evictions, homelessness, housing policy.
     🔹 `community` — overseas-Vietnamese community events, associations, notable people, cultural/religious life.
     🔹 `remittances` — money sent home, exchange rates, cross-border transfer rules, home-country ties/policy affecting the diaspora.
     🔹 `justice` — racial/social justice, discrimination, civil rights, protests affecting minorities/immigrants.
     **HARD EXCLUDE (`topics: []`) — genuinely irrelevant general news:** celebrity/
     showbiz, sports, weather, generic local crime with NO Vietnamese-community angle,
     and stories about non-Vietnamese people in a third country unrelated to this
     market. NOTE: unlike the old immigration-only rule, community crime, scams, and
     business raids are now IN-SCOPE under `safety`/`finance-scams` when they touch the
     Vietnamese community — do not blanket-exclude crime anymore.
     **MARKET-COUNTRY SCOPE (critical — prevents cross-market contamination):**
     There are two kinds of markets — apply the right rule:
     • **DESTINATION markets (US, UK, Germany, Australia):** keep an article ONLY if
       its story is about, set in, or directly affecting THAT country (across any
       topic). A story whose primary country is different — e.g. a US or UK story that
       appeared in the Australia market because a general/world feed carried it —
       must be set `topics: []`; it belongs in its own country's market.
       Judge the country by the story's dateline/subject, NOT the outlet (an
       Australian outlet reporting on US ICE is a US story, not an Australian one).
     • **ORIGIN / DIASPORA markets (Vietnam, India/NRI):** keep any story about THIS
       market's nationals ABROAD (Vietnamese overseas; Non-Resident Indians / Indians
       on H-1B, in the Gulf, UK, Canada, US, etc.) AS WELL AS news within the home
       country. For these markets the story being set in a foreign country is
       EXPECTED and must NOT be dropped — the subject (Vietnamese/Indian people) is
       what matters, not the location. A story about a non-Vietnamese/non-Indian
       person in a third country (e.g. a Colombian migrant in the US) does NOT belong
       here → `topics: []`.
     • The **Others** market is a deliberate multi-country catch-all — no gate.
     **Vietnam market specifically:** in-scope = Vietnamese going abroad (xuất khẩu
     lao động / du học / định cư), foreigners in Vietnam, and the diaspora's ties home
     (remittances, policy). The Dân trí feed is crime-heavy general news — keep crime
     ONLY when it has a Vietnamese-diaspora angle (`safety`/`finance-scams`), else drop.
   - `relevance_score`: 0.0–1.0.
   - `duplicate_of`: if two+ articles cover the SAME event, keep the most detailed
     one and set `duplicate_of` to the kept article's `id` on the others.
3. POST all verdicts (send `topics[]`, not the old `is_immigration`/`category`):
   `curl -s -X POST http://localhost:3000/api/pipeline/silver -H 'Content-Type: application/json' -d '{"items":[{"bronze_id":"...","topics":["immigration","labor"],"relevance_score":0.9,"duplicate_of":null}, ...]}'`

## Step 4 — Generate → gold (per market)
For each market id:
1. `curl -s "http://localhost:3000/api/pipeline/silver?marketId=<id>&status=ungenerated&limit=50"`
   Same rule: `count` is this page, `pending` is the real ungenerated backlog. A
   residue of ungenerated rows is **expected** — it is the top-15 cap below doing
   its job, not a stuck queue.
   **PER-MARKET RELEVANCE CAP (cost control):** with 12 topics far more articles
   qualify, so do NOT generate every ungenerated silver row. Sort the returned rows by
   `relevance_score` (desc) and generate only the **top 15 per market per cycle**
   (the rest stay ungenerated and get reconsidered next cycle). This keeps generation
   inside subscription rate limits.
2. **Pull the real article text for the 15 you picked — and only those 15:**
   `curl -s "http://localhost:3000/api/pipeline/silver?ids=<id1,id2,...>&withBody=1"`
   Feed blurbs run a median of 141 characters, which is why posts drifted toward
   padding; each row now comes back with a `content` field holding the article body,
   fetched on demand and cached. Ask for it AFTER the top-15 cut — asking for the
   whole page multiplies the fetch cost for rows you will not write.
   - `content` is **grounding, not source copy.** Write original Vietnamese analysis
     for the diaspora reader. Do NOT translate the article, and do not reproduce long
     passages of it — a translated wire story is both a copyright problem and not the
     product.
   - **`content: ""` means no body could be retrieved** (Google News link, paywall, or
     a failed fetch). Then stay strictly on the headline and description, exactly as
     before — an empty body is never licence to invent the middle of the story.
3. **Generate and POST ONE item at a time — never draft multiple items' content in
   the same pass before posting any of them.** Holding several articles' titles/
   summaries/bodies in working context together is exactly what causes cross-item
   mixups (see the pairing warning below — both real incidents happened this way).
   Full loop per silver item: generate → POST immediately as a single-item
   `{"items":[{...}]}` call → check `rejected` → only then move to the next
   silver_id. Do not accumulate a batch array across items and POST it at the end.
   For EACH silver item, generate Vietnamese content. Each silver row carries a
   `topics` array — frame the post for its primary topic (`topics[0]`) while weaving in
   any secondary topics. **Read
   `.claude/skills/immigration-pipeline/CONTENT_SOP.md` in FULL first and follow
   it exactly** — the output must match the §10 worked example 100%. Then layer
   the market config on top:
   - Apply the market `glossary` (replace source terms with preferred terms).
   - Follow the market `wordingRules` and `writingStyle`.
   - If `systemPrompt` is non-empty, treat it as an additional master instruction.
   - If `userPrompt` is non-empty, follow it as extra generation guidance.
   - **FORMAT (non-negotiable) — impactful but FACT-BASED/neutral, not personal judgment:**
     - `emoji_title`: **ALL-CAPS, starts with `FLAG + COUNTRY:`** (e.g. `🇺🇸 MỸ:`,
       `🇦🇺 ÚC:`, `🇩🇪 ĐỨC:`) then a punchy, urgent/shocking headline; **END the title
       with ONE thematic emoji** matched to content (🚨 🚛 ⚖️ 💰 🎉 📋). **NO `?` in the
       title.** No lowercase. (SOP §1.)
     - `body_text`: **400–600 words.** Open with a **2–3-sentence prose lead** (flowing,
       NO bullets, NO `-`). Then **3–4 sections**, each with an emoji sub-heading (never
       a question, never "tại sao/nói gì/chuyện gì xảy ra"). **List items ONLY with `🔹`
       — NEVER use the `-` dash anywhere in the post.** Prioritise concrete numbers,
       names, places, dates. No paragraph over 4 lines. End body with the TWO mandatory
       parts: a **💡 GÓC NHÌN CHO CỘNG ĐỒNG NGƯỜI VIỆT** block (3–4 sentences, practical
       actionable advice, include phone/website if any), then a **debate-provoking closing**
       (a rhetorical question — allowed here — or a strong statement, left open). (SOP §2–4.)
     - `hashtags`: 4–6 Vietnamese tags incl. one Vietnamese-community tag; **ALWAYS end
       with `#TinQuốcTếMớiNhất`** (or `#TinMỹMớiNhất`/`#TinÚcMớiNhất`… per country). (SOP §5.)
     - `comment_1` (2–3 sentences, ordinary-reader reaction, casual, **NO emoji**) **and**
       `comment_2` (2–3 sentences, community-expert + advice) — **MANDATORY** (SOP §6).
       `comment_2` MUST end with the exact line: `Cả nhà theo dõi page để cập nhật tin
       tức cộng đồng người Việt và thời sự quốc tế mới nhất nhé ạ!`
   - Also produce `summary` (2–3 sentences, internal) and `image_prompt` (English).
   - If `platformPrompts` is non-empty, also produce `platform_drafts`
     ({"<platform>": "<draft>", …}) adapting the post per each instruction.
   - Stay factual to the source; do not fabricate. Before sending, self-check
     against SOP §8 ("BÀI SAI" errors) and rewrite anything that matches.
   - **FB-COMPLIANCE self-check (mandatory for `finance-scams` and `justice` topics,
     and any post about crime/fraud/trafficking):** the post MUST (1) cite the source,
     (2) read as a report / awareness / warning — NEVER an offer, endorsement, or
     how-to, (3) contain zero contact info, prices, or step-by-step methods. Criticize
     policy, never dehumanize a group. Fail any one → rewrite before sending. (Meta
     Community Standards — see global CLAUDE.md FB-compliance section.)
   - **CRITICAL — verify `silver_id` pairing before POSTing:** `emoji_title` is the
     only field a human sees next to the original headline, but `body_text`/`summary`
     are the ones actually built from the article's substance — and `article_title`
     in the final post is joined server-side from `silver_id`, not from anything you
     send. This has caused real bugs FOUR times so far, always from drafting multiple
     articles' content in the same pass before posting: a whole-item swap (Queensland
     bird-flu ↔ AI-devalues-degrees), and three single-field corruptions where
     `emoji_title`/`summary` stayed correct but `body_text` was pasted from a totally
     unrelated article generated in the same sitting (Hong Kong deepfake story ↔
     Japan earthquake; Manston asylum contractor ↔ Zante leptospirosis outbreak;
     Kumamoto earthquake rescue ↔ a US–Canada border Reddit post). **The one-at-a-time
     generate→POST loop above (step 2 preamble) is the actual fix for this** — it
     removes the "many articles' content held in context together" condition that
     caused all four incidents. Still re-glance at the silver_id's original
     title/description right before POSTing each item as a last check.
   - **The gold endpoint also enforces this as a backstop, in case the one-at-a-time
     discipline slips:** `POST /api/pipeline/gold` checks each item's `body_text`
     against its own `emoji_title`/`summary` for shared distinctive vocabulary
     (learned from the market's own post history, so it works across languages) and
     silently *skips inserting* any item that shares none — that item comes back in
     the response's `rejected: [{silver_id, reason}]` array instead of
     `goldInserted`. **Always check `rejected` in the response.** If it's non-empty,
     re-generate `body_text` for those specific `silver_id`s (the pairing is almost
     certainly wrong) and POST them again — but don't rely on this catching
     everything; it's a safety net, not a substitute for generating one item at a
     time.
4. Each item's POST (fired immediately after that item's generation, per the
   one-at-a-time loop in step 3 — `items` has exactly ONE element, not an
   accumulated array):
   `curl -s -X POST http://localhost:3000/api/pipeline/gold -H 'Content-Type: application/json' -d '{"items":[{"silver_id":"...","emoji_title":"...","body_text":"...","hashtags":"...","comment_1":"...","comment_2":"...","summary":"...","image_prompt":"...","language":"vi"}]}'`

## Step 5 — Report
Summarize per market: bronze crawled, silver kept (with a topic breakdown), gold generated.

> NOTE: If the user has a fuller content SOP (required structure, tone, demo
> examples), it lives in `.claude/skills/immigration-pipeline/CONTENT_SOP.md` —
> read it first and follow it for Step 4 formatting when present.
