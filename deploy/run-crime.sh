#!/bin/zsh
# Scheduled crime-series run. Same shape as run-pipeline.sh: single-run lock, headless
# claude, append to a log.
#
# Difference from the immigration pipeline: that one crawls, so it always has input.
# Crime series are case-led, so this drains the crime_cases queue and does nothing when
# the queue is empty. Filling the queue is a human job (see the sourcing plan in
# .claude/skills/crime-series/SKILL.md).

export PATH="/Users/nguyenbaole/.local/bin:/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

ROOT=/Users/nguyenbaole/auto-social-posting
LOG="$ROOT/data/crime.log"
LOCK="$ROOT/data/crime.lock"

# How many series per run. The schedule interval x this = series/day.
SERIES_PER_RUN="${CRIME_SERIES_PER_RUN:-1}"

# Single-run lock, so a manual trigger and the scheduled run cannot overlap.
if [ -e "$LOCK" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK") ))
  if [ "$AGE" -lt 7200 ]; then
    echo "[run-crime] another run in progress (lock ${AGE}s old), skipping." >> "$LOG"
    exit 0
  fi
  echo "[run-crime] stale lock (${AGE}s), taking over." >> "$LOG"
fi
trap 'rm -f "$LOCK"' EXIT
touch "$LOCK"

echo "[run-crime] $(date '+%Y-%m-%d %H:%M:%S') start, up to $SERIES_PER_RUN series" >> "$LOG"

# Find the crime page and how many cases are actually waiting. No queue, no run:
# the skill must never invent a case to satisfy a schedule.
PAGE_ID=$(curl -s http://localhost:3000/api/pages \
  | python3 -c "import json,sys,re; print(next((p['id'] for p in json.load(sys.stdin)['pages'] if re.search('crime',p['name'],re.I)), ''))")

if [ -z "$PAGE_ID" ]; then
  echo "[run-crime] no Crime Series page found, nothing to do." >> "$LOG"
  exit 0
fi

QUEUED=$(curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=queued" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('count',0))")

# Top the queue up from the archive before giving up. CourtListener's search API is open,
# and the pool is decades of decided cases rather than a feed, so an empty queue is a
# discovery problem, not an end of supply.
if [ "$QUEUED" -lt "$SERIES_PER_RUN" ]; then
  echo "[run-crime] queue low ($QUEUED), running discovery" >> "$LOG"
  ADDED=$(curl -s -X POST http://localhost:3000/api/crime/discover \
    -H 'Content-Type: application/json' \
    -d "{\"marketId\":\"$PAGE_ID\",\"limit\":10}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('added',0))" 2>/dev/null || echo 0)
  echo "[run-crime] discovery added $ADDED candidate(s)" >> "$LOG"
  QUEUED=$(curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=queued" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('count',0))")
fi

if [ "$QUEUED" -eq 0 ]; then
  echo "[run-crime] queue still empty, nothing to write." >> "$LOG"
  exit 0
fi

echo "[run-crime] $QUEUED case(s) queued" >> "$LOG"

claude -p "Run the /crime-series skill. Take up to $SERIES_PER_RUN case(s) with status
'queued' from GET http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=queued.
For each one: PATCH its status to 'researching', research and write the full series per
CRIME_SOP.md, POST it to /api/crime/series, then PATCH the case to 'written' with the
returned seriesId. If a case's record cannot support the series, PATCH it to 'rejected'
with the reason in the run output and move on. Never invent facts to fill a schedule." \
  --model claude-sonnet-5 \
  --effort medium \
  --permission-mode bypassPermissions \
  >> "$LOG" 2>&1

echo "[run-crime] $(date '+%Y-%m-%d %H:%M:%S') done" >> "$LOG"
