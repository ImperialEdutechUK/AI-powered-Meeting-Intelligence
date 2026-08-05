import { NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports whether the caller has a valid session.
 *
 * Unlike every other route here, this one never returns 401 — its entire job is
 * to answer "are you signed in", which the frontend app now has to ask over HTTP
 * since it can no longer verify the HMAC-signed cookie itself (the signing
 * secret stays backend-only).
 */
export async function GET(): Promise<NextResponse> {
  const session = await currentSession();
  return ok({ signedIn: session !== null, who: session?.who ?? null });
}
