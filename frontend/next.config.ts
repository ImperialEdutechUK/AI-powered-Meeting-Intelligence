import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Railway runs this as a container: standalone emits a minimal self-contained
  // server bundle so the runtime image does not need node_modules.
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,

  experimental: {
    // Next's rewrite proxy defaults to a 30s timeout, but brief generation
    // (backend/src/app/api/briefs/route.ts's maxDuration) can legitimately run
    // for minutes on a long transcript. Match the two so the proxy never kills
    // a request the backend is still happily working on.
    proxyTimeout: 600_000,
  },

  /*
   * Proxy `/api/*` to the backend service transparently. This is what lets every
   * client-side `fetch('/api/...')` call site (NewBriefForm, ExportBar, LoginForm,
   * Shell) work completely unchanged: the browser still sees a same-origin
   * request, so the httpOnly `ab_session` cookie never has to cross origins and
   * no CORS configuration is needed anywhere.
   */
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },

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
