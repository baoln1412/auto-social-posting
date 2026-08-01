# Immigration content tool — setup

A personal, local-first tool that crawls immigration news, lets an LLM filter +
generate **Vietnamese** content per market, and displays it on a private site
(shared to your other devices over Tailscale).

## Architecture

```
Claude Code scheduled task (every 4h, your subscription)  ── the LLM brain
   │  curl localhost:3000   (filter + generate)
   ▼
Next.js (always-on)  ── sole owner of the local databases
   ├─ SQLite  data/local.db     markets · feeds · per-market context
   └─ DuckDB  data/lake.duckdb  bronze_news → silver_immigration → gold_content → audit_runs
```

- **Bronze** = raw crawled news (24h pull every 4h, deduped by URL, 7-day retention).
- **Silver** = articles the LLM judged immigration-relevant (filter + same-event
  dedup are done by the LLM, not keywords).
- **Gold** = LLM-generated Vietnamese content (what the site shows).
- **Audit** view (under Analytics) shows per-source bronze/silver counts + runs.

> Why a Claude Code scheduled task and not the Agent SDK? Anthropic prohibits using
> a Pro/Max **subscription** with the Agent SDK; the first-party Claude Code CLI is
> allowed. So the LLM steps run via the CLI locally. (Data never leaves your Mac.)

## One-time setup

### 1. Configure markets
Open the site → add a market (country code + official name) → set its **Market
Content Context** (glossary, wording rules, writing style; language defaults to
`vi`) and add **feeds** (Sources) from the approved list (see SOP §7). The Guardian
US-immigration RSS is already added as an example.

Approved sources: The Guardian, Newsweek, NYT, Fox News Digital, Times of India,
SWR Aktuell, Yahoo News/Scout, Yahoo奇摩, China Times, Dân trí, official police
announcements. (Recorded in `.claude/skills/immigration-pipeline/CONTENT_SOP.md` —
paste your full content SOP + demo examples there to control output formatting.)

### 2. Social-media writing skills — DONE (vendored)
The upstream `blacktwist/social-media-skills` marketplace.json uses an invalid
schema, so the official installer rejects it. The needed skills were copied
directly into `.claude/skills/` instead: `post-writer-sms`, `hook-writer-sms`,
`social-media-context-sms`. (The pipeline also works without them.)

### 3 & 4. Always-on server + 4h schedule — DONE (launchd)

> ⚠️ macOS blocks LaunchAgents from reading `~/Documents` (TCC). This project was
> therefore moved to `~/auto-social-posting` (not protected). Keep it here.

Both agents are installed in `~/Library/LaunchAgents/` and loaded:
- `com.immigration.web` — runs `deploy/start-web.sh` (prod `next start` on 0.0.0.0:3000),
  `RunAtLoad` + `KeepAlive` (restarts on crash/login). Logs: `data/web.log`.
- `com.immigration.pipeline` — runs `deploy/run-pipeline.sh` →
  `claude -p "/immigration-pipeline"` headless every 4h. Logs: `data/pipeline.log`.

Manage them:
```
launchctl list | grep immigration                 # status
launchctl start com.immigration.pipeline           # run a cycle now
launchctl unload ~/Library/LaunchAgents/com.immigration.pipeline.plist   # pause schedule
```
- You're on **Max** (15 Claude Code runs/day) so the 4h cadence (6/day) is fine.
  On Pro, change the plist `StartInterval` to `21600` (6h).

## Running it manually
- **Crawl only (bronze):** the "🚀 Crawl News (bronze)" button on the site, or
  `curl -X POST localhost:3000/api/pipeline/crawl` (add `?hours=168` for a first backfill).
- **Full cycle (filter + generate):** in Claude Code, run `/immigration-pipeline`.

## Notes
- Mac must stay awake for the schedule (System Settings → Energy → prevent sleep,
  or `caffeinate`).
- Facebook posting is hidden (display-only); code kept behind `ENABLE_PUBLISHING`
  in `app/components/PostCard.tsx`.
- The legacy Gemini routes (`/api/pipeline`, `/api/fetch-news`, `/api/cron/fetch`,
  `/api/chat`) remain on disk but are no longer the primary flow.
