import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from './env';

/**
 * Shared-passcode authentication.
 *
 * The whole app sits behind one organisation passcode. On success the server sets
 * an HMAC-signed, HttpOnly cookie; there are no user accounts to administer,
 * which was the explicit requirement.
 *
 * The signature covers the expiry and a random session id, so a cookie cannot be
 * forged or extended without `SESSION_SECRET`.
 */

export const SESSION_COOKIE = 'ab_session';

interface SessionPayload {
  /** Random per-login identifier, useful in logs. */
  sid: string;
  /** Expiry, epoch seconds. */
  exp: number;
  /** Optional display name the user typed at sign-in. */
  who: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='), 'base64');
}

function sign(body: string): string {
  return base64url(
    createHmac('sha256', serverEnv().SESSION_SECRET).update(body).digest(),
  );
}

/** Constant-time string comparison that tolerates differing lengths. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still do the comparison so the timing does not leak the length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function verifyPasscode(candidate: string): boolean {
  const expected = serverEnv().APP_PASSCODE;
  return safeEqual(candidate.trim(), expected);
}

export function createSessionToken(who: string): { token: string; maxAgeSeconds: number } {
  const env = serverEnv();
  const maxAgeSeconds = env.SESSION_HOURS * 3_600;
  const payload: SessionPayload = {
    sid: randomBytes(9).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    who: who.slice(0, 60),
  };
  const body = base64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, maxAgeSeconds };
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(body))) return null;

  try {
    const parsed: unknown = JSON.parse(fromBase64url(body).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const exp = typeof record.exp === 'number' ? record.exp : 0;
    if (exp * 1000 <= Date.now()) return null;
    return {
      sid: typeof record.sid === 'string' ? record.sid : '',
      exp,
      who: typeof record.who === 'string' ? record.who : '',
    };
  } catch {
    return null;
  }
}

/** Current session, or null. Safe to call from any server context. */
export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function isSignedIn(): Promise<boolean> {
  return (await currentSession()) !== null;
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: 'lax' as const,
    // Railway terminates TLS, so the cookie is only ever sent over HTTPS in
    // production. Local development is plain HTTP.
    secure: serverEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
