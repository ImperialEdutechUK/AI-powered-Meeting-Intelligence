import { randomUUID } from 'node:crypto';
import type { BriefBundle } from '@/lib/brief-bundle';

/**
 * Transient hand-off between the PDF export request and the internal print
 * route Chromium navigates to.
 *
 * Nothing here is persisted: briefs are no longer written to the database, so
 * there is no id to pass through the URL. A random token stands in for one,
 * scoped to a single render and dropped from memory the moment it is read (or
 * after `TTL_MS`, if the render never happens). Restarting the server or
 * running multiple instances simply means an in-flight render fails and the
 * user retries — acceptable for a hand-off measured in seconds.
 */

interface Pending {
  bundle: BriefBundle;
  orgName: string;
  expiresAt: number;
}

const TTL_MS = 2 * 60 * 1000;

/*
 * The export route and the print page are separate Next.js route entries,
 * each with its own bundled copy of every module they import — a plain
 * module-level `const store = new Map()` is not guaranteed to be the same Map
 * in both. Hanging it off `globalThis` pins it to one instance for the life
 * of the Node process no matter how many times this module gets bundled in,
 * the same trick used for singleton DB clients under Next.js dev/HMR.
 */
const globalStore = globalThis as typeof globalThis & {
  __pendingBriefStore?: Map<string, Pending>;
};

const store = globalStore.__pendingBriefStore ?? new Map<string, Pending>();
globalStore.__pendingBriefStore = store;

function sweep(): void {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) store.delete(token);
  }
}

export function putPendingBrief(bundle: BriefBundle, orgName: string): string {
  sweep();
  const token = randomUUID();
  store.set(token, { bundle, orgName, expiresAt: Date.now() + TTL_MS });
  return token;
}

/** Single-use: the entry is removed whether or not it was still valid. */
export function takePendingBrief(token: string): Pending | null {
  const entry = store.get(token);
  store.delete(token);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry;
}
