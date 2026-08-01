#!/bin/zsh
# Keeps the Next.js server running (sole owner of the DuckDB lake + SQLite).
# Used by com.immigration.web.plist.
export PATH="/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

# A production build is identified by .next/BUILD_ID (dev mode never creates it).
# Rebuild when any source is newer than that build: `next start` serves .next/, so
# checking only for BUILD_ID's existence let a committed fix sit undeployed for hours
# (2026-08-01 — a JSON-parse fix looked broken because the build predated it).
if [ ! -f .next/BUILD_ID ] || [ -n "$(find app next.config.js package.json -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
  npm run build
fi
exec npm run start
