# Applied Sources

Research sources deep-reviewed against this project, with what was actually
taken from each. Convention already used in this codebase: patterns are learned
and rebuilt locally, never taken as dependencies (see comments in
`app/lib/crawl.ts` crediting botasaurus / trigger.dev / firecrawl).

## Matched-sources deep review — 2026-07-04

Context for fit judgments: this project is an RSS-to-social content factory —
crawl (5-tier feed discovery + RSS/scrape) → DuckDB lake (bronze → silver →
gold) → LLM keyword+relevance filter → Vietnamese post generation → Facebook
publish via `page_channels`. Local-first, single user, no test framework,
LLM brain runs via Claude Code scheduled task.

---

### 1. webpro-nl/knip — APPLIED (scan run, script added)

Dead-code linter for JS/TS: unused files, exports, dependencies. Ran
`npx knip` against this repo (Next.js plugin auto-detected `app/` entries)
and verified the headline findings by hand with grep.

**Verified findings (2026-07-04):**

- **Dead file:** `app/api/pipeline/notebooklm-client.ts` (287 lines) — imported
  by nobody; superseded by `openrouter-client.ts`.
- **Dead dependencies (7):** `@google/generative-ai`, `@supabase/supabase-js`
  (real — `app/lib/supabase.ts` is now a SQLite shim that only keeps the old
  function names), `date-fns`, `lucide-react`, `react-day-picker`, `shadcn`,
  `tw-animate-css` (the last five only reachable from dead components below).
- **Dead components (verified no importers):** `ChannelManager.tsx`,
  `FacebookConnect.tsx`, `KeywordFilterConfig.tsx`, `FilterBar.tsx`,
  `DateRangePicker.tsx`, plus 9 unused `components/ui/*` shadcn files and
  `hooks/use-mobile.ts`.
- **Dead exports:** `detectEngine` / `addArticleSource` / `processArticle` /
  `buildFallbackPost`* in `article-processor.ts` (`initPipelineNotebook` and
  `cleanupPipelineNotebook` are still called but are no-ops),
  `detectUsLocation` (crawl.ts), `query` (db.ts), `getSupabaseAnon`
  (supabase.ts). *`buildFallbackPost` is used internally; only its `export`
  keyword is dead.

**Taken:** `npm run knip` script added to `package.json` (runs via `npx --yes`,
no dependency added). Nothing deleted — several "dead" components look like
recently-orphaned UI that may be intended for reattachment (ChannelManager,
KeywordFilterConfig have live backing tables/config). Decide deliberately:
either re-wire them or delete the block above in one sweep, then keep the repo
at knip-zero.

---

### 2. browser-use/video-use — APPLIED (code change)

Claude Code skill for conversational video editing. The video domain is
irrelevant here; the transferable part is its engineering discipline:
**decisions at explicit boundaries with structured self-evaluation**, instead
of inferring agent intent from generated artifacts.

**Taken (code):** `article-processor.ts` previously detected "AI rejected this
article" by sniffing phrases (`'bỏ qua'`, `'off-topic'`, …) out of the
generated `emojiTitle` — with a documented false-positive worry. Both
generation prompts now define an explicit `"relevant"` field and instruct the
model to return exactly `{"relevant":false}` for off-topic articles;
`parseSingleAiResponse` checks that field first. The title-sniffing stays as a
backstop for models that ignore the field. Rejection is now a declared
decision at the boundary, not a side-effect read out of prose.

Second transferable idea, doc-only: video-use's "text first, visuals on
demand" layering — feed the LLM a cheap structured layer and fetch expensive
detail only when needed. The pipeline already does this shape (title +
description first; `extractArticleBody` enrichment only for empty
descriptions). If silver-stage quality ever needs full article text, follow
the same rule: fetch on demand per-article, never bulk.

---

### 3. yikart/AiToEarn — APPLIED (doc-level pattern)

AI content marketing platform publishing across 13+ platforms (TikTok,
YouTube, Instagram, X, Xiaohongshu…). Its value here is the
**platform-adapter publishing model**: one uniform publish payload → per-
platform adapters owning auth, content constraints (length/media/hashtag
rules), publish call, and status callback — behind a queue.

**Fit found in this repo:** the data layer is already multi-platform-ready —
`page_channels` has a generic `platform` column with
`UNIQUE (page_id, platform, platform_page_id)`, posts carry
`platform_drafts` JSON, and `generatePlatformDrafts()` already writes
per-platform variants. But publishing is a single Facebook-shaped route
(`app/api/facebook/post/route.ts`) with Graph-API details inline.

**Landing spot (when platform #2 arrives — Instagram/Threads/TikTok):** do
NOT clone the facebook route. Extract an adapter interface first:

```ts
interface PlatformAdapter {
  platform: string;                       // matches page_channels.platform
  constraints: { maxChars: number; requiresImage: boolean };
  publish(channel: PageChannel, draft: { text: string; imageUrl?: string })
    : Promise<{ ok: boolean; postId?: string; error?: string }>;
}
```

Route becomes a thin dispatcher keyed on `channel.platform`; the current
Facebook logic (token lookup, sharp resize, Graph call) becomes the first
adapter. AiToEarn also validates draft-vs-constraints *before* the publish
call — adopt that: check `platform_drafts[platform]` length/media against
`constraints` at draft time, not at publish failure time.

---

### 4. skyvern-ai/skyvern — APPLIED (doc-level pattern)

LLM + vision browser automation. Its headline capability (drive a real
browser) is deliberately out of scope here — this pipeline stays on plain
`fetch` + cheerio. Two patterns transfer:

**a) Hybrid deterministic→AI fallback** (Skyvern tries CSS/XPath selectors
first, falls back to AI only on failure). Mapping: `fetchWebScrape()` in
`app/lib/crawl.ts` depends on a static `scrapeSelector`; when a site redesign
breaks it, the feed silently yields 0 articles until someone notices in the
audit view. Landing spot: when a `web_scrape` feed that previously produced
articles returns 0 with `ok: true`, escalate — pass the fetched HTML (nav/
script-stripped, truncated) to the existing LLM client with an
extract-article-links JSON-schema prompt, and log the selector as broken in
`perFeed` status. Deterministic path stays primary (free, fast); LLM is the
self-heal, mirroring the existing feed-level self-heal that already cascades
through `discoverFeeds({ exclude })`.

**b) Decisive-action vocabulary** — Skyvern's action model ends runs with
explicit `COMPLETE` / `TERMINATE` and marks some errors *terminal* to bypass
retries. `fetchWithRetry` already distinguishes retryable (5xx/429) from
terminal (4xx) — same idea. Extend it to the pipeline level if run-states
grow: a feed that 403s every cycle for a week is a terminal error deserving
auto-disable + surfacing as a decision, not infinite retry.

Bot-wall note: Skyvern's cloud answer is proxies/CAPTCHA-solving; this
project's local-first answers (humanized headers, Google News Tier-4 fallback)
already cover the same ground at the right cost. No take there.

---

### 5. every-app/open-seo — APPLIED (doc-level heuristic)

Open-source Semrush alternative. Read README + skills listing: its
intelligence lives in paid DataForSEO API calls (keyword volume, SERP, back-
links) plus seven agent-skill workflows (keyword-research, keyword-clustering,
competitive-landscape…). Rank tracking / site audits / backlinks have no
surface in a Facebook-first content factory — most of the product does not
transfer. Its skill-packaging pattern is also already native here
(`.claude/skills/immigration-pipeline/` etc.).

**The one transferable heuristic — keyword feedback loop** (from its
keyword-clustering skill): this repo's `KeywordConfig` tier1/tier2 lists
(`app/lib/keywordFilter.ts`, +3/+1 weighted scoring) are hand-maintained and
will drift stale. But the lake already stores ground truth: bronze articles
that the *LLM* passed into silver are relevance-labeled data. Landing spot: a
periodic audit query (DuckDB, alongside `audit_runs`) that surfaces (a) terms
frequent in silver-passed articles but absent from both tiers → suggest
adding; (b) tier keywords that no passed article has matched in N weeks →
suggest demoting. Output as suggestions in the Audit view — a decision for
the owner, not an auto-edit. This tightens the cheap keyword pre-filter so
fewer irrelevant articles reach the paid LLM relevance stage.

---

### 6. thinh-vu/vnstock — NO-TAKE

Read the research summary (unified Python client for Vietnamese stock market
data: Market/Reference/Fundamental class layers, tiered rate limits,
DataFrame-first returns). Nothing transferable at content level: its pattern
solves "unify heterogeneous *finance data* APIs behind one client for
analysis pipelines" — this repo's equivalent slot is already filled by its
own source abstraction (`FeedEntry` + the 5-tier `discoverFeeds` cascade),
its rate handling is server-side product policy (guest/community/sponsor
tiers) rather than a client pattern, and market data is not an input to
immigration/lifestyle content. Grafting a finance-post vertical on the
strength of a shared "Vietnamese" tag would be speculative feature invention.

### 7. elastic/elasticsearch — NO-TAKE

Read the research summary (distributed Lucene-based search: sharding,
replication, inverted indexes, faceted aggregations, REST). The ideas that
*could* map here — full-text search over the lake, fuzzy title dedup, faceted
audit analytics — are already adequately served at this scale by DuckDB SQL
over a 7-day-retention, single-user bronze layer (audit aggregations exist;
semantic dedup is intentionally delegated to the LLM at the silver stage per
`crawl.ts`). Elasticsearch's actual core value — horizontal scaling and
cluster replication — directly contradicts this project's local-first,
single-node design. If lake-wide search is ever needed, DuckDB's FTS
extension is the proportionate step, not a JVM cluster.
