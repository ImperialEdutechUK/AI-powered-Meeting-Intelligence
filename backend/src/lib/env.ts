import { z } from 'zod';

/**
 * Server-side environment contract.
 *
 * Parsed lazily (not at module load) so that importing this file from a module
 * that is also reachable from a client bundle can never crash the build. Every
 * consumer must call `serverEnv()`.
 */

const Booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Railway injects PORT. */
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * Absolute origin the server can reach itself on. Used by the PDF renderer to
   * load the print route through a real browser. Defaults to loopback.
   */
  APP_BASE_URL: z.string().url().optional(),

  /** Postgres connection string (Railway plugin provides this). */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Set to true when connecting to a managed Postgres that needs TLS. */
  DATABASE_SSL: Booleanish.default(false),

  /** OpenRouter credentials. */
  OPENROUTER_API_KEY: z.string().min(10, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),

  /**
   * Model slugs. Verified against openrouter.ai on 2026-08-05:
   *   openai/gpt-5.6-luna      — 1,050,000 ctx, $0.10/$0.60 per M tokens
   *   openai/gpt-5.6-luna-pro  — 1,050,000 ctx, $0.10/$0.60 per M tokens
   */
  OPENROUTER_MODEL_FAST: z.string().min(1).default('openai/gpt-5.6-luna'),
  OPENROUTER_MODEL_DEEP: z.string().min(1).default('openai/gpt-5.6-luna-pro'),

  /** Optional attribution headers OpenRouter shows on your dashboard. */
  OPENROUTER_SITE_URL: z.string().url().optional(),
  OPENROUTER_SITE_NAME: z.string().default('ActionBrief'),

  /** Shared organisation passcode that gates the whole app. */
  APP_PASSCODE: z.string().min(6, 'APP_PASSCODE must be at least 6 characters'),

  /** HMAC key for the session cookie. Rotating it logs everyone out. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  /** Session lifetime in hours. */
  SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(72),

  /** Branding shown in the app chrome and document footers. */
  ORG_NAME: z.string().default('Imperial Edutech'),
  ORG_SHORT: z.string().default('IL'),

  /** Chromium executable used for PDF rendering. */
  CHROMIUM_PATH: z.string().default('/usr/bin/chromium'),

  /** Upload ceiling, megabytes. */
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),

  /** Generations allowed per IP per hour. */
  RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(40),

  /**
   * Chromium instances the PDF renderer may run at once. Each one peaks around
   * 350-450MB (see `railway.toml`), so this should stay low on a 1GB instance.
   * Extra requests queue briefly rather than launching unbounded browsers.
   */
  PDF_MAX_CONCURRENT_RENDERS: z.coerce.number().int().min(1).max(20).default(2),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export class EnvError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvError';
    this.issues = issues;
  }
}

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new EnvError(issues);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached parse so a new process.env can be read. */
export function resetEnvCache(): void {
  cached = null;
}

/** Absolute origin for self-requests (PDF rendering). */
export function selfOrigin(): string {
  const env = serverEnv();
  return env.APP_BASE_URL ?? `http://127.0.0.1:${env.PORT}`;
}
