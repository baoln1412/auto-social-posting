#!/bin/zsh
# ONE-TIME (2026-07-08): derive language-correct keyword pre-filters from ~1 week
# of LLM verdicts, then write a PROPOSAL for the user to review. Local job — needs
# the Next.js server (localhost:3000) running, since it owns the DuckDB lake.
# Scheduled by com.immigration.keyword-analysis.plist; self-removes after one run.
export PATH="/Users/nguyenbaole/.local/bin:/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

LABEL="com.immigration.keyword-analysis"
PLIST="/Users/nguyenbaole/Library/LaunchAgents/${LABEL}.plist"
LOG="/Users/nguyenbaole/auto-social-posting/data/keyword-analysis.log"

claude -p "Keyword pre-filter learning pass (immigration pipeline). Read the project memory note keyword-prefilter-learning-plan.md first. The Next.js server at http://localhost:3000 owns the DuckDB lake — query it over HTTP, never open the DB file. Goal: propose per-market, LANGUAGE-CORRECT tier1/tier2 immigration keywords derived from a week of silver verdicts, so the cheap keyword pre-filter can be turned on to save tokens.
Steps: (1) Pull the accumulated silver_immigration rows per market (title, description, category) as POSITIVE examples, and the classified bronze_news rows with no silver row as NEGATIVES (these prune at 7 days — that is why this runs on day 6). (2) Each market is one source language (English: US/UK/India; German: SWR; Chinese: Yahoo奇摩/China Times; Vietnamese: Dân trí). For each market, extract the most salient immigration terms IN THAT MARKET'S LANGUAGE that separate positives from negatives → tier1 (high-signal) + tier2. (3) Do NOT enable anything — write a clear proposal to data/keyword-proposal.md: per market, the suggested keywordConfig {tier1, tier2, minScore}, sample matches, and a one-line risk note. Leave crimeKeywords/useCrimeFilter unset (legacy). The user will review data/keyword-proposal.md and decide whether to apply via PATCH /api/pages." \
  --model claude-sonnet-5 \
  --permission-mode bypassPermissions \
  >> "$LOG" 2>&1

# One-shot teardown: after this script exits, unload + delete the job so it does
# not fire again next July 8. Backgrounded so the run finishes cleanly first.
nohup zsh -c "sleep 10; launchctl bootout gui/501/${LABEL} 2>/dev/null; rm -f '${PLIST}'" >/dev/null 2>&1 &
