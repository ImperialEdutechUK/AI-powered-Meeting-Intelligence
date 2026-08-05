import { NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth';
import { errorResponse, fail, ok, unauthorised } from '@/lib/api';
import { deleteBrief, getBrief } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();
    const { id } = await params;
    const record = await getBrief(id);
    return ok(record);
  } catch (error) {
    return errorResponse(error, 'briefs/get');
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();
    const { id } = await params;
    const removed = await deleteBrief(id);
    if (!removed) return fail(404, 'NOT_FOUND', 'That brief no longer exists.');
    return ok({ deleted: true });
  } catch (error) {
    return errorResponse(error, 'briefs/delete');
  }
}
