import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

/*
 * Production builds are a fully static export (`out/`) that is uploaded to S3
 * and served by CloudFront. CloudFront also routes `/api/*` on the same domain
 * to the backend Lambda, so every client-side `fetch('/api/...')` stays
 * same-origin and the httpOnly `ab_session` cookie never crosses origins.
 *
 * Security headers are set by the CloudFront response headers policy
 * (infra/template.yaml) — `headers()` does not apply to a static export.
 */
export default function config(phase: string): NextConfig {
  const base: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    images: { unoptimized: true },
  };

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    // Local development only: proxy `/api/*` to the backend dev server, which
    // is what CloudFront does in production.
    return {
      ...base,
      experimental: { proxyTimeout: 600_000 },
      async rewrites() {
        const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
        return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
      },
    };
  }

  return { ...base, output: 'export' };
}
