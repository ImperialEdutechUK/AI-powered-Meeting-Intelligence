import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Origin lock for the AWS deployment.
 *
 * The backend runs as a Lambda function URL that is publicly addressable by
 * design (CloudFront needs to reach it). CloudFront attaches a shared secret
 * as `x-origin-verify` to every request it forwards; anything without it came
 * straight to the function URL and is refused, so the passcode gate, rate
 * limits and edge security headers cannot be sidestepped.
 *
 * The PDF renderer's own loopback requests send the same header (see
 * `lib/export/pdf.ts`). With `ORIGIN_VERIFY_SECRET` unset (local dev, Railway)
 * this is a no-op.
 */
export function proxy(request: NextRequest): NextResponse {
  const expected = process.env.ORIGIN_VERIFY_SECRET;
  if (!expected) {
    // On AWS (secrets from SSM) a missing secret means loading failed: fail
    // closed rather than silently opening the function URL to everyone.
    return process.env.SECRETS_SSM_PATH ? forbidden() : NextResponse.next();
  }

  const given = Buffer.from(request.headers.get('x-origin-verify') ?? '', 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length === want.length && timingSafeEqual(given, want)) {
    return NextResponse.next();
  }

  return forbidden();
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden.' } },
    { status: 403 },
  );
}
