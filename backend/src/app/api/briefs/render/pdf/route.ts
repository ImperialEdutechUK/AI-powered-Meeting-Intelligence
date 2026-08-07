import { NextResponse } from 'next/server';

import { SESSION_COOKIE, currentSession } from '@/lib/auth';
import { errorResponse, fail, readJson, unauthorised } from '@/lib/api';
import { BriefBundleSchema } from '@/lib/brief-bundle';
import { serverEnv } from '@/lib/env';
import { putPendingBrief } from '@/lib/export/pending-store';
import { renderPdf } from '@/lib/export/pdf';
import { headerSafe, slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Render a PDF from a bundle handed up by the client — nothing is read back
 * from a database, because nothing is stored there. The bundle is the same
 * JSON the generate call returned; this route never sees anything else.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();

    const parsed = await readJson<{ bundle: unknown }>(request, 5_000_000);
    if (!parsed.ok) return parsed.response;

    const bundle = BriefBundleSchema.safeParse(parsed.value.bundle);
    if (!bundle.success) {
      return fail(400, 'BAD_BUNDLE', 'That document could not be read for export.');
    }

    const cookieHeader = request.headers.get('cookie') ?? '';
    const sessionValue = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));

    const token = putPendingBrief(bundle.data, serverEnv().ORG_NAME);

    const pdf = await renderPdf({
      path: `/print/render/${token}`,
      cookie: sessionValue,
    });

    const name = `${slugify(bundle.data.brief.title)}-${bundle.data.generatedAt.slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="${headerSafe(name)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, 'briefs/render/pdf');
  }
}
