import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Railway runs this as a container: standalone emits a minimal self-contained
  // server bundle so the runtime image does not need node_modules.
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,

  // `puppeteer-core` and `unpdf` must stay external — bundling them breaks their
  // dynamic worker/binary resolution inside the Next server build.
  serverExternalPackages: ['puppeteer-core', 'unpdf', 'pg', 'mammoth'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
