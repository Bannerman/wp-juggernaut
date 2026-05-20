/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Some API routes touch SQLite and can exceed the default 60s static-gen
  // timeout when the DB is held open by a running Juggernaut instance.
  staticPageGenerationTimeout: 600,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
