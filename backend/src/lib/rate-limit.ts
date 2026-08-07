import { createHash } from 'node:crypto';
import { query, transaction } from './db';
import { serverEnv } from './env';

/**
 * Per-IP throttle for the generate endpoint.
 *
 * Backed by Postgres rather than memory so the limit still holds if Railway runs
 * more than one instance, and so a restart cannot be used to reset it. The table
 * is pruned on write, which keeps it small without a scheduled job.
 *
 * The count-then-insert below runs inside a transaction holding a Postgres
 * advisory lock scoped to the bucket, so two requests from the same IP arriving
 * at the same instant can't both read the count before either insert lands and
 * slip past the limit together. The lock is per-bucket (via `hashtext`), so it
 * never blocks unrelated IPs against each other.
 */

/** IPs are hashed so the table holds no directly identifying data. */
function bucketFor(ip: string, scope: string): string {
  return `${scope}:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
}

export interface RateVerdict {
  allowed: boolean;
  used: number;
  limit: number;
  /** Seconds until the oldest event in the window falls out of it. */
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  ip: string,
  scope = 'generate',
): Promise<RateVerdict> {
  const limit = serverEnv().RATE_LIMIT_PER_HOUR;
  const bucket = bucketFor(ip, scope);

  // Opportunistic prune: cheap, indexed, and keeps the table bounded.
  await query(`DELETE FROM rate_events WHERE created_at < now() - interval '2 hours'`);

  return transaction(async (client) => {
    // Serialises concurrent requests for this bucket only; released at commit.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [bucket]);

    const rows = await client.query<{ used: string; oldest: string | null }>(
      `SELECT COUNT(*)::text AS used,
              MIN(created_at)::text AS oldest
         FROM rate_events
        WHERE bucket = $1 AND created_at > now() - interval '1 hour'`,
      [bucket],
    );

    const used = Number(rows.rows[0]?.used ?? 0);
    const oldest = rows.rows[0]?.oldest ? new Date(rows.rows[0].oldest) : null;
    const retryAfterSeconds =
      oldest === null
        ? 0
        : Math.max(1, Math.ceil((oldest.getTime() + 3_600_000 - Date.now()) / 1000));

    if (used >= limit) {
      return { allowed: false, used, limit, retryAfterSeconds };
    }

    await client.query('INSERT INTO rate_events (bucket) VALUES ($1)', [bucket]);
    return { allowed: true, used: used + 1, limit, retryAfterSeconds: 0 };
  });
}

/**
 * Best-effort client IP.
 * Railway sets `x-forwarded-for`; the left-most entry is the original client.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
