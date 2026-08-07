'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, FileUp } from 'lucide-react';

import { BriefDocument } from '@/components/brief/BriefDocument';
import { DocumentFrame } from '@/components/brief/DocumentFrame';
import { GroundingPanel } from '@/components/brief/GroundingPanel';
import { ExportBar } from '@/components/app/ExportBar';
import { Button, Card, Kicker, Notice, Pill } from '@/components/ui';
import { getBundleDepartments } from '@/lib/departments';
import { HUES } from '@/lib/theme';
import type { BriefBundle } from '@/lib/brief-bundle';
import { readPendingBrief } from '@/lib/pending-brief';
import { formatRelative, joinNames } from '@/lib/utils';

/**
 * The just-generated brief, held entirely in the browser.
 *
 * There is no id and nothing to fetch: `NewBriefForm` writes the bundle to
 * `sessionStorage` right before navigating here, and this reads it back. A
 * direct visit (bookmark, refresh after the tab already lost the value, link
 * shared with someone else) finds nothing — which is expected, since nothing
 * was ever saved anywhere to find.
 */
export function BriefPreview({ orgName }: { orgName: string }) {
  const [bundle, setBundle] = useState<BriefBundle | null | undefined>(undefined);

  // sessionStorage does not exist during server rendering, so this can only be
  // read after mount — an intentional one-time sync from a browser-only store,
  // not the render-driven update the lint rule guards against.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBundle(readPendingBrief());
  }, []);

  if (bundle === undefined) return null;

  if (bundle === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Notice tone="error" title="Nothing to show here">
          <p>
            Generated briefs aren&rsquo;t stored, so this page only works right after you
            generate one. Start a new one below.
          </p>
        </Notice>
        <Link href="/new" className="mt-5 inline-block">
          <Button>
            <FileUp className="size-[18px]" aria-hidden />
            New brief
          </Button>
        </Link>
      </div>
    );
  }

  const departments = getBundleDepartments(bundle);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="no-print mb-5">
        <Link
          href="/new"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-400 transition-colors hover:text-ink-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          New brief
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
                  style={{ backgroundColor: HUES[d.hue].hex.base }}
                >
                  {d.code}
                </Pill>
              ))}
              <span className="text-[12.5px] text-ink-400">
                {bundle.brief.dateLabel} · generated {formatRelative(bundle.generatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 lg:order-1">
          <DocumentFrame>
            <BriefDocument bundle={bundle} orgName={orgName} />
          </DocumentFrame>
        </div>

        <div className="no-print space-y-5 lg:sticky lg:top-6 lg:order-2">
          <Card className="p-4">
            <p className="text-[12px] leading-relaxed text-ink-500">
              This document exists only in this tab. Download it now — closing the tab
              or navigating away loses it for good.
            </p>
          </Card>
          <ExportBar bundle={bundle} title={bundle.brief.title} />
          <GroundingPanel bundle={bundle} />
        </div>
      </div>
    </div>
  );
}
