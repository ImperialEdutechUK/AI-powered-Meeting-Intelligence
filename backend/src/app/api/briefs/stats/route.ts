import { NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth';
import { errorResponse, ok, unauthorised } from '@/lib/api';
import { countByDepartment, totals } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aggregate figures for the library and new-brief dashboards.
 *
 * Split out from GET /api/briefs (which only lists rows) because the frontend
 * now reaches the database exclusively through the API — it can no longer call
 * `countByDepartment()`/`totals()` in-process the way the original single-app
 * pages did.
 */
export async function GET(): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();

    const [byDepartment, overall] = await Promise.all([countByDepartment(), totals()]);

    return ok({ byDepartment, totals: overall });
  } catch (error) {
    return errorResponse(error, 'briefs/stats');
  }
}
