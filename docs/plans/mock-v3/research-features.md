# Studio feature gap research — news post → social video → publish

Inventory read: `docs/plans/2026-09-22-studio-editorial-ux.md` §10 (ThreadViral feature map) and
`docs/plans/2026-09-22-studio-v2.md` §4 (option catalogue). Everything marked **have** below is
already `now`/`preset`/`keep`/`add`/`later`/`engine` in one of those two tables — only items
absent from both are new findings.

## A. Feature table by stage

| Feature | Who has it | Why it matters for a solo VN news operator | Verdict |
|---|---|---|---|
| **Intake/sources** |
| Paste URL / pick crawled source / write text | Lumen5, Pictory (blog-to-video), ThreadViral | Core intake path | have |
| RSS/multi-market auto-crawl | Publer (RSS automation), Metricool | ASP already does this in its own pipeline, not Studio | have (own pipeline) |
| Suggestions from source pool / recent | ThreadViral | have |
| **Writing** |
| Read-verbatim vs AI-rewrite mode | ThreadViral, Pictory (summary editor) | have |
| Translate non-VI source before narration | ThreadViral (dịch sang VI), invideo AI (50+ lang) | US/UK/AU/DE/IN markets are non-VI sources | have (add, planned) |
| Script/hook regenerate with tone control | invideo AI, Predis.ai (12 tones) | — | should (cheap: reuse existing LLM call, add a "viết lại" button) |
| **Image/card** |
| Card theme (light/dark/pastel), font/size/position params | ThreadViral | have |
| Custom cover image / frame-offset thumbnail | ThreadViral (Ảnh bìa riêng); IG Graph API `thumb_offset`/`cover_url` | Meta's own Reels publish API expects exactly this control | have (add, planned) |
| **Video** |
| Auto-reframe to other aspect ratios | Opus Clip, Vizard (9:16/1:1/16:9 from one source) | Low value here — the reel is already authored at 9:16 for all four target platforms | could |
| B-roll insertion, eye-contact fix, auto-zoom | Submagic, Captions.ai, Opus Clip | Built for talking-head footage; ASP's format is a card burned into a reel, no camera subject | never — format mismatch |
| Virality/hook score on a rendered clip | Opus Clip (0–99 score), Submagic | Could help a solo operator triage which of N queued reels to hand-review first | could |
| Layer editor (drag/reorder overlays) | ThreadViral (Chỉnh lớp) | have (shipped per recent commits) |
| **Voice** |
| edge-tts voice/speed/pause + sample playback | ThreadViral | have |
| Voice cloning (own narrator) | Fliki, invideo AI, Captions.ai (dubbing) | have (`bao` clone, later) |
| Multi-language dub of one render | Fliki (80+ lang), Captions.ai (28 lang dub) | Only relevant once EN output ships (AILP already has this pattern) | later, out of ASP scope for now |
| **Publish/schedule** |
| Calendar view + specific date/time scheduling | Buffer, Later, Metricool, Publer | **Absent from both inventory tables** — ThreadViral itself is a render tool, not a scheduler, so nothing here was ever copied | **must** |
| Queue / "next available slot" auto-fill | Buffer (queue + prioritize) | Six market pages + a crime series need a predictable cadence without manual per-post time-picking | should |
| Multi-page/multi-market target picker per render | Buffer, Later, Metricool, Publer (core multi-account) | ASP runs US/UK/AU/DE/IN/VN pages — nothing in either table names a destination picker | **must** |
| First-comment auto-post (source link/CTA) | Buffer, Publer, Later; Meta Graph API supports it natively | Keeps caption clean while still citing the source — this project's own compliance rule already requires a citation | should |
| Best-time-to-post suggestion | Buffer (Posting Slots), Metricool | Needs analytics data first (see below); low cost once that exists | could |
| Cross-post fan-out (one render → FB+IG+TikTok+YT in one action) | Buffer/Later/Metricool (native multi-platform) | Owner names IG/TikTok/YT Shorts as "natural next targets" — nothing fans a single render out today | should |
| Content recycling / evergreen re-post | Publer (recycling, spintax) | News is not evergreen (never); the crime-series serial is | could — crime-series only |
| Approval workflow (draft → reviewer → post) | Metricool (Advanced plan), Publer | Solo operator, no second approver | never — no team |
| **Library/organise** |
| Search/sort/grid/list, 24h local retention | ThreadViral | have |
| Asset library (bg/sticker/music) with quota | ThreadViral (Kho tài nguyên) | have (later) |
| **Brand kit** |
| Channel identity, hashtags, topics, kit switching | ThreadViral | have |
| Per-platform brand-kit variant (e.g. shorter watermark for TikTok) | none of the researched tools do this distinctly — brand kits are platform-agnostic everywhere surveyed | — | could, low priority |
| **Review/QA** |
| Scene list with editable TTS text, nested replies, re-render | ThreadViral | have |
| Caption/hashtag platform-limit linter (warn before publish) | Buffer/Later show live char counts per platform | Nothing stops a draft from exceeding IG's 2,200-char cap or the ~125-char fold, or TikTok's 2,200; cheap guardrail | should |
| Pre-publish per-platform preview (FB feed vs IG grid vs TikTok FYP mock) | Buffer, Later, Metricool | Catches a caption cutoff or cover crop before it's live | should |
| **Analytics** |
| Post performance (views/reach/reactions) pulled back per reel | Metricool (full analytics), Buffer, Later | **Completely absent from both inventory tables** — no feedback loop from "published" back into which markets/topics to keep crawling | **must** |
| Custom report / Looker export | Metricool | No second stakeholder to report to | never — solo op |
| **Automation/notifications** |
| Notifications bell (in-app) | ThreadViral | have (later) |
| Render/publish failure alert (Telegram/email) | none of the video tools do this; scheduler tools (Buffer/Publer) alert on failed posts | 4-hourly unattended pipeline + unattended publish step needs a failure signal, not silent drift | **must** |
| Auto-publish-on-render-complete toggle | none of the video generators auto-publish; the scheduler tools assume you already uploaded the asset | Closes the loop between `make-reel.py` finishing and Graph API publish without a manual re-open | should |

## B. Top 12 additions, ranked

1. **Calendar + specific date/time scheduling** — the single biggest gap; ThreadViral was never a scheduler, so nothing here was copied, but it's the baseline expectation of every publishing tool surveyed. Next.js layer (new schedule table + a cron/worker that calls Graph API at time X); no engine change.
2. **Multi-page/market target picker per render** — 6 FB pages need a destination, not just a render. Next.js layer.
3. **Post-performance analytics pull-back** — no feedback loop exists anywhere in the current design; without it the crawler/topic-selection logic runs blind. Next.js layer (Graph API Insights calls + a DB table + a dashboard view).
4. **Render/publish failure alerts** — unattended 4-hourly pipeline plus an unattended publish step with zero alerting today. Next.js layer, reuses the already-planned Telegram channel as the alert transport.
5. **Cross-post fan-out to IG/TikTok/YT Shorts** — owner already names these as next targets; without fan-out each is a separate manual click. Next.js layer only (calls each platform's existing publish API; the 9:16 render itself needs no engine change).
6. **First-comment auto-post for source citation** — standard on every scheduler surveyed, and directly reusable for this project's own compliance rule (cite the source). Next.js layer (one extra Graph API call after publish).
7. **Caption/hashtag platform-limit linter** — cheap guardrail, prevents an IG 2,200-char truncation or TikTok fold surprise. Next.js layer (client-side validation using each platform's published limits).
8. **Auto-publish-on-render-complete toggle** — closes render → live without a manual step. Needs both: `make-reel.py` to emit a completion signal/webhook, Next.js to act on it.
9. **Pre-publish per-platform preview** — Buffer/Later/Metricool all show this; catches a bad crop or cutoff before it's public. Next.js layer (a mock render of the feed/grid/FYP frame).
10. **Queue / "next slot" auto-fill** — reduces per-post manual time-picking across six pages. Next.js layer, depends on #1 existing first.
11. **TikTok Direct Post audit-status flag** — unaudited TikTok API clients are capped at 5 users/24h and SELF_ONLY visibility; if TikTok publishing ships before the audit, reels post but stay invisible. Next.js layer (a visible settings/status flag, not code on the engine).
12. **Evergreen recycling for the crime-series (kỳ án) only** — Publer's recycling feature is built for exactly this kind of timeless content, unlike the immigration-news items which go stale in hours. Next.js layer, scoped to one content type.

## C. Platform constraints

| Platform | Aspect ratio | Max duration | Caption limit | API posting notes |
|---|---|---|---|---|
| **FB Reels** | 9:16, 1080×1920 (min 540×960) | Graph API upload spec: MP4/H.264/AAC, 24–60 fps, 3–90 s; the FB app itself has "no length/format restrictions" per Meta, but the publish endpoint follows the 3–90 s spec | No documented Reels-specific cap found (general FB post text ~63,206 chars) | Audio track mandatory (silent uploads rejected); Reels publish endpoint capped at 30 published Reels per rolling 24 h window — [postfa.st](https://postfa.st/sizes/facebook/reels), [crowbert](https://www.crowbert.com/blog/facebook-video-format-and-size), [posteverywhere](https://posteverywhere.ai/social-media-terms/facebook-reels) |
| **IG Reels** | 9:16, 1080×1920 recommended; accepted 0.01:1–10:1, non-9:16 letterboxed | 15 min max (IG Graph API media cap); Meta itself recommends <3 min for reach to new audiences | 2,200 chars; ~125 shown before "more" fold | 3-step flow: POST `/{ig-user-id}/media` (`media_type=REELS`, public `video_url`) → poll `/{container-id}?fields=status_code` until `FINISHED` → POST `/{ig-user-id}/media_publish`; cover via `cover_url` (wins) or `thumb_offset` in ms (default 0) — [Postproxy guide](https://postproxy.dev/blog/instagram-reels-api-publishing-guide/), [Meta IG Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/), [Phyllo Reels API guide](https://www.getphyllo.com/post/a-complete-guide-to-the-instagram-reels-api) |
| **TikTok** | 9:16 native, 1080×1920 (also accepts 16:9, 1:1) | Up to 60 min pre-recorded upload (in-app record cap 10 min) | 2,200 chars (first ~150 matter most for FYP); hashtags up to 70 chars each, recommend <18 | Content Posting API Direct Post: **unaudited** API clients are restricted to `SELF_ONLY` visibility and max 5 posting users per 24 h; must pass TikTok's audit to unlock public posting — [TikTok dev docs: Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [Vorp Labs summary](https://vorplabs.com/agent-tools/tiktok-content-posting-api) |
| **YT Shorts** | 9:16 recommended; qualifies at ≥1:1 (as tall as wide) | 3 min (180 s) as of the Oct 2024 change (was 60 s) | Title ~100 chars; description up to 5,000 chars | YouTube Data API v3: 10,000 free quota units/day; video `insert` (upload) now costs ~100 units (down from ~1,600 as of Dec 2025); reads ~1 unit, writes ~50 units — plenty of daily headroom for a solo operator's upload volume, but a `search.list` call alone burns 100 units — [YouTube Shorts 3-min change](https://support.google.com/youtube/answer/15424877?hl=en), [YouTube API quota guide](https://www.getphyllo.com/post/youtube-api-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota), [quota cost reference](https://developers.google.com/youtube/v3/determine_quota_cost) |

## D. Contradicts current direction?

Nothing found contradicts a feature the owner explicitly marked **never** — the "never" calls
(Chrome extension/render-from-Threads, grabbing Pinterest stickers/MyInstants sounds, single
video quality, team/approval workflow, email notify/referral/password screens) all hold up:
none of the researched competitors' equivalents apply to a single-operator, crawl-sourced,
compliance-gated pipeline.

The real finding is a **category gap, not a contradiction**: publish scheduling and analytics
are core to every dedicated social-publishing tool surveyed (Buffer, Later, Metricool, Publer)
and completely absent from both inventory tables — not because the owner rejected them, but
because ThreadViral (the thing being copied) is a *render* tool, not a *scheduler*, so a
calendar/queue/multi-account picker/analytics dashboard was never on ThreadViral's 20 screens to
copy from in the first place. Given the owner already runs six market pages and names
Telegram/IG/TikTok/YT Shorts as near-term targets, this is the one place where copying
ThreadViral 1:1 will visibly under-serve the owner's actual operation.
