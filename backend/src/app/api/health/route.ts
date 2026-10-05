import { NextResponse } from 'next/server';
import { ping } from '@/lib/db';
import { pdfAvailable } from '@/lib/export/pdf';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment health probe.
 *
 * Reports which subsystems are usable rather than a bare 200, so a Railway
 * deployment that came up without a database or without Chromium is diagnosable
 * from one request. Never returns secrets.
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, boolean> = { server: true };
  const notes: string[] = [];

  let configured = true;
  try {
    serverEnv();
  } catch {
    configured = false;
    notes.push('Environment configuration is incomplete.');
  }
  checks.config = configured;

  if (configured) {
    const env = serverEnv();
    if (env.DATABASE_URL && !env.RATE_LIMIT_TABLE) {
      checks.database = await ping();
      if (!checks.database) notes.push('Database is unreachable.');
    }

    checks.pdf = await pdfAvailable();
    if (!checks.pdf) notes.push('Chromium not found — PDF export is unavailable.');
  }

  const healthy = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { ok: healthy, checks, notes, at: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
