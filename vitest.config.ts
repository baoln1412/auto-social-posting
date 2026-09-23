import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // The card renderers are .tsx route handlers that build JSX for next/og. A unit test that
  // calls one gets "React is not defined" under the classic transform; Next itself compiles
  // these with the automatic runtime, so the test should too.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
