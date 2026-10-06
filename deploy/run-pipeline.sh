#!/bin/zsh
# Runs ONE immigration-pipeline cycle via the first-party Claude Code CLI
# (subscription-billed, local). Used by com.immigration.pipeline.plist at 06/12/18.
#
# Requires the Next.js server to be running (it owns the DuckDB lake).
export PATH="/Users/nguyenbaole/.local/bin:/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

# Single-run lock so a manual trigger (Settings button → /api/pipeline/run) and
# the 4h schedule never overlap. The "Run Full Pipeline" button polls this file.
# TWO lock files, deliberately. This wrapper guards itself with its own, under a name
# the skill never looks at; the agent takes data/pipeline.lock for itself in Step 0.
#
# They used to share one file, with IMM_PIPELINE_LOCK_HELD telling the agent "that fresh
# lock is your own parent, ignore it". The agent looked anyway and self-aborted the whole
# cycle - 2026-09-04 twice, 2026-09-24 06:00 again (nothing was stuck; the abort WAS the
# failure, and it cost a full cycle each time). An instruction to disbelieve a file you
# just showed someone is not a lock. So the agent no longer sees this one at all, and
# needs no instruction about it.
LOCK="/Users/nguyenbaole/auto-social-posting/data/pipeline.wrapper.lock"
AGENT_LOCK="/Users/nguyenbaole/auto-social-posting/data/pipeline.lock"
if [ -f "$LOCK" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK") ))
  if [ "$AGE" -lt 1800 ]; then
    echo "[run-pipeline] another run is in progress (lock ${AGE}s old) — skipping." >&2
    exit 0
  fi
fi
echo $$ > "$LOCK"
# Sweep the agent's lock too: this wrapper outlives it, so a crashed cycle gets cleaned
# up here instead of blocking the next scheduled run until it ages out at 30 min.
trap 'rm -f "$LOCK" "$AGENT_LOCK"' EXIT INT TERM

LOG="/Users/nguyenbaole/auto-social-posting/data/pipeline.log"

# Every run stamps the log. Entries used to run together untitled, so working out which
# cycle said what meant guessing from content - and the content of a failed cycle is a
# single error line indistinguishable from the tail of a healthy one.
echo "\n===== run-pipeline $(date '+%Y-%m-%d %H:%M:%S %z') =====" >> "$LOG"

# Headless run of the project skill. `--permission-mode bypassPermissions` lets it
# run curl/bash unattended; remove it if you prefer to pre-approve a tool allowlist.
run_cycle() {
  claude -p "Run the /immigration-pipeline skill to completion. Do every step." \
    --model claude-sonnet-5 \
    --effort medium \
    --permission-mode bypassPermissions \
    --exclude-dynamic-system-prompt-sections \
    >> "$LOG" 2>&1
}

# `claude -p` exits 0 even when the cycle did nothing, so check the work rather than the
# exit code. TWO failures taught this, and the first fix only caught one of them:
#   2026-09-25 18:00 - died on "Can't reach the API server (ENOTFOUND)". Nothing ran.
#   2026-09-26 06:00 - crawled, then backgrounded the crawl request and sat waiting for a
#                      completion notification that a headless run never delivers. It wrote
#                      one line and stopped, with ZERO posts generated.
# The second slipped through a check that only asked "did a crawl get recorded", because the
# crawl had in fact been recorded - it is step 1 of 5. So the test is posts, not crawls: a
# healthy cycle generates dozens across the markets, and every real one on record has.
# `postsSinceLastRun` counts gold written since this cycle's own crawl row, so summing it
# across markets is exactly "what did this cycle produce".
cycle_output() {   # echoes "<lastRunAt of first market> <total posts this cycle>"
  curl -s -m 15 http://localhost:3000/api/pages 2>/dev/null |
    python3 -c '
import sys, json, urllib.request
r = json.load(sys.stdin)
r = r if isinstance(r, list) else r.get("pages", [])
first, total = "", 0
for i, m in enumerate(r):
    try:
        with urllib.request.urlopen(
            "http://localhost:3000/api/audit?marketId=" + m["id"], timeout=15) as f:
            d = json.load(f)
    except Exception:
        continue
    if i == 0:
        first = d.get("lastRunAt") or ""
    total += d.get("postsSinceLastRun") or 0
print(first, total)
' 2>/dev/null
}

# WAIT FOR THE NETWORK BEFORE SPENDING A CYCLE. Both cycles lost this way died on
# "Can't reach the API server (ENOTFOUND)" within seconds of the firing — 2026-09-25 18:00 and
# 2026-10-06 06:00 — and in both cases the API was reachable again minutes later. DNS here resolves
# through Tailscale (100.100.100.100), so when that is not up yet, nothing resolves. A curl that
# returns ANY http code proves DNS, TCP and TLS all worked; 000 means it did not get that far.
wait_for_api() {
  local i code
  for i in $(seq 1 20); do                     # 20 x 30s = up to 10 minutes
    code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://api.anthropic.com/v1/models 2>/dev/null)
    # EMPTY counts as unreachable, not just "000". On a DNS failure curl writes NOTHING at all —
    # measured — so a bare `!= "000"` is true for the one case this exists to catch, and the wait
    # would wave every outage straight through. Any real code (401 unauthenticated, 200, 5xx)
    # proves DNS, TCP and TLS all completed, which is all this needs to know.
    case "$code" in
      ""|000) ;;
      *) [ "$i" -gt 1 ] && echo "[run-pipeline] network up after $((i * 30))s" >> "$LOG"; return 0 ;;
    esac
    sleep 30
  done
  echo "[run-pipeline] api unreachable after 10 min — running anyway" | tee -a "$LOG" >&2
  return 1
}

wait_for_api
BEFORE=$(cycle_output | cut -d" " -f1)
run_cycle

# A cycle counts as real only if its crawl landed AND it produced at least one post. An
# genuinely empty news cycle would cost one wasted retry; that has never happened in the
# log, while two dead cycles have.
cycle_failed() {
  local out after posts
  out=$(cycle_output); after=${out%% *}; posts=${out##* }
  [ -n "$BEFORE" ] || return 1               # can't tell - don't cry wolf
  [ "$after" = "$BEFORE" ] || [ "$posts" = "0" ]
}

if cycle_failed; then
  echo "[run-pipeline] cycle produced nothing — waiting for the network, then retrying" | tee -a "$LOG" >&2
  sleep 60
  wait_for_api        # 60s was measured too short on 2026-10-06: the retry died the same way
  echo "\n===== run-pipeline RETRY $(date '+%Y-%m-%d %H:%M:%S %z') =====" >> "$LOG"
  run_cycle
fi

if cycle_failed; then
  echo "[run-pipeline] FAILED — no posts generated after retry; see $LOG" | tee -a "$LOG" >&2
  exit 1   # so `launchctl list` shows non-zero instead of a silent success
fi

# Reel render caches. Each holds a voice mp3 plus fetched media, keyed by content, and
# nothing ever removed them - every narration edit orphans one and data/reels was already
# at 402 MB. All of it is regenerable, so age it out rather than tracking ownership. The
# finished mp4s in data/reels itself are NOT touched: gold_content.video_url points at them.
find /Users/nguyenbaole/auto-social-posting/data/reels/work -mindepth 1 -maxdepth 1 \
  -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true
