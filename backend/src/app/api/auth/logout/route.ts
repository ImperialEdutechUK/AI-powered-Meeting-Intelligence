import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const response = ok({ signedIn: false });
  response.cookies.set({ ...sessionCookieOptions(0), name: SESSION_COOKIE, value: '' });
  return response;
}
