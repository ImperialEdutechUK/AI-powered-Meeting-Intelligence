import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { BriefDocument } from '@/components/brief/BriefDocument';
import { SAMPLE_BUNDLE } from '@/lib/sample-brief';
import { DocumentFrame } from '@/components/brief/DocumentFrame';

export const metadata: Metadata = { title: 'Example brief' };

/**
 * A worked example, reachable without signing in.
 * Lets someone see the output before they upload a transcript.
 */
export default function ExamplePage() {
  return (
    <main className="min-h-dvh bg-canvas pb-16">
      <div className="no-print mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
            Example output
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-ink-900">
            What a generated brief looks like
          </h1>
        </div>
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      </div>

      <DocumentFrame>
        <BriefDocument bundle={SAMPLE_BUNDLE} orgName="Imperial Edutech" />
      </DocumentFrame>
    </main>
  );
}
