import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { BriefDocument } from '@/components/brief/BriefDocument';
import { DocumentFrame } from '@/components/brief/DocumentFrame';
import { GroundingPanel } from '@/components/brief/GroundingPanel';
import { ExportBar } from '@/components/app/ExportBar';
import { Kicker, Notice, Pill } from '@/components/ui';
import { frontendEnv } from '@/lib/env';
import { backendFetch, backendJson } from '@/lib/backend';
import type { BriefRecord } from '@/lib/api-types';
import { getBundleDepartments } from '@/lib/departments';
import { HUES } from '@/lib/theme';
import { formatRelative, joinNames } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function fetchBrief(id: string): Promise<
  { status: 'ok'; record: BriefRecord } | { status: 'not-found' } | { status: 'corrupt'; detail?: string }
> {
  const response = await backendFetch(`/api/briefs/${id}`);
  if (response.status === 404) return { status: 'not-found' };
  const body = (await response.json()) as {
    ok: boolean;
    data?: BriefRecord;
    error?: { code: string; detail?: string };
  };
  if (!body.ok || !body.data) {
    if (body.error?.code === 'BRIEF_CORRUPT') return { status: 'corrupt', detail: body.error.detail };
    return { status: 'not-found' };
  }
  return { status: 'ok', record: body.data };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const record = await backendJson<BriefRecord>(`/api/briefs/${id}`);
    return { title: record.bundle.brief.title };
  } catch {
    return { title: 'Brief' };
  }
}

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await fetchBrief(id);
  if (result.status === 'not-found') notFound();
  if (result.status === 'corrupt') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Notice tone="error" title="This brief cannot be opened">
          <p>
            It was saved by an incompatible version of the app. Regenerate it from the
            original transcript.
          </p>
          <p className="mt-2 font-mono text-[11px] opacity-70">{result.detail}</p>
        </Notice>
        <Link
          href="/library"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to the library
        </Link>
      </div>
    );
  }
  const record = result.record;

  const { bundle } = record;
  const departments = getBundleDepartments(bundle);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="no-print mb-5">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-400 transition-colors hover:text-ink-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Library
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Kicker>{joinNames(departments.map((d) => d.name))}</Kicker>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900">
              {bundle.brief.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {departments.map((d) => (
                <Pill
                  key={d.id}
                  className="border-transparent text-white"
                  // Department accent, matching the document itself.
                  style={{ backgroundColor: HUES[d.hue].hex.base }}
                >
                  {d.code}
                </Pill>
              ))}
              <span className="text-[12.5px] text-ink-400">
                {bundle.brief.dateLabel} · generated {formatRelative(bundle.generatedAt)}
                {record.createdBy && record.createdBy !== 'unnamed'
                  ? ` by ${record.createdBy}`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Preview */}
        <div className="min-w-0 lg:order-1">
          <DocumentFrame>
            <BriefDocument bundle={bundle} orgName={frontendEnv().ORG_NAME} />
          </DocumentFrame>
        </div>

        {/* Sidebar */}
        <div className="no-print space-y-5 lg:sticky lg:top-6 lg:order-2">
          <ExportBar id={record.id} title={bundle.brief.title} />
          <GroundingPanel bundle={bundle} />
        </div>
      </div>
    </div>
  );
}
