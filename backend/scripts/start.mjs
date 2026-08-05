#!/usr/bin/env node
/**
 * Container entrypoint.
 *
 * 1. Fail fast and loudly on missing configuration, naming every variable, so a
 *    bad deploy is diagnosable from the first line of the Railway log.
 * 2. Run migrations.
 * 3. Hand off to the Next standalone server via `exec`-style replacement so
 *    signals reach it directly and Railway's restarts stay clean.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const REQUIRED = ['DATABASE_URL', 'OPENROUTER_API_KEY', 'APP_PASSCODE', 'SESSION_SECRET'];

const missing = REQUIRED.filter((key) => !String(process.env[key] ?? '').trim());
if (missing.length > 0) {
  console.error(
    '\n[start] Cannot boot. These environment variables are not set:\n' +
      missing.map((key) => `  - ${key}`).join('\n') +
      '\n\nSet them in Railway under Variables, then redeploy.' +
      '\nSee DEPLOYMENT.md for what each one is.\n',
  );
  process.exit(1);
}

if (String(process.env.SESSION_SECRET).length < 32) {
  console.error(
    '\n[start] SESSION_SECRET must be at least 32 characters.' +
      '\nGenerate one with:  openssl rand -hex 32\n',
  );
  process.exit(1);
}

if (String(process.env.APP_PASSCODE).length < 6) {
  console.error('\n[start] APP_PASSCODE must be at least 6 characters.\n');
  process.exit(1);
}

/** Run a child process to completion, resolving with its exit code. */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (error) => {
      console.error(`[start] failed to launch ${command}: ${error.message}`);
      resolve(1);
    });
  });
}

const migrateCode = await run(process.execPath, [join(here, 'migrate.mjs')], { cwd: root });
if (migrateCode !== 0) {
  console.error('[start] migrations failed; refusing to start.');
  process.exit(migrateCode);
}

/*
 * In the container the standalone bundle is flattened to the app root, so
 * `server.js` sits beside this script's parent. In a local checkout it is still
 * under `.next/standalone`. Support both.
 */
const candidates = [
  join(root, 'server.js'),
  join(root, '.next', 'standalone', 'server.js'),
];
const serverEntry = candidates.find((candidate) => existsSync(candidate));

if (!serverEntry) {
  console.error(
    '[start] server.js not found. Looked in:\n' +
      candidates.map((c) => `  - ${c}`).join('\n') +
      '\nThe image was built without `next build`, or `output: "standalone"` was ' +
      'removed from next.config.ts.',
  );
  process.exit(1);
}

const port = process.env.PORT ?? '3000';
console.info(`[start] ActionBrief listening on 0.0.0.0:${port}`);

const server = spawn(process.execPath, [serverEntry], {
  stdio: 'inherit',
  cwd: dirname(serverEntry),
  env: { ...process.env, PORT: port, HOSTNAME: '0.0.0.0' },
});

// Forward termination signals so Railway's graceful shutdown works.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.kill(signal));
}

server.on('close', (code) => process.exit(code ?? 0));
server.on('error', (error) => {
  console.error(`[start] server crashed: ${error.message}`);
  process.exit(1);
});
