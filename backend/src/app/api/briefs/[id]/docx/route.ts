import { NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth';
import { errorResponse, unauthorised } from '@/lib/api';
import { getBrief } from '@/lib/repository';
import { renderDocx } from '@/lib/export/docx';
import { serverEnv } from '@/lib/env';
import { headerSafe, slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();

    const { id } = await params;
    const record = await getBrief(id);
    const docx = await renderDocx(record.bundle, serverEnv().ORG_NAME);

    const name = `${slugify(record.bundle.brief.title)}-${
      record.meetingDate ?? record.createdAt.slice(0, 10)
    }.docx`;

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
    return errorResponse(error, 'briefs/docx');
  }
}
