import { NextResponse } from 'next/server';
import { EnvError } from './env';
import { TranscriptError } from './transcript/types';
import { GenerationError } from './ai/generate';
import { OpenRouterError } from './ai/openrouter';
import { PdfError } from './export/pdf';
import { PdfBusyError } from './export/pdf-limiter';

/**
 * Uniform API responses.
 *
 * Every route returns either `{ ok: true, data }` or `{ ok: false, error }` with
 * a stable `code`, a message written for the person reading the screen, and an
 * optional `detail` for the person reading the logs. Nothing leaks a stack trace.
 */

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    detail?: string;
    /** Present on 429. */
    retryAfterSeconds?: number;
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  status: number,
  code: string,
  message: string,
  detail?: string,
  extra?: Record<string, unknown>,
): NextResponse {
  const body: ApiErrorBody = {
    ok: false,
    error: { code, message, ...(detail ? { detail } : {}), ...extra },
  };
  return NextResponse.json(body, { status });
}

export const unauthorised = () =>
  fail(401, 'UNAUTHORISED', 'Your session has expired. Sign in again to continue.');

/**
 * Map a thrown error to a response.
 * Unknown errors become a generic 500 with the message logged, never returned.
 */
export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof TranscriptError) {
    const status = error.code === 'TOO_LARGE' ? 413 : 400;
    return fail(status, `TRANSCRIPT_${error.code}`, error.message);
  }

  if (error instanceof GenerationError) {
    return fail(422, `GENERATION_${error.code}`, error.message, error.detail);
  }

  if (error instanceof OpenRouterError) {
    const status =
      error.code === 'AUTH' || error.code === 'CREDIT'
        ? 502
        : error.code === 'RATE_LIMIT'
          ? 429
          : error.code === 'TIMEOUT'
            ? 504
            : 502;
    return fail(status, `MODEL_${error.code}`, error.message);
  }

  if (error instanceof PdfError) {
    const status = error.code === 'NO_CHROMIUM' ? 501 : error.code === 'TIMEOUT' ? 504 : 500;
    return fail(status, `PDF_${error.code}`, error.message, error.detail);
  }

  if (error instanceof PdfBusyError) {
    return fail(503, 'PDF_BUSY', error.message);
  }

  if (error instanceof EnvError) {
    console.error(`[${context}] configuration error:`, error.issues);
    return fail(
      500,
      'MISCONFIGURED',
      'The server is missing required configuration. Check the deployment environment variables.',
      error.issues.join('; '),
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] unhandled error:`, message);
  if (error instanceof Error && error.stack) console.error(error.stack);

  return fail(
    500,
    'INTERNAL',
    'Something went wrong on the server. Try again; if it keeps happening, check the deployment logs.',
  );
}

/** Body-size guard for JSON routes. */
export async function readJson<T>(
  request: Request,
  maxBytes = 2_000_000,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > maxBytes) {
    return {
      ok: false,
      response: fail(413, 'BODY_TOO_LARGE', 'That request was too large.'),
    };
  }
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return {
      ok: false,
      response: fail(400, 'BAD_JSON', 'The request body was not valid JSON.'),
    };
  }
}
