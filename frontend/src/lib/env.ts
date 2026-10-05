/**
 * Frontend configuration.
 *
 * The frontend is a static export served from S3, so there is no server-side
 * environment at request time. These values are inlined at build time from
 * `NEXT_PUBLIC_*` variables — they must be read as literal
 * `process.env.NEXT_PUBLIC_X` expressions for Next to substitute them, and
 * nothing secret may ever live here.
 */

export interface FrontendEnv {
  /** Branding shown in the app chrome and login screen. */
  ORG_NAME: string;
  ORG_SHORT: string;
  /** Upload ceiling, megabytes — shown to the user before they pick a file. */
  MAX_UPLOAD_MB: number;
}

function toUploadMb(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 4;
}

const env: FrontendEnv = {
  ORG_NAME: process.env.NEXT_PUBLIC_ORG_NAME || 'Imperial Edutech',
  ORG_SHORT: process.env.NEXT_PUBLIC_ORG_SHORT || 'IL',
  MAX_UPLOAD_MB: toUploadMb(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB),
};

export function frontendEnv(): FrontendEnv {
  return env;
}
