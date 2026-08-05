import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

import type { BriefBundle } from '@/lib/brief-bundle';
import { Card, Kicker, Pill } from '@/components/ui';
import { cn, formatCost, formatNumber } from '@/lib/utils';

/**
 * Verification report.
 *
 * Shown next to the preview, before anyone exports. The point is that a claim the
 * transcript does not support is visible rather than buried — the document is the
 * output of a language model, and the honest thing to do is say which parts the
 * automated checks could not confirm.
 */

const SEVERITY_STYLES = {
  high: 'border-red-200 bg-red-50 text-red-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-ink-200 bg-ink-50 text-ink-600',
} as const;

const SEVERITY_LABEL = {
  high: 'Check this',
  medium: 'Worth a look',
  low: 'Note',
} as const;

export function GroundingPanel({ bundle }: { bundle: BriefBundle }) {
  const { grounding, telemetry, transcript } = bundle;
  const high = grounding.findings.filter((f) => f.severity === 'high');
  const others = grounding.findings.filter((f) => f.severity !== 'high');

  const tone =
    high.length > 0 ? 'high' : grounding.findings.length > 0 ? 'medium' : 'clean';

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex items-start gap-3 border-b px-5 py-4',
          tone === 'high'
            ? 'border-red-100 bg-red-50/60'
            : tone === 'medium'
              ? 'border-amber-100 bg-amber-50/60'
              : 'border-teal-100 bg-teal-50/60',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl',
            tone === 'high'
              ? 'bg-red-600 text-white'
              : tone === 'medium'
                ? 'bg-amber-500 text-white'
                : 'bg-teal-600 text-white',
          )}
        >
          {tone === 'clean' ? (
            <CheckCircle2 className="size-5" aria-hidden />
          ) : (
            <AlertTriangle className="size-5" aria-hidden />
          )}
        </span>

        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink-900">
            {tone === 'clean'
              ? 'Every figure and name checked out'
              : high.length > 0
                ? `${high.length} ${high.length === 1 ? 'item needs' : 'items need'} checking before you circulate this`
                : 'Minor points to be aware of'}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
            {formatNumber(grounding.checked.numbers)} figures and{' '}
            {formatNumber(grounding.checked.people)} names were matched against the
            transcript and the context you supplied.
          </p>
        </div>

        <Pill
          className={cn(
            'ml-auto shrink-0',
            tone === 'high'
              ? 'border-red-300 bg-white text-red-800'
              : tone === 'medium'
                ? 'border-amber-300 bg-white text-amber-800'
                : 'border-teal-300 bg-white text-teal-800',
          )}
        >
          {grounding.score}%
        </Pill>
      </div>

      {grounding.findings.length > 0 ? (
        <ul className="divide-y divide-ink-100">
          {[...high, ...others].map((finding, index) => (
            <li key={`${finding.kind}-${finding.value}-${index}`} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill className={SEVERITY_STYLES[finding.severity]}>
                  {SEVERITY_LABEL[finding.severity]}
                </Pill>
                <span className="text-[12px] font-semibold text-ink-500">
                  {finding.location}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">
                {finding.message}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-4">
        <Kicker>How this was made</Kicker>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
          <Stat label="Model" value={shortModel(telemetry.model)} />
          <Stat
            label="Strategy"
            value={telemetry.strategy === 'single-pass' ? 'Single pass' : 'Map-reduce'}
          />
          <Stat label="Cost" value={formatCost(telemetry.costUsd)} />
          <Stat label="Tokens in" value={formatNumber(telemetry.usage.promptTokens)} />
          <Stat label="Tokens out" value={formatNumber(telemetry.usage.completionTokens)} />
          <Stat label="Took" value={`${(telemetry.durationMs / 1000).toFixed(1)}s`} />
        </dl>

        {(telemetry.retries > 0 ||
          telemetry.repaired ||
          telemetry.truncatedOutput ||
          telemetry.truncatedInput) && (
          <ul className="mt-3 space-y-1">
            {telemetry.retries > 0 ? (
              <Caveat>
                The first attempt was rejected as too thin and regenerated.
              </Caveat>
            ) : null}
            {telemetry.repaired ? (
              <Caveat>The model&rsquo;s JSON needed repairing before it could be read.</Caveat>
            ) : null}
            {telemetry.truncatedOutput ? (
              <Caveat>
                The model hit its output ceiling, so the tail of the brief may be
                incomplete. Compare against the transcript.
              </Caveat>
            ) : null}
            {telemetry.truncatedInput ? (
              <Caveat>
                The transcript exceeded the input limit and was truncated; later parts of
                the meeting may be under-represented.
              </Caveat>
            ) : null}
          </ul>
        )}

        {transcript.warnings.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {transcript.warnings.map((warning) => (
              <Caveat key={warning}>{warning}</Caveat>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </dt>
      <dd className="tnum mt-0.5 truncate text-[13px] font-semibold text-ink-800">
        {value}
      </dd>
    </div>
  );
}

function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-[12px] leading-relaxed text-ink-500">
      <Info className="mt-0.5 size-3.5 shrink-0 text-ink-300" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/**
 * `deepseek/deepseek-v4-flash` -> `DeepSeek V4 Flash`.
 * The raw slug truncates in a three-column grid and reads like plumbing.
 */
function shortModel(model: string): string {
  const slug = model.slice(model.lastIndexOf('/') + 1);
  const pretty = slug
    .split('-')
    .filter(Boolean)
    .map((part) => {
      if (/^v\d+/i.test(part)) return part.toUpperCase();
      if (part.toLowerCase() === 'deepseek') return 'DeepSeek';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
  return pretty || slug;
}
