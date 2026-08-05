#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies every `db/migrations/*.sql` file in filename order exactly once,
 * tracking what has run in a `schema_migrations` table. Each file runs inside its
 * own transaction, so a failure leaves the database on the last good migration
 * rather than half-applied.
 *
 * Safe to run on every boot: already-applied files are skipped.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'db', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[migrate] DATABASE_URL is not set.');
  process.exit(1);
}

const useSsl = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.DATABASE_SSL ?? '').toLowerCase(),
);

const client = new pg.Client({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  application_name: 'actionbrief-migrate',
});

/** Retry the initial connection: Postgres often lags the app on a cold deploy. */
async function connectWithRetry(attempts = 12, delayMs = 2_500) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts) {
        console.error(`[migrate] could not connect after ${attempts} attempts: ${message}`);
        process.exit(1);
      }
      console.info(
        `[migrate] database not ready (${message}); retrying in ${delayMs / 1000}s ` +
          `(${attempt}/${attempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  await connectWithRetry();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(migrationsDir, file), 'utf8');
    console.info(`[migrate] applying ${file}`);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(
        `[migrate] ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }

  console.info(
    ran === 0
      ? `[migrate] up to date (${files.length} migration${files.length === 1 ? '' : 's'})`
      : `[migrate] applied ${ran} migration${ran === 1 ? '' : 's'}`,
  );
}

try {
  await main();
} finally {
  await client.end().catch(() => undefined);
}
