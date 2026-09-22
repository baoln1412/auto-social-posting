# Studio — the editorial UX for Desoul Posting (plan, 2026-09-22)

**Written for:** a Claude Code session opened in `~/auto-social-posting`, any model. This is the
whole spec and the whole plan; do not re-research, do not redesign. Where it says STOP, stop and
show the owner the named thing. The owner-facing version with drawings is
`docs/plans/2026-09-22-studio-editorial-ux.html`.

## Handoff prompt (paste this to start)

> Read `docs/plans/2026-09-22-studio-editorial-ux.md` top to bottom, then execute it from Slice 0.
> Build ONLY under `app/studio/`, `app/api/studio/`, `lib/studio/`, `tests/` and the files each
> slice names. Never edit `app/page.tsx`, `app/components/PostCard.tsx`, any existing `app/api/*`
> route, `deploy/make-reel.py` or `app/lib/db.ts` beyond what a slice says. Test on `next dev -p 3001`;
> production on :3000 must keep serving its current build. TDD: a failing test before each unit. One
> commit per slice, suite green before it. STOP at the end of every slice and show me what it says.

---

## 0 · Why, in five lines

ThreadViral (app.threadviral.com) turns a Threads post into a video with a UX the owner rates above
ours: paste a source → a Brand Kit with preset galleries → every human-in-the-loop step shows its
result and cost before the next one spends → an editorial page to fix scenes and re-render → a
library with delivery → a first-run tour. We already own every engine it needs — the crawl and
generation pipeline, the FB card renderer, `deploy/make-reel.py` at $0, a compliance gate, the
Desoul look. What we lack is the editorial surface. This builds it **beside** the current UI, for
ASP first, as data contracts AILP can adopt later.

**Owner's decisions (2026-09-22, binding):**
- Approach A: extend ASP in place, portable by *data* (kit schema, step contract, tour spec), not
  by React code. AILP adopts the pattern later on its own stack, or Studio moves in here as a
  second engine once the cutscene pipeline is stable.
- Nothing that works today is overwritten. New route tree, new tables, engines called not edited.
- Owner-first with a tier seam from day one (`owner` / `member` / `demo`); demo reads mock data.
- Day-one sources: news RSS (exists), Reddit, article URL, own text, Threads (own account only).
  Other people's Threads/Instagram/Facebook posts: **paste the text**. No scraping, no extension.
- Video goes through the existing `make-reel.py`; posts through the existing generation; the FB
  image through `/api/image/card`.

---

## 1 · Done when

1. On :3001, the owner makes one **post** and one **reel** for a real market through `/studio`,
   with every step previewed before it ran, and finds both in `/studio/library`. The reel's scenes
   were chosen from a **comment pool** (post + comments with their scores, unselected ones hidden),
   and one setting was changed in the **per-run override drawer** without touching the kit.
2. `git diff main -- app/page.tsx app/components app/api deploy app/lib/db.ts` shows nothing but
   the one additive button of Slice 6 (and the `ensureStudioTables` call of Slice 0 in `db.ts`).
3. Two Brand Kits render the same post as visibly different cards and captions; screenshots of
   both are in the suite.
4. The demo tier walks the whole flow with mock data and spends nothing.
5. Suite green: unit tests on the step contract and runs, one Playwright screenshot per screen.

---

## 2 · The tree (what is new, what is touched)

```
app/studio/                 layout.tsx (shell: sidebar + tier gate)   page.tsx (New)
  channels/                 page.tsx (list)   new/page.tsx (wizard)   [id]/page.tsx
  kits/                     page.tsx (list)   [id]/page.tsx (editor)
  runs/[id]/                page.tsx (editorial run page)
  library/                  page.tsx
  guide/                    page.tsx
  settings/                 page.tsx
app/api/studio/             channels · sources/test · kits · runs · runs/[id]/advance · library
lib/studio/                 tier.ts · db.ts · runs.ts · steps/{types,registry,fetch,draft,image,reel,publish}.ts
                            sources/{gold,article,text,reddit,threads}.ts · gates/{compliance,layout,budget}.ts
                            kits/{schema.ts,load.ts} · tours/*.json · demo/seed.ts
deploy/assets/kits -> ~/research-console/brand/kits      (symlink; canonical kit schema + presets)
tests/                      vitest unit · playwright screens · shots/ (committed PNGs)
```

Touched, minimally: `app/lib/db.ts` (one call to `ensureStudioTables()` after the existing DDL);
`package.json` (vitest, @playwright/test, `"test"` script); `app/components/PostCard.tsx` (Slice 6
only: one extra link). `deploy/make-reel.py` is never edited — it is the measured $0 path.

Conventions the executor must keep: `'use client'` components import nothing server-only (see
`app/lib/videoSteps.ts` for the reason); Python is `/opt/homebrew/bin/python3` with
`/opt/homebrew/bin` on PATH (see `app/lib/videoJobs.ts`); only the Next server ever opens the
DuckDB lake (single-writer) — Studio runs inside that server, so `lib/studio/sources/gold.ts`
imports from `app/lib/lake.ts` and never opens the file itself.

---

## 3 · The step contract — `lib/studio/steps/types.ts`

```ts
export type StepName = 'fetch' | 'draft' | 'image' | 'reel' | 'publish';
export type Money = { usd: number; note: string };          // 0 is a valid, honest estimate

export interface StepPreview {                               // what the owner sees BEFORE run()
  kind: 'items' | 'text' | 'png' | 'scenes';
  data: unknown;                                             // items[] | {text, gate} | {url} | {scenes[], firstFrameUrl}
  cost: Money;
}
export interface GateResult { checked: number; findings: string[]; }   // checked=0 means it did not run

export interface Step<I, O> {
  name: StepName;
  preview(input: I, ctx: RunCtx): Promise<StepPreview>;    // cheap; never spends
  gate?(output: O, ctx: RunCtx): Promise<GateResult>;      // runs after run(); findings block Continue
  run(input: I, ctx: RunCtx): Promise<O>;                  // may spend; must be idempotent per run+step
}
export interface RunCtx { runId: string; channel: Channel; kit: Kit; tier: Tier; }
```

Rules: every step writes a `studio_steps` row **on success and on failure** (status, output_ref,
cost, gate JSON, error). `Continue` is disabled while `gate.findings.length > 0` or while
`gate.checked === 0` for a step that declares a gate — a gate that never ran is not a pass. A
channel's `auto_continue` flag skips the button only for steps whose preview cost is $0.

Steps, day one:

| step | input → output | preview | run (engine, unchanged) | gate |
|---|---|---|---|---|
| fetch | source config → items[] | first 3 items | source adapter | none |
| draft | item → {text, hashtags, title} | text + compliance chip | gold: the gold row IS the draft (no spend); text/article/reddit: the same prompt module `app/api/pipeline/gold/route.ts` uses — extract it to `lib/gold.ts` without changing the route's behaviour (the route imports the extracted function) | `gates/compliance.ts`: source cited · reads as report not offer · no contact/prices/routes (CLAUDE.md rule) |
| image | draft + kit.card → PNG | the PNG | `GET /api/image/card?title&hl&ratio&bg&article` (exists) | `gates/layout.ts`: title box inside frame, ≥ 3:1 contrast on the highlight |
| reel | draft + kit → MP4 | scene list (narration split at sentence ends) + first frame | `startRenderJob()` from `app/lib/videoJobs.ts`; progress from `STEP_ORDER` | `gates/budget.ts`: duration in kit range; no caption cue > kit.captions.maxLines |
| publish | asset → channel | the post as it will appear | out of scope now — records the intent only | none |

---

## 4 · Data — `lib/studio/db.ts`, all tables prefixed, all `CREATE TABLE IF NOT EXISTS`

```sql
studio_channels (id TEXT PK, name, market_id, kit_id, sources_json, auto_continue INT DEFAULT 0,
                 tier_min TEXT DEFAULT 'owner', created_at)
studio_kits     (id TEXT PK, name, schema_version INT, json TEXT, created_at, updated_at)
studio_runs     (id TEXT PK, channel_id, item_ref TEXT, mode TEXT, status TEXT, current_step TEXT,
                 overrides_json TEXT, selection_json TEXT, created_at, updated_at)
studio_media    (id TEXT PK, kind TEXT, path TEXT, bytes INT, meta_json, created_at)   -- owner uploads: bg | sticker | music
studio_steps    (id TEXT PK, run_id, name, status TEXT, input_ref, output_ref, cost_usd REAL,
                 gate_json TEXT, error TEXT, started_at, finished_at)
studio_assets   (id TEXT PK, run_id, kind TEXT, path TEXT, meta_json, created_at)
```

`item_ref` is `gold:<id>` / `url:<canonical>` / `text:<sha>` / `reddit:<id>` — a string, so a run
never depends on a lake row still existing. Runs are resumable: `advance(runId)` re-runs the
current step only. `mode` is one of `read-post` (the source text is the narration) ·
`write-narration` (the owner writes it) · `voice-over-media` (narration over supplied images/video —
`startRenderJob` already takes `media[]`) · `text-to-reel` (own text, no source). `overrides_json`
holds the per-run drawer (§6) and is merged over the kit at run time; `selection_json` holds which
comments are scenes. Neither ever writes back to the kit.

---

## 5 · Brand Kit — canonical in `~/research-console/brand/kits/`, symlinked into `deploy/assets/kits`

`kit.schema.json` (draft-07) with tabs, each `{preset: id, ...overrides}`:

| tab | fields | presets live in |
|---|---|---|
| identity | channel name, avatar, logo, handle | kit json |
| post | format (`hook-first`, `listicle`, `qa`, `quote-card`, `thread`), length, emoji density, hashtag count | `presets/post/*.json` (prompt fragments) |
| card | ratio, theme (light/dark/pastel/newspaper), font, radius, title size, highlight colour → maps 1:1 onto `/api/image/card` params | `presets/card/*.json` |
| voice | provider (`edge-tts` today; `bao` later), voice id, rate, pause ms | `presets/voice/*.json` |
| captions | preset key from `deploy/assets/caption-presets.json` (ONE file, two readers — keep) + the four numeric knobs in `app/lib/captionPresets.ts` | already exists |
| frame | 9:16 / 1:1 / 4:5, layout (`card-top`, `card-centre`, `continuous`), background set | `presets/frame/*.json` |
| stickers | set id (the Desoul mascot set first), where (cover/intro/reactions) | `presets/stickers/*.json` |
| signature | floating handle on/off, watermark on/off | kit json |
| music | tier (`none`, `soft`, `groove`) | existing make-reel option |

A test validates every preset file against the schema. **Presets are content:** text ones are
written by hand; visual ones (card themes, sticker sets) are generated the way `scripts/artgen.py`
does in AILP and curated. Two kits ship: `desoul-posting-vi` (today's look, so nothing regresses)
and `demo` (deliberately different, so the difference is visible in a screenshot).

---

## 6 · Screens (drawings in the HTML plan)

- **New** `/studio` — one box: paste a URL / pick a source / write text; a channel picker; the
  four **modes** as chips above the box (`Đọc bài` · `Viết lời đọc` · `Lồng tiếng` · `Video dọc`,
  = `mode` in §4); a gear that opens the **override drawer** for this run only (kit pick,
  duration band, comment mode auto/manual, review-before-render = `auto_continue` off, intro
  on/off, layout on/off, music tier, style — every toggle maps to a flag `startRenderJob`
  already accepts; nothing here needs the engine changed). Below, *Suggestions* (gold posts of
  this channel with no `studio_assets` of kind `reel`) and *Recent*.
- **Wizard** `/studio/channels/new` — 5 steps: source type → **fetch test** (shows 3 real items or
  the error) → what to make (post / image / reel) → kit → done. Each step is its own screen with a
  progress rail; the fetch test is the gate that stops a broken source from becoming a channel.
- **Kit editor** `/studio/kits/[id]` — preview canvas centre (the card at 9:16 with sample text),
  **bottom tab strip** (one tab per §5 row, each with a one-line summary of its state), presets
  gallery + custom fields on the right.
- **Run page** `/studio/runs/[id]` — the editorial page. Left: steps top to bottom, each with its
  preview inline (draft text editable with the compliance chip; the card; the **scene list**: the
  post first, then each selected comment as `CẢNH #n · <score> likes · Text TTS` with the original
  text on hover, per-scene edit and a `Nghe thử` TTS button, nested replies indented), cost, and
  **Continue** / **Re-run this step**. Under the scenes, the **comment pool** — `COMMENT KHÁC · n`
  — every comment the source returned with its score, a checkbox to promote it to a scene, and
  `Ẩn không chọn`. Sources with comments: Reddit (score), own-account Threads (likes), gold rows
  (`comment_1..3`, no score). Right: the player or the card, the run's status, download, and the
  override drawer's current values with *Sửa*. The same page serves a post-only run (stops after
  `image`) and a reel run.
- **Library** `/studio/library` — grouped by day; search by id / source link / channel; sort;
  grid or list; refresh; a thumbnail's tooltip shows file name, size and status; download through
  the existing `/api/video/file`. *Suggestions* strip at the bottom, same query as New.
- **Assets** `/studio/assets` — the owner's own backgrounds, stickers and music (`studio_media`,
  quota 50 MB / 30 files shown as a bar). Kit tabs `frame`, `stickers`, `music` list these next to
  the shipped presets. Uploads only; no Pinterest / MyInstants fetching (licensing).
- **Guide** `/studio/guide` — task cards, each linking to a screen and its tour.
- **Tour** — `lib/studio/tours/<screen>.json`: `[{target, title, body}]`; a `<Tour>` component
  runs it once per browser (`localStorage`), with Skip / Back / Next, exactly ThreadViral's
  "Tổng quan 1/8" card. Copy is Vietnamese, the app's language.

Look: the existing Desoul Posting skin (paper, pen outline + hard offset, one green accent, mono
numbers) — reuse `app/globals.css` tokens; add nothing that is not already a token.

---

## 7 · Tier and demo — `lib/studio/tier.ts`

`tier()` returns the first of: a signed `desoul_tier` cookie · the Cloudflare Access identity
header (`Cf-Access-Authenticated-User-Email` → owner) · `process.env.DESOUL_TIER` · `'owner'`.
`can(tier, feature)` is a table, not conditions scattered in components. Features today:
`run`, `spend`, `edit_kit`, `publish`. `demo` has `run` only, and every step of a demo channel
returns `lib/studio/demo/seed.ts` fixtures — pre-made text, a committed card PNG, a committed
short MP4 — so the flow is complete and free. `STUDIO_ENABLED` unset → `/studio` 404s.

---

## 8 · Slices — in order, each a commit, each ends in STOP

**Slice 0 · Shell, tier, demo.** `layout.tsx` with the sidebar and gate; `db.ts` tables;
`tier.ts` + tests; the demo channel + kit seeded on first load; vitest + Playwright wired
(`npm test` runs both; screenshots to `tests/shots/`). **Done when** `/studio` on :3001 shows the
shell and the demo channel; `stat .next/BUILD_ID` on :3000 predates the commit; suite green.
STOP: screenshot of the shell.

**Slice 1 · Step contract + run page, fake engines.** `steps/types.ts`, `registry.ts`, `runs.ts`
(state machine: create → preview → run → gate → continue; resume from failed step), the run page
**with the comment pool and scene selection** (the demo fixture carries 5 comments with scores),
the **override drawer** on New and on the run page (merged over the kit; a test proves the kit row
is unchanged after a run with overrides), the four **modes** as run templates, the demo source
walking all four steps with fixtures. Unit tests: a gate that never ran blocks
Continue; a failed step writes its row; resume re-runs only that step. **Done when** a demo run
goes end to end on :3001 and the screenshot shows preview + cost + Continue on every step.
STOP: the run page screenshot and the test names.

**Slice 2 · Real sources + wizard.** `sources/gold.ts` (reads `gold_content` via `app/lib/lake.ts`
for a market; `comment_1..3` become the pool), `article.ts` (the body extractor `app/lib/crawl.ts`
already has — import, do not copy), `text.ts`, `reddit.ts` (`<post url>.json`, public; top-level
comments with `score` become the pool, replies nested one level), `threads.ts` (own account via
the Threads API token in env, replies with like counts; absent token → the source is listed as
"needs a token", not hidden). Every source returns the same shape: `{item, comments[]}`.
The wizard with the fetch test. **Done when** a channel over the `us` market's gold posts lists
real items, a Reddit URL and an article URL each show 3 items, and a run's fetch step shows the
chosen item. STOP: wizard screenshots, one per step.

**Slice 3 · Real engines behind the contract.** `draft` (gold pass-through; `lib/gold.ts`
extraction for the others — the existing route must keep working, prove it with its current
behaviour before and after), `gates/compliance.ts`, `image` via `/api/image/card`, `reel` via
`startRenderJob` with progress from `STEP_ORDER`, `gates/layout.ts`, `gates/budget.ts`.
**Done when** one real gold post → post text with the chip → card PNG → MP4 in the library, from
:3001, and the diff against protected files is empty. STOP: the six artefacts and the diff.

**Slice 4 · Brand Kit.** Schema + two kits + presets; the symlink; the editor with the tab strip;
`image` and `reel` read the kit (card params, caption preset, voice, frame). **Done when** the two
kits render the same post differently and both screenshots are in the suite; every preset
validates. STOP: the two cards side by side.

**Slice 5 · Library, assets, tour, guide.** Library with search / sort / grid-list / refresh /
tooltips; the Assets page with uploads and the quota bar, wired into the `frame`, `stickers` and
`music` kit tabs; stickers on the cover and intro frame applied as a PNG overlay in a small
`lib/studio/steps/overlay.ts` that runs **after** `make-reel.py` (beside the engine, ffmpeg
overlay — never inside it). **Done when** the library groups by day, finds a run by its source
link and downloads; an uploaded background shows in the kit tab and in a rendered reel; the tour
runs once and not twice; the guide's cards open the right screens. STOP: screenshots.

**Slice 5b · Telegram delivery, opt-in.** A bot token in env; `Settings → Thông báo` connects a
chat by a one-time code; a finished reel and any failed step are sent to that chat. Behind
`can(tier, 'deliver')`; off by default. **Done when** a run's MP4 arrives in the owner's chat and
a forced failure arrives as a message naming the step. STOP: the two messages.

**Slice 6 · The hand-over, additive.** `PostCard.tsx` gains one link, *Mở trong Studio*, that
creates a run for that gold post and opens it. The old *Tạo Video* modal stays. **Done when** the
link works and the old modal still does. STOP — the owner decides whether the old modal retires.

**Slice 7 · Layer editor — conditional.** ThreadViral's "Chỉnh lớp": a canvas per Hook / Body /
Intro with draggable text, image, shape and banner layers, lock, group, undo. It starts **only if**,
after two weeks of real use, the owner names a layout the frame presets cannot express. Until then
the `frame` tab's presets are the layout system. If it starts: layers are stored in the kit as a
list `{type, x, y, w, h, z, props}` in frame-relative units, rendered by the same overlay step as
Slice 5 — the engine still is not edited.

---

## 9 · Traps this repo already paid for

- **Committing does not deploy.** :3000 serves `.next/`; `launchctl kickstart -k
  gui/501/com.immigration.web` rebuilds only at start. Check `stat .next/BUILD_ID` before calling a
  route broken — and in this plan that lag is the safety rail: do not kick the service.
- `python3` is `/opt/homebrew/bin/python3` and ffmpeg needs `/opt/homebrew/bin` on PATH — copy
  the spawn pattern in `app/lib/videoJobs.ts`, never `child_process` by hand.
- DuckDB is single-writer: only the Next server opens `data/lake.duckdb`. No script, no test opens
  it — tests use fixtures.
- `edge-tts` occasionally raises `NoAudioReceived`; the reel step retries with backoff and records
  the retry.
- Every generated post passes the Meta compliance rule (repo CLAUDE.md). The gate is not optional
  and its `checked` count must be > 0 for Continue to enable.
- `data/web.log` has no timestamps; find the last `✓ Ready in` before reading an error as recent.
- This Mac has no `timeout`; `timeout 25 cmd | grep -c x` prints `0` and reads like "not found".
  A pipe masks the exit code: redirect to a file when the result decides a commit.
- Dân trí is disabled on purpose. Do not "fix" feed health by re-enabling it.
- 506 green tests once missed three layout defects a single screenshot caught. Every screen gets
  a screenshot in the suite, and the executor looks at it before STOP.
- Three consecutive edits to one file warn, five block — batch through a script that `assert`s.

---

## 10 · Feature map — every ThreadViral feature on the 20 screens, and where it lands

`now` = a slice in §8 · `preset` = content in a kit tab · `later` = a named slice · `engine` =
would need `make-reel.py` changed (a second plan) · `never` = not for this owner, with the reason.

| ThreadViral | Ours | Where |
|---|---|---|
| Paste a Threads link | paste URL / pick source / write text | now · S0 |
| Source type + kit dropdowns on the create box | same | now · S0 |
| 4 modes: Đọc bài · Viết lời đọc · Lồng tiếng · Video dọc | `mode` on the run | now · S1 |
| Gợi ý từ kho nguồn · Kết quả gần đây | Suggestions · Recent | now · S0 |
| Per-video drawer: kit, duration, comment mode, review-before-render | override drawer | now · S1 |
| Drawer toggles: intro, layout, music, style | flags `startRenderJob` already takes | now · S1/S3 |
| Drawer: quality HD/30fps | one quality | never — nothing to choose |
| Drawer: face blur · SFX · reaction GIFs · outro CTA | — | engine |
| Drawer: read the title before the caption | draft composes title first | now · S3 |
| Kit dropdown · Kit mới · Xem trước / Chỉnh lớp | kit list · editor · preview | now · S4 (layer editor: S7) |
| Thương hiệu: name, avatar, logo, hashtags, topics | identity + post tabs | now · S4 |
| Thương hiệu: fetch TikTok profile · auto-post channel | — · publish step | never (no TikTok tool) · later |
| Nội dung: language + translate · narration mode · comment pick · max length | VI only now · mode · pool · budget gate | later (AILP has EN/VI) · now · now · now |
| Giọng đọc: provider, voice, speed, pause, test read | edge-tts params; `bao` later | now · S4 |
| Giọng đọc: a different voice per sentence | — (one TTS call per reel, by design) | engine |
| Khung hình: 3 layouts · background library · own backgrounds | frame presets · shipped set · Assets | preset · S5 |
| Ảnh chụp bài viết: group/single, font size, width %, position %, light/dark, radius, font | `/api/image/card` params | now · S4 |
| Ảnh chụp: image zooms out after it is read | — | engine |
| Phụ đề: effect toggle, presets wall, custom | `caption-presets.json` (exists) + wall | now · S4 |
| Chữ ký trôi (DVD) · watermark chìm | — · static overlay | engine · S5 overlay |
| Nhãn dán: sticker set, cover, intro, fine-tune | overlay step + Assets | later · S5 |
| Layer editor (Chỉnh lớp) | frame presets; canvas only if presets fail | later · S7 |
| Review page: scenes with likes, Text gốc, Nghe thoại, nested replies | run page scene list | now · S1–S3 |
| Review page: COMMENT KHÁC pool · Ẩn không chọn · re-render | comment pool · re-run step | now · S1–S3 |
| Library: search, sort, grid/list, refresh, today, tooltip | same | now · S5 |
| Library: videos kept 24 h | kept — it is our disk | never |
| Kho tài nguyên: bg / video bg / sticker / effects / music, quota | Assets page (bg, sticker, music) | later · S5 |
| Tiện ích: Chrome extension, render from Threads | — (our sources are crawled) | never |
| Tiện ích: connect TikTok/FB session for auto-post | publish step, sanctioned APIs only | later |
| Tiện ích: grab Pinterest stickers / MyInstants sounds | own uploads | never (licensing) |
| Credits · Nạp credit · credit badge | cost in $ next to every step | now · S1 (no billing) |
| Notifications bell | — | later |
| Settings: profile, language, defaults | minimal | now · S0/S4 |
| Settings: Telegram | delivery | later · S5b |
| Settings: email notify · referral · password · logout-all · delete account | — (owner behind Access) | never |
| Hướng dẫn hub · Bắt đầu tour · 8-step tour | guide + tour spec | now · S5 |
| Support chat bubble | — | never |
