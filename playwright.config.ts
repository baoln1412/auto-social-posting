import { defineConfig } from '@playwright/test';

// `next dev` writes into distDir, and :3000 is a `next start` serving `.next/`. Point dev at
// `.next-dev/` (next.config.js reads NEXT_DIST_DIR) or the test run would clobber production.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'tests/.playwright',
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npx next dev -H 127.0.0.1 -p 3001',
    url: 'http://127.0.0.1:3001/studio',
    reuseExistingServer: true,
    timeout: 240_000,
    env: { STUDIO_ENABLED: '1', NEXT_DIST_DIR: '.next-dev' },
  },
});
