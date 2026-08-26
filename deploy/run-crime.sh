#!/bin/zsh
# Daily crime-series batch. Runs once at 06:00 so a day's instalments are waiting when
# someone sits down to review, rather than trickling in every three hours.
#
# Difference from the immigration pipeline: that one crawls, so it always has input.
# Crime series are case-led, so this sweeps for candidates first, then draws the queue
# down. An empty queue means the run does nothing; it must never invent a case to fill
# a schedule.
#
# One `claude -p` per case, deliberately. Writing N series inside a single invocation
# accumulates ~9,000 words of output per case in one context, which is where quality
# drops and fabrication risk climbs. Separate invocations also mean a case that fails
# costs itself and not the rest of the batch.

export PATH="/Users/nguyenbaole/.local/bin:/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

ROOT=/Users/nguyenbaole/auto-social-posting
LOG="$ROOT/data/crime.log"
LOCK="$ROOT/data/crime.lock"

# Cases to attempt per daily batch. At roughly 13 minutes per written series and 4 per
# rejection, 8 lands somewhere under two hours.
TARGET="${CRIME_SERIES_PER_RUN:-8}"
# Keep the queue comfortably ahead of one batch so discovery is never the bottleneck.
DISCOVER_TO=$(( TARGET * 2 ))

# Single-run lock. Generous stale threshold: a full batch legitimately runs for hours.
if [ -e "$LOCK" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK") ))
  if [ "$AGE" -lt 21600 ]; then
    echo "[run-crime] another run in progress (lock ${AGE}s old), skipping." >> "$LOG"
    exit 0
  fi
  echo "[run-crime] stale lock (${AGE}s), taking over." >> "$LOG"
fi
trap 'rm -f "$LOCK"' EXIT
touch "$LOCK"

echo "" >> "$LOG"
echo "════ [run-crime] $(date '+%Y-%m-%d %H:%M:%S') daily batch, target $TARGET ════" >> "$LOG"

PAGE_ID=$(curl -s http://localhost:3000/api/pages \
  | python3 -c "import json,sys,re; print(next((p['id'] for p in json.load(sys.stdin)['pages'] if re.search('crime',p['name'],re.I)), ''))")

if [ -z "$PAGE_ID" ]; then
  echo "[run-crime] no Crime Series page found, nothing to do." >> "$LOG"
  exit 0
fi

queued_count() {
  curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=queued" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo 0
}

# Sweep for candidates once, up front, rather than topping up one at a time. The pool is
# an archive of decided cases, so an empty queue is a discovery problem, not a supply one.
QUEUED=$(queued_count)
if [ "$QUEUED" -lt "$TARGET" ]; then
  echo "[run-crime] queue at $QUEUED, sweeping for up to $DISCOVER_TO candidates" >> "$LOG"
  ADDED=$(curl -s -X POST http://localhost:3000/api/crime/discover \
    -H 'Content-Type: application/json' \
    -d "{\"marketId\":\"$PAGE_ID\",\"limit\":$DISCOVER_TO}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('added',0))" 2>/dev/null || echo 0)
  QUEUED=$(queued_count)
  echo "[run-crime] discovery added $ADDED, queue now $QUEUED" >> "$LOG"
fi

if [ "$QUEUED" -eq 0 ]; then
  echo "[run-crime] queue empty, nothing to write." >> "$LOG"
  exit 0
fi

WRITTEN=0
ATTEMPTED=0
for i in $(seq 1 "$TARGET"); do
  [ "$(queued_count)" -eq 0 ] && { echo "[run-crime] queue exhausted after $ATTEMPTED case(s)" >> "$LOG"; break; }
  ATTEMPTED=$(( ATTEMPTED + 1 ))
  echo "" >> "$LOG"
  echo "──── case $i/$TARGET · $(date '+%H:%M:%S') ────" >> "$LOG"

  claude -p "Run the /crime-series skill for exactly ONE case.

Take the oldest case with status 'queued' from
GET http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=queued

PATCH it to 'researching', then research and write the full series per CRIME_SOP.md and
POST it to /api/crime/series. PATCH the case to 'written' with the returned seriesId.

If the record cannot support the series, PATCH the case to 'rejected' and say why. Rejecting
is a correct outcome and costs little; inventing facts to satisfy the schedule is not, and
never is. Do not touch any other queued case." \
    --model claude-sonnet-5 \
    --effort medium \
    --permission-mode bypassPermissions \
    >> "$LOG" 2>&1

  WRITTEN=$(curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=written" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "$WRITTEN")
done

echo "" >> "$LOG"
echo "════ [run-crime] $(date '+%Y-%m-%d %H:%M:%S') batch done · attempted $ATTEMPTED · written total $WRITTEN ════" >> "$LOG"
