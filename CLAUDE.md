# auto-social-posting

## Facebook / Social-Media Post Compliance (ALL post-generating work here)

For ANY content posted to Facebook/Instagram/Meta (not just immigration content), the
**Meta Community Standards are the compliance standard to check and comply with BEFORE
generating a post**: https://transparency.meta.com/policies/community-standards/

Key facts to apply:
- **Bans come from Community Standards (organic content), NOT the monetization/ads
  policies.** A post can be demonetized yet perfectly allowed to stay up — don't
  confuse the two. Monetization eligibility is a separate, lower-stakes layer.
- **News reporting / awareness / condemnation is a protected carve-out** across the
  sensitive standards (Human Exploitation, Coordinating Harm, Dangerous Orgs).
  Reporting on a crime ≠ facilitating it.
- **Every sensitive post (trafficking, smuggling, drugs, weapons, crime) must:
  (1) cite a source, (2) read as report/condemnation — never an offer or how-to,
  (3) contain zero contact info, prices, or routes.** Fail any one → hold the post.
- **Criticize policy, never dehumanize people.** Migrants/refugees/ethnic/national/
  religious groups are protected under Hateful Conduct; attack the policy, not the
  group. No "invasion/flood/vermin"-style framing.
- **Accuracy protects reach:** false claims get fact-check labels + down-ranking
  even when not removed.

When building a post-generation pipeline, bake a self-check against these into the
generation step (screen each draft against the 3-part rule above before saving).

The marketing skills (`.claude/skills/`, from coreyhaines31/marketingskills) — especially
`social`, `ads`, `launch` — must run their output through this compliance gate before a
draft is saved.

## Skills — 53 are installed, ~8 apply to this page

Almost none of this was written for us. `.claude/skills/` holds **47 symlinks into
`vendor/marketingskills/`** (a vendored clone of coreyhaines31/marketingskills), one
`hallmark` from `skills-lock.json`, and five real directories. The pack is B2B SaaS growth
advice; this repo is a Vietnamese-language Facebook page publishing immigration news and
true-crime serials. Sitting next to each other does not make them related.

**This repo's own two — these own generation, and a marketing skill never replaces them:**

- `immigration-pipeline` — one full cycle: crawl → LLM filter/dedup → LLM generate VI content
  over the medallion lake. The 4-hourly schedule runs it (`deploy/run-pipeline.sh`).
- `crime-series` — one case → a 3-part VI kỳ án, saved to the lake (`deploy/run-crime.sh`).

Both are git-tracked; everything else in that directory is not, so a fresh clone gets these
two and nothing else. If a skill's advice conflicts with what these do, they win.

**Worth reaching for, by name — the pack does not fire on its own:**

`copywriting` and `copy-editing` (line-level VI drafting), `marketing-psychology` and
`hook-writer-sms` (openings — the measured drop-off point), `content-strategy` (pillar and
cadence decisions), `social` (platform mechanics), `image` and `ad-creative` (thumbnails and
card art), `video` (reel structure), `analytics` (reading page numbers).

Use them to shape the **prompt** inside the pipeline. Do not let one author a post directly:
the pipeline writes to the lake and the compliance gate above sits in that path.

**`/de-slop` before any English prose ships — but NOT on the Vietnamese posts.** Its tell catalog
is English by construction (`delve`, `tapestry`, em-dashes, Title Case headings, Wh-question
openers), so running it against VI content grades the wrong language and would "fix" prose it
cannot read. It applies to what gets written *about* this project: SOP files, this file, briefs,
commit bodies, and anything posted in English. VI post quality is the pipeline's own generation
prompt plus the compliance gate above, not this skill.

Reach for it by name. It is a global skill, so it is available in every session here, but nothing
makes it fire on its own — a rewrite is something a session will just do inline, and then the
skill never gets a turn.

**The rest of the pack does not apply here** and reaching for it wastes a turn — `cold-email`,
`prospecting`, `revops`, `sales-enablement`, `paywalls`, `pricing`, `offers`, `signup`,
`onboarding`, `churn-prevention`, `referrals`, `free-tools`, `lead-magnets`, `aso`, `cro`,
`ab-testing`, `programmatic-seo`, `directory-submissions`, `site-architecture`, `schema`.
There is no product, no funnel, no signup and no site to A/B test.

**`*-sms` is a partial install and its cross-references dangle.** `hook-writer-sms`,
`post-writer-sms` and `social-media-context-sms` each point at `thread-writer-sms`,
`carousel-writer-sms` and `caption-writer-sms`, none of which are here. Follow one of those
pointers and you get nothing. `social-media-context-sms` also wants to write
`.agents/social-media-context-sms.md` describing voice and audience — that would be a second,
competing source of truth against this file and the pipeline's own prompts. Don't run it.

## Session hygiene (this project runs hot — 50% of cross-project volume, 206× cache amplification)

- **grep before Read, always.** Checking a field in reel metadata, pipeline state, or a
  catalog YAML → `rtk grep`/`grep` for it first. Only fall back to a full `Read` when you're
  about to make a precise multi-line edit and need exact surrounding context — not to "just
  check something." A full-file read inflates cache for every subsequent turn in the session.
- **`/compact` by turn 8–10**, not the global 60-minute default. This project's sessions blow
  up context fast (long SOP files, log tails, multi-file edits) — the global cadence is too
  loose here specifically.
- **Sonnet is the default model for interactive work in this repo too**, not just the
  scheduled jobs (`run-crime.sh`/`run-pipeline.sh`/`keyword-analysis.sh` are already pinned to
  `claude-sonnet-5` — nothing to change there). Reel generation, caption tweaks, SOP edits,
  routine pipeline debugging: Sonnet. Reserve Opus for genuine model-selection/architecture
  comparisons (e.g. evaluating a different LLM vendor for the pipeline) or multi-agent
  orchestration — not day-to-day edits.
- **Batch related reel/prompt iterations into one session** rather than one short session per
  tweak — each new session re-pays the fixed cost of loading project context from scratch.
