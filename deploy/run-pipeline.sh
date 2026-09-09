#!/bin/zsh
# Runs ONE immigration-pipeline cycle via the first-party Claude Code CLI
# (subscription-billed, local). Used by com.immigration.pipeline.plist every 4h.
#
# Requires the Next.js server to be running (it owns the DuckDB lake).
export PATH="/Users/nguyenbaole/.local/bin:/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

# Single-run lock so a manual trigger (Settings button → /api/pipeline/run) and
# the 4h schedule never overlap. The "Run Full Pipeline" button polls this file.
LOCK="/Users/nguyenbaole/auto-social-posting/data/pipeline.lock"
if [ -f "$LOCK" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK") ))
  if [ "$AGE" -lt 1800 ]; then
    echo "[run-pipeline] another run is in progress (lock ${AGE}s old) — skipping." >&2
    exit 0
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

# Tells the skill the lock is already held on its behalf. Without this the skill's
# own lock check (Step 0) would see this wrapper's fresh lock and abort every
# scheduled run as if it were a collision.
export IMM_PIPELINE_LOCK_HELD=1

# Headless run of the project skill. `--permission-mode bypassPermissions` lets it
# run curl/bash unattended; remove it if you prefer to pre-approve a tool allowlist.
claude -p "Run the /immigration-pipeline skill to completion. Do every step." \
  --model claude-sonnet-5 \
  --effort medium \
  --permission-mode bypassPermissions \
  --exclude-dynamic-system-prompt-sections \
  >> /Users/nguyenbaole/auto-social-posting/data/pipeline.log 2>&1

# Reel render caches. Each holds a voice mp3 plus fetched media, keyed by content, and
# nothing ever removed them - every narration edit orphans one and data/reels was already
# at 402 MB. All of it is regenerable, so age it out rather than tracking ownership. The
# finished mp4s in data/reels itself are NOT touched: gold_content.video_url points at them.
find /Users/nguyenbaole/auto-social-posting/data/reels/work -mindepth 1 -maxdepth 1 \
  -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true
