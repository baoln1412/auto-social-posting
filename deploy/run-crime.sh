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

# Series to DELIVER per day, not cases to attempt. Rejection is a normal outcome, so the
# loop keeps going until this many are actually written.
TARGET="${CRIME_SERIES_PER_RUN:-8}"
# Bounds, so a queue full of unusable cases cannot run all day. Measured: ~13 min to
# write, ~4 to reject; at the observed 1-in-3 rate, 8 written costs roughly three hours.
MAX_ATTEMPTS="${CRIME_MAX_ATTEMPTS:-$(( TARGET * 4 ))}"
MAX_SECONDS="${CRIME_MAX_SECONDS:-18000}"   # 5h: must be finished well within the morning
DISCOVER_TO=$(( TARGET * 2 ))

# Single-run lock, holding the owner's PID so liveness can be checked rather than guessed.
# Age alone is not enough: a run killed before its EXIT trap fires leaves a lock that blocks
# every later run for hours, which is exactly what happened once and silently cost a
# scheduled batch. A lock whose process is gone is stale no matter how fresh it looks.
if [ -e "$LOCK" ]; then
  OWNER=$(cat "$LOCK" 2>/dev/null)
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK") ))
  if [ -n "$OWNER" ] && kill -0 "$OWNER" 2>/dev/null; then
    echo "[run-crime] run $OWNER still alive (lock ${AGE}s old), skipping." >> "$LOG"
    exit 0
  fi
  echo "[run-crime] lock owner ${OWNER:-unknown} is gone (${AGE}s old), taking over." >> "$LOG"
  rm -f "$LOCK"
fi
trap 'rm -f "$LOCK"' EXIT INT TERM HUP
echo $$ > "$LOCK"

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

written_count() {
  curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=written" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo 0
}

# Cases run concurrently. Measured on the run that produced the first full day of eight
# series: a write costs ~15.5 min and a rejection ~3.5, and 77 of that batch's 95 minutes was
# writes waiting on each other. Each case is already its own claude process and every database
# write goes through the API, which serialises, so sequencing bought nothing but wall clock.
CONCURRENCY="${CRIME_CONCURRENCY:-3}"

# A subshell has no job table, so a pool capped on $(jobs -r) silently never engages - it
# reads 0 every time and launches everything at once. Track the PIDs here instead.
pids=()
prune_workers() {
  local alive=() p
  for p in $pids; do kill -0 "$p" 2>/dev/null && alive+=("$p"); done
  pids=("${alive[@]}")
}

# The PARENT claims a case before handing it to a worker. Letting each worker pick "the oldest
# queued case" itself - which is what the sequential prompt said - has all of them pick the
# same one, because none has patched it to 'researching' by the time the others read the queue.
claim_case() {
  curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=queued" 2>/dev/null \
    | python3 -c "
import json, sys, urllib.request
cases = (json.load(sys.stdin).get('cases') or [])
if not cases: raise SystemExit
c = sorted(cases, key=lambda x: x.get('created_at') or '')[0]
urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/crime/cases', method='PATCH',
    data=json.dumps({'id': c['id'], 'status': 'researching'}).encode(),
    headers={'Content-Type': 'application/json'}), timeout=30).read()
print(c['id'])
" 2>/dev/null
}

# One case, start to finish. Output goes to its own file and is appended in one piece, so three
# concurrent workers cannot interleave their reports into an unreadable log.
run_case() {
  local cid="$1" n="$2" started out
  started=$(date '+%H:%M:%S')
  out="$ROOT/data/.crime-$cid.out"

  # Checked HERE, in shell, rather than left to the model. Measured cost of leaving it to the
  # model: one run this morning hit the app mid-restart (com.immigration.web was being
  # bounced for unrelated work) and spent ~20 turns route-hunting, reading source, and
  # starting its OWN `npm run dev` on the same port instead of just waiting - turns that,
  # under prompt-caching, each re-bill the whole growing conversation, not just their own
  # output. A retry loop in bash costs zero LLM tokens and cannot go on that kind of detour.
  local tries=0
  until curl -s -o /dev/null -w '' --max-time 5 "http://localhost:3000/api/pages" 2>/dev/null; do
    tries=$(( tries + 1 ))
    if [ "$tries" -ge 12 ]; then
      curl -s -X PATCH http://localhost:3000/api/crime/cases -H 'Content-Type: application/json' \
        -d "{\"id\":\"$cid\",\"status\":\"queued\"}" > /dev/null 2>&1
      echo "[run-crime] app unreachable after 60s, returned case $cid to the queue without spending a turn" >> "$LOG"
      return
    fi
    sleep 5
  done

  claude -p "Run the /crime-series skill for exactly ONE case: id $cid.

That case has already been claimed for you and is at status 'researching'. Do not read the
queue and do not touch any other case.

Research and write the full series per CRIME_SOP.md, POST it to /api/crime/series, then PATCH
case $cid to 'written' with the returned seriesId.

If the record cannot support the series, PATCH case $cid to 'rejected' and say why. Rejecting
is a correct outcome and costs little; inventing facts to satisfy the schedule is not, and
never is." \
    --model claude-sonnet-5 \
    --effort medium \
    --permission-mode bypassPermissions \
    > "$out" 2>&1

  # A worker killed mid-research leaves its case stuck at 'researching', where nothing will
  # ever pick it up again. Hand it back so a later run can try it.
  if curl -s "http://localhost:3000/api/crime/cases?marketId=$PAGE_ID&status=researching" 2>/dev/null \
       | grep -q "$cid"; then
    curl -s -X PATCH http://localhost:3000/api/crime/cases -H 'Content-Type: application/json' \
      -d "{\"id\":\"$cid\",\"status\":\"queued\"}" > /dev/null 2>&1
    echo "[run-crime] case $cid ended still 'researching', returned to the queue" >> "$out"
  fi

  {
    echo ""
    echo "──── case $n · $cid · $started → $(date '+%H:%M:%S') ────"
    cat "$out"
  } >> "$LOG"
  rm -f "$out"
}

# Baseline, so the counter measures THIS run rather than everything ever written.
BASELINE=$(written_count)
START_TS=$(date +%s)
WRITTEN=0
ATTEMPTED=0
STOP=''

while : ; do
  prune_workers
  WRITTEN=$(( $(written_count) - BASELINE ))
  [ "$WRITTEN" -ge "$TARGET" ] && break

  ELAPSED=$(( $(date +%s) - START_TS ))
  if [ "$ATTEMPTED" -ge "$MAX_ATTEMPTS" ]; then
    STOP="attempt cap reached ($MAX_ATTEMPTS)"
  elif [ "$ELAPSED" -ge "$MAX_SECONDS" ]; then
    STOP="time cap reached ($(( ELAPSED / 60 ))m)"
  fi
  if [ -n "$STOP" ]; then
    echo "[run-crime] $STOP, waiting on ${#pids} still running" >> "$LOG"; break
  fi

  # Never put more in flight than we still need, so a run cannot overshoot its target when
  # every worker happens to succeed.
  ROOM=$(( TARGET - WRITTEN - ${#pids} ))
  [ "$ROOM" -gt "$CONCURRENCY" ] && ROOM=$CONCURRENCY
  if [ "${#pids}" -ge "$CONCURRENCY" ] || [ "$ROOM" -le 0 ]; then
    sleep 15; continue
  fi

  # Rejections consume the queue as fast as successes do, so refill mid-batch.
  if [ "$(queued_count)" -eq 0 ]; then
    ADDED=$(curl -s -X POST http://localhost:3000/api/crime/discover \
      -H 'Content-Type: application/json' \
      -d "{\"marketId\":\"$PAGE_ID\",\"limit\":$DISCOVER_TO}" \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('added',0))" 2>/dev/null || echo 0)
    echo "[run-crime] queue empty mid-batch, discovery added $ADDED" >> "$LOG"
    if [ "$(queued_count)" -eq 0 ]; then
      # Workers still running may yet finish; only give up once nothing is in flight.
      if [ "${#pids}" -eq 0 ]; then
        echo "[run-crime] no candidates left, stopping with $WRITTEN/$TARGET written" >> "$LOG"; break
      fi
      sleep 15; continue
    fi
  fi

  CID=$(claim_case)
  if [ -z "$CID" ]; then
    [ "${#pids}" -eq 0 ] && { echo "[run-crime] could not claim a case, stopping with $WRITTEN/$TARGET written" >> "$LOG"; break; }
    sleep 15; continue
  fi

  ATTEMPTED=$(( ATTEMPTED + 1 ))
  echo "[run-crime] $(date '+%H:%M:%S') case $ATTEMPTED claimed ($CID) · written $WRITTEN/$TARGET · ${#pids} running" >> "$LOG"
  run_case "$CID" "$ATTEMPTED" &
  pids+=($!)
done

# Let whatever is still in flight finish and report, rather than orphaning it mid-write.
wait
WRITTEN=$(( $(written_count) - BASELINE ))

echo "" >> "$LOG"
echo "════ [run-crime] $(date '+%Y-%m-%d %H:%M:%S') batch done · $WRITTEN/$TARGET series written from $ATTEMPTED attempt(s), ${CONCURRENCY}-way ════" >> "$LOG"
