import { z } from 'zod';

/**
 * Frontend environment contract.
 *
 * Deliberately tiny: everything that used to live in the single app's
 * `serverEnv()` (DATABASE_URL, SESSION_SECRET, OPENROUTER_*, ...) is backend-only
 * now. The frontend only needs to know where the backend is and what branding to
 * show — it never validates or touches the values that gate access or spend.
 */

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Railway injects PORT. */
  PORT: z.coerce.number().int().positive().default(3000),

  /** Internal origin of the backend service, used for server-side fetches. */
  BACKEND_URL: z.string().url().default('http://127.0.0.1:3001'),

  /** Branding shown in the app chrome and login screen. */
  ORG_NAME: z.string().default('Imperial Edutech'),
  ORG_SHORT: z.string().default('IL'),

  /** Upload ceiling, megabytes — shown to the user before they pick a file. */
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),
});

export type FrontendEnv = z.infer<typeof schema>;

let cached: FrontendEnv | null = null;

export function frontendEnv(): FrontendEnv {
  if (cached) return cached;
  // Every field has a default, so this never throws — the frontend must still
  // render (with sane fallbacks) if BACKEND_URL/ORG_NAME are not set.
  cached = schema.parse(process.env);
  return cached;
}
