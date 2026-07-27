#!/bin/zsh
# Keeps the Next.js server running (sole owner of the DuckDB lake + SQLite).
# Used by com.immigration.web.plist.
export PATH="/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nguyenbaole/auto-social-posting || exit 1

# A production build is identified by .next/BUILD_ID (dev mode never creates it).
[ -f .next/BUILD_ID ] || npm run build
exec npm run start
