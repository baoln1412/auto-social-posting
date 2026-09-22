import { defineConfig } from '@playwright/test';
import path from 'node:path';

// `next dev` writes into distDir, and :3000 is a `next start` serving `.next/`. Point dev at
// `.next-dev/` (next.config.js reads NEXT_DIST_DIR) or the test run would clobber production.
export default defineConfig({
  // `@/...` in a spec resolves the same way it does in the app.
  //@ts-expect-error - resolve is accepted at runtime
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  testDir: 'tests/e2e',
  outputDir: 'tests/.playwright',
  timeout: 90_000,
  reporter: [['list']],
  // One worker, deliberately. The whole suite drives a single `next dev` with one DuckDB
  // connection and one SQLite file; parallel workers raced Next's first compile of a route
  // and it threw "Cannot read properties of null (reading 'useContext')" out of its own
  // error boundary. Nothing here is CPU-bound except the render, which is one test.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npx next dev -H 127.0.0.1 -p 3001',
    url: 'http://127.0.0.1:3001/studio',
    reuseExistingServer: true,
    timeout: 240_000,
    env: {
      STUDIO_ENABLED: '1',
      // Inlined into the client bundle at build time. Unset on :3000, so the production
      // build does not even contain the link.
      NEXT_PUBLIC_STUDIO_ENABLED: '1',
      NEXT_DIST_DIR: '.next-dev',
      // DuckDB is single-writer across processes and :3000 holds data/lake.duckdb. Dev reads
      // its own snapshot (`cp data/lake.duckdb data/lake-dev.duckdb`) — same code path, real
      // rows, and production's lock is never contested.
      DUCKDB_PATH: 'data/lake-dev.duckdb',
      // Channels and runs a test creates do not belong in the owner's data/local.db.
      STUDIO_SQLITE_PATH: 'data/studio-test.db',
      // The demo-tier test signs a real `desoul_tier` cookie with this, so the tier path
      // under test is the production one, not an env-var shortcut.
      STUDIO_COOKIE_SECRET: 'playwright-tier-secret',
    },
  },
});
