/** @type {import('next').NextConfig} */
const nextConfig = {
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
