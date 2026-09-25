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

# `claude -p` exits 0 even when it never reached the API: the 18:00 run on 2026-09-25 died
# three minutes in on "Can't reach the API server (ENOTFOUND)", launchd recorded a success,
# and the only symptom was the owner noticing hours later that no posts had appeared. So
# check the work, not the exit code. Step 1 of the skill writes an audit_runs row for every
# market, so lastRunAt moving is proof a cycle actually happened.
last_run() {
  local id
  id=$(curl -s -m 10 http://localhost:3000/api/pages 2>/dev/null |
       python3 -c 'import sys,json; r=json.load(sys.stdin); r=r if isinstance(r,list) else r.get("pages",[]); print(r[0]["id"] if r else "")' 2>/dev/null)
  [ -n "$id" ] || return 0
  curl -s -m 10 "http://localhost:3000/api/audit?marketId=$id" 2>/dev/null |
    python3 -c 'import sys,json; print(json.load(sys.stdin).get("lastRunAt") or "")' 2>/dev/null
}

BEFORE=$(last_run)
run_cycle

# One retry, and only when the cycle recorded nothing. The failure this guards against is a
# transient DNS blip - it had already cleared 50 minutes later - and one retry is the whole
# difference between losing a cycle and not. A cycle that did real work is never repeated.
if [ -n "$BEFORE" ] && [ "$(last_run)" = "$BEFORE" ]; then
  echo "[run-pipeline] cycle recorded no crawl — retrying once in 60s" | tee -a "$LOG" >&2
  sleep 60
  echo "\n===== run-pipeline RETRY $(date '+%Y-%m-%d %H:%M:%S %z') =====" >> "$LOG"
  run_cycle
fi

if [ -n "$BEFORE" ] && [ "$(last_run)" = "$BEFORE" ]; then
  echo "[run-pipeline] FAILED — no crawl recorded after retry; see $LOG" | tee -a "$LOG" >&2
  exit 1   # so `launchctl list` shows non-zero instead of a silent success
fi

# Reel render caches. Each holds a voice mp3 plus fetched media, keyed by content, and
# nothing ever removed them - every narration edit orphans one and data/reels was already
# at 402 MB. All of it is regenerable, so age it out rather than tracking ownership. The
# finished mp4s in data/reels itself are NOT touched: gold_content.video_url points at them.
find /Users/nguyenbaole/auto-social-posting/data/reels/work -mindepth 1 -maxdepth 1 \
  -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true
