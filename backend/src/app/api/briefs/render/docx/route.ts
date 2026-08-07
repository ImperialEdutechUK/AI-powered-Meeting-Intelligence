import { NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth';
import { errorResponse, fail, readJson, unauthorised } from '@/lib/api';
import { BriefBundleSchema } from '@/lib/brief-bundle';
import { renderDocx } from '@/lib/export/docx';
import { serverEnv } from '@/lib/env';
import { headerSafe, slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Render a DOCX from a bundle handed up by the client — see the PDF route in
 * the sibling `render/pdf` folder for why: nothing is read from a database
 * because nothing is written to one.
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

    const docx = await renderDocx(bundle.data, serverEnv().ORG_NAME);

    const name = `${slugify(bundle.data.brief.title)}-${bundle.data.generatedAt.slice(0, 10)}.docx`;

    return new NextResponse(new Uint8Array(docx), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(docx.length),
        'Content-Disposition': `attachment; filename="${headerSafe(name)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, 'briefs/render/docx');
  }
}
