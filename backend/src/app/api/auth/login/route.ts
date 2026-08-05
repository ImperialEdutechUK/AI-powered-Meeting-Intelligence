import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSessionToken, sessionCookieOptions, verifyPasscode } from '@/lib/auth';
import { errorResponse, fail, ok, readJson } from '@/lib/api';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  passcode: z.string().min(1).max(200),
  name: z.string().max(60).default(''),
});

/**
 * Exchange the organisation passcode for a signed session cookie.
 *
 * Rate limited per IP on its own bucket so a brute-force attempt cannot also
 * exhaust the generation budget, and so a wrong passcode locks out quickly.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = clientIp(request.headers);
    const verdict = await checkRateLimit(ip, 'login');
    if (!verdict.allowed) {
      return fail(
        429,
        'RATE_LIMITED',
        'Too many sign-in attempts. Wait a few minutes and try again.',
        undefined,
        { retryAfterSeconds: verdict.retryAfterSeconds },
      );
    }

    const body = await readJson<unknown>(request, 4_000);
    if (!body.ok) return body.response;

    const parsed = Body.safeParse(body.value);
    if (!parsed.success) {
      return fail(400, 'BAD_REQUEST', 'Enter the access code to continue.');
    }

    if (!verifyPasscode(parsed.data.passcode)) {
      // Deliberately vague: do not confirm whether the code merely had a typo.
      return fail(401, 'BAD_PASSCODE', 'That access code is not correct.');
    }

    const { token, maxAgeSeconds } = createSessionToken(parsed.data.name);
    const response = ok({ signedIn: true });
    response.cookies.set({ ...sessionCookieOptions(maxAgeSeconds), value: token });
    return response;
  } catch (error) {
    return errorResponse(error, 'auth/login');
  }
}
