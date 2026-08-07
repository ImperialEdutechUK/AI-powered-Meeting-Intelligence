import type { Metadata } from 'next';
import { FileCheck2, ShieldCheck, Timer } from 'lucide-react';

import { NewBriefForm } from '@/components/app/NewBriefForm';
import { Card, Kicker } from '@/components/ui';
import { frontendEnv } from '@/lib/env';
import { formatCost } from '@/lib/utils';

export const metadata: Metadata = { title: 'New brief' };
export const dynamic = 'force-dynamic';

export default function NewBriefPage() {
  const env = frontendEnv();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-9">
      <header className="mb-6">
        <Kicker>New brief</Kicker>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">
          Turn a transcript into something people will read
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-500">
          Drop in a Teams transcript. You get a designed, single-purpose brief with the
          decisions, owners and dates pulled out — and every figure in it checked back
          against the source.
        </p>
      </header>

      {/* Bento strip: three things worth knowing before the first upload. */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Timer className="size-[18px]" aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-bold text-ink-900">Around 30 seconds</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            A one-hour meeting costs roughly {formatCost(0.002)} to process.
          </p>
        </Card>

        <Card className="p-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <ShieldCheck className="size-[18px]" aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-bold text-ink-900">Figures are verified</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            Every number and name is matched against the transcript before you export.
          </p>
        </Card>

        <Card className="p-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <FileCheck2 className="size-[18px]" aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-bold text-ink-900">PDF and Word out</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            Print-ready A4, plus an editable .docx to amend before circulating.
          </p>
        </Card>
      </div>

      <NewBriefForm maxUploadMb={env.MAX_UPLOAD_MB} />
    </div>
  );
}
