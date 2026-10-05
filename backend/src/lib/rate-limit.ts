import { createHash } from 'node:crypto';
import { query, transaction } from './db';
import { serverEnv } from './env';

/**
 * Per-IP throttle for the generate and login endpoints.
 *
 * Three stores, picked by configuration:
 *
 * - **DynamoDB** (`RATE_LIMIT_TABLE`, the AWS deployment). A fixed one-hour
 *   window per bucket, counted with a single conditional `UpdateItem`, so the
 *   check-and-increment is atomic across concurrent Lambda instances. Items
 *   expire through DynamoDB TTL, so the table needs no pruning job. On-demand
 *   billing makes this effectively free at this app's volume.
 *
 * - **Postgres** (`DATABASE_URL`, the Railway deployment). A sliding window.
 *   The count-then-insert runs inside a transaction holding a per-bucket
 *   advisory lock, so two simultaneous requests cannot both slip past the limit.
 *
 * - **Memory** (neither set — local development only). Per-process, so it
 *   resets on restart and does not hold across instances.
 */

/** IPs are hashed so no store holds directly identifying data. */
function bucketFor(ip: string, scope: string): string {
  return `${scope}:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
}

export interface RateVerdict {
  allowed: boolean;
  used: number;
  limit: number;
  /** Seconds until the caller may try again. */
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  ip: string,
  scope = 'generate',
): Promise<RateVerdict> {
  const env = serverEnv();
  const limit = env.RATE_LIMIT_PER_HOUR;
  const bucket = bucketFor(ip, scope);

  if (env.RATE_LIMIT_TABLE) return checkDynamo(env.RATE_LIMIT_TABLE, bucket, limit);
  if (env.DATABASE_URL) return checkPostgres(bucket, limit);
  return checkMemory(bucket, limit);
}

/* ------------------------------------------------------------------------- */
/* DynamoDB                                                                  */
/* ------------------------------------------------------------------------- */

const HOUR_MS = 3_600_000;

async function checkDynamo(table: string, bucket: string, limit: number): Promise<RateVerdict> {
  const { DynamoDBClient, UpdateItemCommand, ConditionalCheckFailedException } =
    await import('@aws-sdk/client-dynamodb');

  const client = dynamoClient(DynamoDBClient);
  const windowStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + HOUR_MS - Date.now()) / 1000));

  try {
    const result = await client.send(
      new UpdateItemCommand({
        TableName: table,
        Key: { pk: { S: `${bucket}#${windowStart}` } },
        UpdateExpression: 'ADD hits :one SET expiresAt = if_not_exists(expiresAt, :exp)',
        ConditionExpression: 'attribute_not_exists(hits) OR hits < :limit',
        ExpressionAttributeValues: {
          ':one': { N: '1' },
          ':limit': { N: String(limit) },
          // Kept an hour past the window's end; TTL deletion is lazy anyway.
          ':exp': { N: String(Math.floor((windowStart + 2 * HOUR_MS) / 1000)) },
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    const used = Number(result.Attributes?.hits?.N ?? 1);
    return { allowed: true, used, limit, retryAfterSeconds: 0 };
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return { allowed: false, used: limit, limit, retryAfterSeconds };
    }
    throw error;
  }
}

declare global {
  var __actionbriefDynamo: unknown;
}

function dynamoClient<T>(Ctor: new () => T): T {
  globalThis.__actionbriefDynamo ??= new Ctor();
  return globalThis.__actionbriefDynamo as T;
}

/* ------------------------------------------------------------------------- */
/* Postgres                                                                  */
/* ------------------------------------------------------------------------- */

async function checkPostgres(bucket: string, limit: number): Promise<RateVerdict> {
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
        : Math.max(1, Math.ceil((oldest.getTime() + HOUR_MS - Date.now()) / 1000));

    if (used >= limit) {
      return { allowed: false, used, limit, retryAfterSeconds };
    }

    await client.query('INSERT INTO rate_events (bucket) VALUES ($1)', [bucket]);
    return { allowed: true, used: used + 1, limit, retryAfterSeconds: 0 };
  });
}

/* ------------------------------------------------------------------------- */
/* Memory (development)                                                      */
/* ------------------------------------------------------------------------- */

const memory = new Map<string, number[]>();

function checkMemory(bucket: string, limit: number): RateVerdict {
  const now = Date.now();
  const events = (memory.get(bucket) ?? []).filter((at) => at > now - HOUR_MS);
  if (events.length >= limit) {
    memory.set(bucket, events);
    const retryAfterSeconds = Math.max(1, Math.ceil((events[0]! + HOUR_MS - now) / 1000));
    return { allowed: false, used: events.length, limit, retryAfterSeconds };
  }
  events.push(now);
  memory.set(bucket, events);
  return { allowed: true, used: events.length, limit, retryAfterSeconds: 0 };
}

/* ------------------------------------------------------------------------- */
/* Client IP                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Best-effort client IP.
 *
 * Behind CloudFront, `cloudfront-viewer-address` (`ip:port`, set by CloudFront
 * itself) is the only value a client cannot spoof — CloudFront appends to an
 * incoming `x-forwarded-for` rather than replacing it. Elsewhere (Railway),
 * the left-most `x-forwarded-for` entry is the original client.
 */
export function clientIp(headers: Headers): string {
  const viewer = headers.get('cloudfront-viewer-address')?.trim();
  if (viewer) {
    const colon = viewer.lastIndexOf(':');
    return colon > 0 ? viewer.slice(0, colon) : viewer;
  }

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
