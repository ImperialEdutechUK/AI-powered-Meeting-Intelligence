import { NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth';
import { errorResponse, fail, ok, unauthorised } from '@/lib/api';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { BriefInputsSchema, parseRoster } from '@/lib/brief-inputs';
import { ingestTranscript } from '@/lib/transcript';
import { generateBrief } from '@/lib/ai/generate';
import { checkGrounding } from '@/lib/qa/grounding';
import { BUNDLE_VERSION, BriefBundleSchema, type BriefBundle } from '@/lib/brief-bundle';
import { createBrief, listBriefs } from '@/lib/repository';
import { isDepartmentId } from '@/lib/departments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Generation is a long request; allow it the time the model may need. */
export const maxDuration = 600;

/* ------------------------------------------------------------------------- */
/* GET — list                                                                */
/* ------------------------------------------------------------------------- */

export async function GET(request: Request): Promise<NextResponse> {
  try {
    if (!(await currentSession())) return unauthorised();

    const url = new URL(request.url);
    const departmentParam = url.searchParams.get('department') ?? 'all';
    const department =
      departmentParam === 'all' || isDepartmentId(departmentParam)
        ? departmentParam
        : 'all';

    const result = await listBriefs({
      department,
      search: url.searchParams.get('q') ?? '',
      limit: Number(url.searchParams.get('limit') ?? 30),
      offset: Number(url.searchParams.get('offset') ?? 0),
    });

    return ok(result);
  } catch (error) {
    return errorResponse(error, 'briefs/list');
  }
}

/* ------------------------------------------------------------------------- */
/* POST — generate                                                           */
/* ------------------------------------------------------------------------- */

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await currentSession();
    if (!session) return unauthorised();

    const env = serverEnv();
    const ip = clientIp(request.headers);

    const verdict = await checkRateLimit(ip, 'generate');
    if (!verdict.allowed) {
      return fail(
        429,
        'RATE_LIMITED',
        `You have generated ${verdict.limit} briefs in the last hour, which is the limit. Try again shortly.`,
        undefined,
        { retryAfterSeconds: verdict.retryAfterSeconds },
      );
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return fail(415, 'BAD_CONTENT_TYPE', 'Upload the transcript as form data.');
    }

    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;

    /*
     * Reject on the declared length before touching the body. `formData()`
     * buffers the entire request into memory, so checking the file size after
     * parsing would already have allowed an arbitrarily large allocation.
     * The generous headroom covers multipart framing and the inputs field.
     */
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes + 2 * 1024 * 1024) {
      return fail(
        413,
        'TOO_LARGE',
        `That upload is ${(declaredLength / 1024 / 1024).toFixed(1)} MB. The limit is ${env.MAX_UPLOAD_MB} MB.`,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, 'BAD_FORM', 'The upload could not be read. Try again.');
    }

    const file = form.get('transcript');
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, 'NO_FILE', 'Attach a transcript file to generate a brief.');
    }

    if (file.size > maxBytes) {
      return fail(
        413,
        'TOO_LARGE',
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${env.MAX_UPLOAD_MB} MB.`,
      );
    }

    // Everything else arrives as a single JSON field so one schema validates it.
    const rawInputs = form.get('inputs');
    const parsedInputs = BriefInputsSchema.safeParse(
      typeof rawInputs === 'string' && rawInputs.trim()
        ? (JSON.parse(rawInputs) as unknown)
        : {},
    );
    if (!parsedInputs.success) {
      return fail(
        400,
        'BAD_INPUTS',
        'Some of the meeting details were not valid.',
        parsedInputs.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    }
    const inputs = parsedInputs.data;

    const roster = parseRoster(inputs.roster);
    const buffer = Buffer.from(await file.arrayBuffer());

    const transcript = await ingestTranscript({
      fileName: file.name,
      buffer,
      maxBytes,
      knownNames: roster.map((r) => r.name),
    });

    const { brief, telemetry } = await generateBrief({ inputs, transcript });

    const grounding = checkGrounding({
      brief,
      transcript,
      userContext: [
        inputs.meetingTitle,
        inputs.chair,
        inputs.roster,
        inputs.absentees,
        inputs.glossary,
        inputs.focus,
        inputs.previousContext,
      ].filter(Boolean),
      rosterNames: roster.map((r) => r.name),
    });

    const candidate: BriefBundle = {
      version: BUNDLE_VERSION,
      brief,
      department: inputs.department,
      meetingType: inputs.meetingType,
      confidentiality: inputs.confidentiality,
      transcript: {
        fileName: transcript.sourceName,
        format: transcript.format,
        hasTimings: transcript.stats.hasTimings,
        durationMs: transcript.stats.durationMs,
        totalWords: transcript.stats.totalWords,
        totalCues: transcript.stats.totalCues,
        speakers: transcript.stats.speakers,
        unattributedCues: transcript.stats.unattributedCues,
        warnings: transcript.warnings,
      },
      grounding,
      telemetry,
      generatedAt: new Date().toISOString(),
    };

    // Validate before persisting: a bad row must never reach the database.
    const bundle = BriefBundleSchema.safeParse(candidate);
    if (!bundle.success) {
      return fail(
        500,
        'BUNDLE_INVALID',
        'The brief was generated but failed its final integrity check. Nothing was saved.',
        bundle.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    }

    const id = await createBrief({
      bundle: bundle.data,
      meetingDate: inputs.meetingDate || null,
      createdBy: session.who || 'unnamed',
    });

    return ok({ id, grounding, telemetry, warnings: transcript.warnings }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'briefs/create');
  }
}
