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

# Headless run of the project skill. `--permission-mode bypassPermissions` lets it
# run curl/bash unattended; remove it if you prefer to pre-approve a tool allowlist.
claude -p "Run the /immigration-pipeline skill to completion. Do every step." \
  --model claude-sonnet-5 \
  --effort medium \
  --permission-mode bypassPermissions \
  >> /Users/nguyenbaole/auto-social-posting/data/pipeline.log 2>&1
