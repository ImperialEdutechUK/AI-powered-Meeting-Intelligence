import { NextResponse } from 'next/server';

import { SESSION_COOKIE, currentSession } from '@/lib/auth';
import { errorResponse, unauthorised } from '@/lib/api';
import { getBrief } from '@/lib/repository';
import { renderPdf } from '@/lib/export/pdf';
import { headerSafe, slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Render the brief to PDF.
 *
 * The session cookie is forwarded to Chromium so the internal `/print/<id>`
 * request passes the same auth gate as any other page — the print route is not
 * an unauthenticated back door.
 */
export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();

    const { id } = await params;
    const record = await getBrief(id);

    const cookieHeader = request.headers.get('cookie') ?? '';
    // Forward only the session cookie, nothing else the browser happened to send.
    const sessionValue = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));

    const pdf = await renderPdf({
      path: `/print/${id}`,
      cookie: sessionValue,
    });

    const name = `${slugify(record.bundle.brief.title)}-${
      record.meetingDate ?? record.createdAt.slice(0, 10)
    }.pdf`;

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
    return errorResponse(error, 'briefs/pdf');
  }
}
