import { headers } from 'next/headers';
import { frontendEnv } from './env';

/**
 * Server-side fetch to the backend service, forwarding the caller's cookie.
 *
 * Server Components used to read the database and session cookie in-process;
 * now that logic lives in the backend, so every one of those reads becomes an
 * HTTP call that must carry the same `ab_session` cookie the browser sent this
 * page request, or the backend will see an unauthenticated caller.
 */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const incoming = await headers();
  const cookie = incoming.get('cookie') ?? '';

  return fetch(`${frontendEnv().BACKEND_URL}${path}`, {
    ...init,
    headers: { ...init.headers, cookie },
    cache: 'no-store',
  });
}

export interface BackendEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; detail?: string };
}

/** Parses the {ok,data}/{ok:false,error} envelope every backend route returns. */
export async function backendJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await backendFetch(path, init);
  const body = (await response.json()) as BackendEnvelope<T>;
  if (!body.ok || body.data === undefined) {
    throw new Error(body.error?.message ?? `Backend request to ${path} failed.`);
  }
  return body.data;
}
