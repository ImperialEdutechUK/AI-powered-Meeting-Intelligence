'use client';

import { useEffect, useState } from 'react';
import type { SessionInfo } from './api-types';

/**
 * Client-side session check.
 *
 * The frontend is static, so it cannot verify the HMAC-signed `ab_session`
 * cookie itself (the signing secret is backend-only, and the cookie is
 * httpOnly anyway). It asks the backend instead. The backend still enforces
 * the session on every data route — this only decides what to render.
 */
export async function fetchSession(): Promise<SessionInfo> {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const body = (await response.json()) as { ok: boolean; data?: SessionInfo };
    if (body.ok && body.data) return body.data;
  } catch {
    // Treat an unreachable backend as signed out; the login form reports
    // connection problems when the user actually tries to sign in.
  }
  return { signedIn: false, who: null };
}

/** `null` while the check is in flight. */
export function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    let live = true;
    void fetchSession().then((value) => {
      if (live) setSession(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return session;
}
