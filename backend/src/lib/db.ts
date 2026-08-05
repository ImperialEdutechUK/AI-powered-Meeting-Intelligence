import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { serverEnv } from './env';

/**
 * Postgres access.
 *
 * A single module-scoped pool, cached on `globalThis` so Next's dev-mode module
 * reloading does not leak connections. Plain SQL rather than an ORM: the schema
 * is one table, and avoiding a query-engine binary keeps the Docker image small
 * and the build deterministic.
 */

declare global {
  var __actionbriefPool: Pool | undefined;
}

export function pool(): Pool {
  if (globalThis.__actionbriefPool) return globalThis.__actionbriefPool;

  const env = serverEnv();
  const created = new Pool({
    connectionString: env.DATABASE_URL,
    // Railway's internal network does not need TLS; managed external Postgres does.
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'actionbrief',
  });

  // An idle client erroring must not take the process down.
  created.on('error', (error) => {
    console.error('[db] idle client error:', error.message);
  });

  globalThis.__actionbriefPool = created;
  return created;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run a function inside a transaction, releasing the client either way. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Cheap liveness probe for the health endpoint. */
export async function ping(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
