/** @type {import('next').NextConfig} */
const nextConfig = {
  // :3000 is a `next start` serving .next/. A dev server in the same checkout would
  // overwrite that build out from under it, so dev runs with NEXT_DIST_DIR=.next-dev.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Keep the native SQLite module out of the server bundle (loaded at runtime).
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', '@duckdb/node-api'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
