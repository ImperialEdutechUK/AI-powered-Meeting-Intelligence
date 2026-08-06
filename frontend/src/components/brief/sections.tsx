import { cn, joinNames } from '@/lib/utils';
import type { Department, Hue } from '@/lib/departments';
import {
  callout as calloutTokens,
  hue as hueTokens,
  rotateHue,
  timelineDot,
} from '@/lib/theme';
import type {
  Brief,
  BriefItem,
  BriefSpotlight,
  BriefTrack,
} from '@/lib/ai/schema';
import type { TranscriptFacts } from '@/lib/brief-bundle';
import { formatDuration } from '@/lib/transcript/cues';
import { sharePctLabel } from '@/lib/transcript/stats';
import {
  Chip,
  Eyebrow,
  MetaChip,
  OwnerTag,
  RailCard,
  Rule,
  SectionHeading,
} from './primitives';

/* ========================================================================= */
/* Hero                                                                      */
/* ========================================================================= */

export function DocHero({
  brief,
  department,
  departments,
  confidentialityLabel,
}: {
  brief: Brief;
  /** Primary department: seeds the hero's accent colour. */
  department: Department;
  /** Every department selected, primary first — named in full in the eyebrow. */
  departments: Department[];
  confidentialityLabel: string;
}) {
  const tokens = hueTokens(department.hue);
  return (
    <header
      className="doc-keep relative overflow-hidden px-[12mm] pb-[26px] pt-[24px]"
      style={{
        // Every brief opens on the same near-black-to-violet base so the family
        // is recognisable, then resolves into the department's accent.
        background: `linear-gradient(112deg, #0B0616 0%, #170E2B 26%, #341459 56%, ${tokens.hex.deep} 88%, ${tokens.hex.base} 100%)`,
      }}
    >
      {/* Soft radial bloom in the top-right, as in the reference document. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[60px] -top-[90px] size-[300px] rounded-full opacity-35"
        style={{
          background: `radial-gradient(circle, ${tokens.hex.mid}66 0%, transparent 68%)`,
        }}
      />

      <div className="relative">
        <Eyebrow className="text-teal-300">
          Action Brief · {joinNames(departments.map((d) => d.name))}
        </Eyebrow>

        <div
          className={cn(
            'mt-[14px] flex size-[34px] items-center justify-center rounded-[10px]',
            tokens.solid,
          )}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="size-[17px]" fill="none">
            <path
              d="M4.5 12.5l5 5 10-11"
              stroke="white"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="mt-[11px] max-w-[150mm] text-[34px] font-extrabold leading-[1.06] tracking-[-0.025em] text-white">
          {brief.title}
        </h1>

        {brief.summary ? (
          <p className="mt-[9px] max-w-[152mm] text-[11.5px] leading-[1.5] text-white/72">
            {brief.summary}
          </p>
        ) : null}

        {brief.metaChips.length > 0 || confidentialityLabel ? (
          <div className="mt-[14px] flex flex-wrap gap-[6px]">
            {brief.metaChips.map((label) => (
              <MetaChip key={label}>{label}</MetaChip>
            ))}
            {confidentialityLabel ? <MetaChip>{confidentialityLabel}</MetaChip> : null}
          </div>
        ) : null}
      </div>

      {/* Small coral tab at the hero's bottom edge, as in the reference. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-[12mm] h-[3px] w-[46px] bg-orange-500"
      />
    </header>
  );
}

/* ========================================================================= */
/* Attendees                                                                 */
/* ========================================================================= */

export function DocAttendees({ brief }: { brief: Brief }) {
  if (brief.attendees.length === 0 && brief.absentees.length === 0) return null;
  return (
    <section className="doc-inset doc-keep pt-[16px]">
      {brief.attendees.length > 0 ? (
        <p className="text-[9.5px] leading-[1.6] text-ink-400">
          <span className="font-semibold text-ink-600">Attendees:</span>{' '}
          {joinNames(brief.attendees)}
        </p>
      ) : null}
      {brief.absentees.length > 0 ? (
        <p className="mt-[3px] text-[9.5px] leading-[1.6] text-ink-400">
          <span className="font-semibold text-ink-600">Apologies:</span>{' '}
          {joinNames(brief.absentees)}
        </p>
      ) : null}
    </section>
  );
}

/* ========================================================================= */
/* Spotlights                                                                */
/* ========================================================================= */

function SpotlightCard({ spotlight }: { spotlight: BriefSpotlight }) {
  const tokens = calloutTokens(spotlight.tone);
  return (
    <div
      className={cn(
        'doc-keep flex overflow-hidden rounded-[9px]',
        tokens.surface,
      )}
    >
      <span aria-hidden className={cn('w-[3px] shrink-0', tokens.rail)} />
      <div className="flex min-w-0 flex-1 gap-[10px] px-[12px] py-[11px]">
        <span
          aria-hidden
          className={cn(
            'mt-[1px] flex size-[20px] shrink-0 items-center justify-center rounded-[6px] text-[10px] font-bold leading-none',
            tokens.iconWrap,
          )}
        >
          {spotlight.tone === 'critical'
            ? '!'
            : spotlight.tone === 'warning'
              ? '▲'
              : spotlight.tone === 'positive'
                ? '✓'
                : 'i'}
        </span>
        <div className="min-w-0">
          <h3 className={cn('text-[11.5px] font-bold leading-[1.35]', tokens.title)}>
            {spotlight.title}
          </h3>
          <p className={cn('mt-[3px] text-[10px] leading-[1.55]', tokens.body)}>
            {spotlight.body}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DocSpotlights({ brief }: { brief: Brief }) {
  if (brief.spotlights.length === 0) return null;
  return (
    <section className="doc-inset pt-[16px]">
      <div className="flex flex-col gap-[9px]">
        {brief.spotlights.map((spotlight) => (
          <SpotlightCard key={spotlight.title} spotlight={spotlight} />
        ))}
      </div>
    </section>
  );
}

/* ========================================================================= */
/* Metrics bento                                                             */
/* ========================================================================= */

export function DocMetrics({ brief, seed }: { brief: Brief; seed: Hue }) {
  if (brief.metrics.length === 0) return null;
  const count = brief.metrics.length;
  // Two rows read better than one cramped row past four cards.
  const columns = count <= 4 ? count : count === 5 ? 5 : 3;

  return (
    <section className="doc-inset pt-[20px]">
      <SectionHeading accent={seed}>At a Glance — Numbers</SectionHeading>
      <div
        className="mt-[10px] grid overflow-hidden rounded-[10px] bg-white shadow-[0_1px_2px_rgba(15,6,22,0.05)]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {brief.metrics.map((metric, index) => {
          const tokens = hueTokens(rotateHue(index, seed));
          return (
            <div
              key={`${metric.value}-${metric.label}`}
              className="doc-keep relative border-r border-ink-100 px-[10px] pb-[13px] pt-[14px] text-center last:border-r-0"
            >
              <span
                aria-hidden
                className={cn('absolute inset-x-0 top-0 h-[3px]', tokens.topRail)}
              />
              <p className="tnum text-[26px] font-bold leading-none tracking-[-0.03em] text-ink-900">
                {metric.value}
              </p>
              <p
                className={cn(
                  'mx-auto mt-[7px] max-w-[34mm] text-[8px] font-semibold leading-[1.4]',
                  tokens.textStrong,
                )}
              >
                {metric.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ========================================================================= */
/* Tracks                                                                    */
/* ========================================================================= */

function ItemCard({
  item,
  index,
  accent,
  departmentCode,
}: {
  item: BriefItem;
  index: number;
  accent: Hue;
  departmentCode: string;
}) {
  const tokens = hueTokens(accent);
  const ownerLabel =
    item.owners.length > 0
      ? `${departmentCode} · ${item.owners.join(' · ')}`
      : departmentCode;

  return (
    <RailCard accent={accent}>
      <div className="flex items-start gap-[9px]">
        <span
          aria-hidden
          className={cn(
            'tnum shrink-0 text-[15px] font-bold leading-[1.25] tracking-[-0.02em]',
            tokens.text,
          )}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <h4 className="min-w-0 flex-1 text-[13px] font-bold leading-[1.32] tracking-[-0.008em] text-ink-900">
          {item.title}
        </h4>
        <OwnerTag accent={accent}>{ownerLabel}</OwnerTag>
      </div>

      <p className="mt-[5px] pl-[24px] text-[10.5px] leading-[1.58] text-ink-600">
        {item.body}
      </p>

      {item.chips.length > 0 ? (
        <div className="mt-[8px] flex flex-wrap gap-[5px] pl-[24px]">
          {item.chips.map((c) => (
            <Chip key={`${c.kind}-${c.text}`} kind={c.kind}>
              {c.text}
            </Chip>
          ))}
        </div>
      ) : null}
    </RailCard>
  );
}

export function DocTrack({
  track,
  accent,
  departmentCode,
}: {
  track: BriefTrack;
  accent: Hue;
  departmentCode: string;
}) {
  const tokens = hueTokens(accent);
  return (
    <section className="doc-inset pt-[20px]">
      <div className="doc-keep flex items-start gap-[10px]">
        <span
          className={cn(
            'mt-[4px] shrink-0 rounded-[5px] px-[7px] py-[3.5px] text-[7.5px] font-bold uppercase leading-none tracking-[0.13em]',
            tokens.solid,
            tokens.onSolid,
          )}
        >
          Track {track.code}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-[1.2] tracking-[-0.012em] text-ink-900">
            {track.title}
          </h3>
          {track.leads.length > 0 ? (
            <p className="mt-[2px] text-[9px] leading-[1.4] text-ink-400">
              Led by {joinNames(track.leads)}
            </p>
          ) : null}
        </div>
      </div>

      <Rule className="mt-[8px]" />

      <div className="mt-[9px] flex flex-col gap-[8px]">
        {track.items.map((item, index) => (
          <ItemCard
            key={item.title}
            item={item}
            index={index}
            accent={accent}
            departmentCode={departmentCode}
          />
        ))}
      </div>
    </section>
  );
}

/* ========================================================================= */
/* Direction panel                                                           */
/* ========================================================================= */

export function DocDirection({ brief, seed }: { brief: Brief; seed: Hue }) {
  const direction = brief.direction;
  if (!direction) return null;
  const tokens = hueTokens(seed);

  return (
    <section className="doc-inset pt-[22px]">
      <div className="doc-keep overflow-hidden rounded-[10px] bg-white shadow-[0_1px_2px_rgba(15,6,22,0.05)]">
        <span aria-hidden className={cn('block h-[3px] w-full', tokens.rail)} />
        <div className="px-[15px] pb-[14px] pt-[13px]">
          <Eyebrow className={tokens.textStrong}>{direction.eyebrow}</Eyebrow>
          <h3 className="mt-[7px] text-[13px] font-bold leading-[1.3] text-ink-900">
            {direction.title}
          </h3>
          <ul className="mt-[9px] divide-y divide-ink-100">
            {direction.bullets.map((bullet) => (
              <li key={bullet.text} className="doc-keep flex gap-[8px] py-[7px]">
                <span
                  aria-hidden
                  className={cn('shrink-0 text-[11px] font-bold leading-[1.5]', tokens.text)}
                >
                  ›
                </span>
                <p className="min-w-0 text-[10.5px] leading-[1.55] text-ink-600">
                  {bullet.lead ? (
                    <span className="font-bold text-ink-900">{bullet.lead} </span>
                  ) : null}
                  {bullet.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================= */
/* Do first                                                                  */
/* ========================================================================= */

export function DocDoFirst({ brief }: { brief: Brief }) {
  if (brief.doFirst.length === 0) return null;

  return (
    <section className="doc-inset pt-[22px]">
      <div
        className="doc-keep overflow-hidden rounded-[10px] px-[16px] pb-[15px] pt-[14px]"
        style={{ background: 'linear-gradient(135deg, #170E28 0%, #241546 100%)' }}
      >
        <Eyebrow className="text-orange-400">Do First · Most Time-Bound Items</Eyebrow>
        <h3 className="mt-[7px] text-[13px] font-bold leading-[1.3] text-white">
          {brief.doFirst.length === 1
            ? 'One thing to action immediately'
            : `${brief.doFirst.length === 2 ? 'Two' : 'Three'} to action immediately`}
        </h3>
        <ol className="mt-[10px] divide-y divide-white/10">
          {brief.doFirst.map((entry, index) => (
            <li key={entry.action} className="doc-keep flex gap-[9px] py-[8px]">
              <span
                aria-hidden
                className="mt-[1px] flex size-[16px] shrink-0 items-center justify-center rounded-full bg-orange-500 text-[8.5px] font-bold leading-none text-white"
              >
                {index + 1}
              </span>
              <p className="min-w-0 text-[10.5px] leading-[1.55] text-white/85">
                {entry.owner ? (
                  <span className="font-bold text-white">{entry.owner} — </span>
                ) : null}
                {entry.action}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ========================================================================= */
/* Decisions and risks                                                       */
/* ========================================================================= */

const DECISION_LABEL: Record<string, { text: string; className: string }> = {
  agreed: { text: 'Agreed', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  deferred: { text: 'Deferred', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected: { text: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
};

const SEVERITY_LABEL: Record<string, { text: string; className: string }> = {
  high: { text: 'High', className: 'bg-red-50 text-red-700 border-red-200' },
  medium: { text: 'Medium', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { text: 'Low', className: 'bg-slate-100 text-slate-700 border-slate-300' },
};

export function DocDecisionsAndRisks({ brief, seed }: { brief: Brief; seed: Hue }) {
  const hasDecisions = brief.decisions.length > 0;
  const hasRisks = brief.risks.length > 0;
  if (!hasDecisions && !hasRisks) return null;
  const bothColumns = hasDecisions && hasRisks;

  return (
    <section className="doc-inset pt-[22px]">
      <SectionHeading accent={seed}>Decisions & Risks</SectionHeading>
      <div
        className={cn('mt-[10px] grid gap-[9px]', bothColumns ? 'grid-cols-2' : 'grid-cols-1')}
      >
        {hasDecisions ? (
          <div className="doc-keep rounded-[10px] bg-white px-[13px] py-[11px] shadow-[0_1px_2px_rgba(15,6,22,0.05)]">
            <Eyebrow className="text-violet-700">Decided</Eyebrow>
            <ul className="mt-[8px] divide-y divide-ink-100">
              {brief.decisions.map((decision) => {
                const label = DECISION_LABEL[decision.status] ?? DECISION_LABEL.agreed!;
                return (
                  <li key={decision.text} className="doc-keep py-[6px]">
                    <div className="flex items-start gap-[7px]">
                      <span
                        className={cn(
                          'mt-[1px] shrink-0 rounded-full border px-[6px] py-[2px] text-[7.5px] font-bold uppercase leading-none tracking-[0.06em]',
                          label.className,
                        )}
                      >
                        {label.text}
                      </span>
                      <p className="min-w-0 text-[10px] leading-[1.5] text-ink-600">
                        {decision.text}
                        {decision.owner ? (
                          <span className="text-ink-400"> — {decision.owner}</span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {hasRisks ? (
          <div className="doc-keep rounded-[10px] bg-white px-[13px] py-[11px] shadow-[0_1px_2px_rgba(15,6,22,0.05)]">
            <Eyebrow className="text-rose-700">Risks & Blockers</Eyebrow>
            <ul className="mt-[8px] divide-y divide-ink-100">
              {brief.risks.map((risk) => {
                const label = SEVERITY_LABEL[risk.severity] ?? SEVERITY_LABEL.medium!;
                return (
                  <li key={risk.text} className="doc-keep py-[6px]">
                    <div className="flex items-start gap-[7px]">
                      <span
                        className={cn(
                          'mt-[1px] shrink-0 rounded-full border px-[6px] py-[2px] text-[7.5px] font-bold uppercase leading-none tracking-[0.06em]',
                          label.className,
                        )}
                      >
                        {label.text}
                      </span>
                      <p className="min-w-0 text-[10px] leading-[1.5] text-ink-600">
                        {risk.text}
                        {risk.owner ? (
                          <span className="text-ink-400"> — {risk.owner}</span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {brief.openQuestions.length > 0 ? (
        <div className="doc-keep mt-[9px] rounded-[10px] border border-dashed border-ink-200 bg-white/60 px-[13px] py-[10px]">
          <Eyebrow className="text-ink-500">Open Questions</Eyebrow>
          <ul className="mt-[6px] flex flex-col gap-[3px]">
            {brief.openQuestions.map((question) => (
              <li key={question} className="flex gap-[6px] text-[10px] leading-[1.5] text-ink-600">
                <span aria-hidden className="shrink-0 font-bold text-ink-300">
                  ?
                </span>
                <span className="min-w-0">{question}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* ========================================================================= */
/* Owners                                                                    */
/* ========================================================================= */

export function DocOwners({ brief, seed }: { brief: Brief; seed: Hue }) {
  if (brief.owners.length === 0 && !brief.ownersNote) return null;

  return (
    <section className="doc-inset pt-[22px]">
      <SectionHeading accent={seed}>Who&rsquo;s Owning What</SectionHeading>

      {brief.owners.length > 0 ? (
        <div className="mt-[10px] grid grid-cols-2 gap-x-[9px] gap-y-[9px]">
          {brief.owners.map((owner) => (
            <div
              key={owner.name}
              className="doc-keep rounded-[9px] bg-white px-[11px] py-[10px] shadow-[0_1px_2px_rgba(15,6,22,0.05)]"
            >
              <p className="text-[11px] font-bold leading-[1.3] text-ink-900">{owner.name}</p>
              {owner.role ? (
                <p className="mt-[1px] text-[8.5px] font-semibold leading-[1.35] text-ink-400">
                  {owner.role}
                </p>
              ) : null}
              <p className="mt-[4px] text-[9.5px] leading-[1.5] text-ink-600">
                {owner.assignment}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {brief.ownersNote ? (
        <p className="doc-keep mt-[10px] text-[9.5px] leading-[1.6] text-ink-400">
          {brief.ownersNote}
        </p>
      ) : null}
    </section>
  );
}

/* ========================================================================= */
/* Timeline                                                                  */
/* ========================================================================= */

export function DocTimeline({ brief, seed }: { brief: Brief; seed: Hue }) {
  if (brief.timeline.length === 0) return null;
  const steps = brief.timeline;

  return (
    <section className="doc-inset pt-[22px]">
      <SectionHeading accent={seed}>Deadlines &amp; Next Steps</SectionHeading>

      <div className="doc-keep relative mt-[16px] pt-[10px]">
        {/* The rainbow rule, inset so it starts and ends under the first and
            last dots rather than running off the edge. */}
        <div
          aria-hidden
          className="absolute left-[8%] right-[8%] top-0 h-[2.5px] rounded-full"
          style={{
            background:
              'linear-gradient(90deg, #F97316 0%, #F59E0B 25%, #14B8A6 50%, #7C3AED 75%, #EC4899 100%)',
          }}
        />
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((step, index) => (
            <div key={`${step.when}-${step.what}`} className="px-[5px] text-center">
              <span
                aria-hidden
                className={cn(
                  'mx-auto -mt-[16px] block size-[10px] rounded-full border-[2.5px] bg-white',
                  timelineDot(index),
                )}
              />
              <p className="mt-[7px] text-[11px] font-bold leading-[1.25] text-ink-900">
                {step.when}
              </p>
              <p className="mt-[3px] text-[9px] leading-[1.45] text-ink-500">{step.what}</p>
              {step.who.length > 0 ? (
                <p className="mt-[3px] text-[8.5px] font-semibold leading-[1.4] text-ink-400">
                  {joinNames(step.who)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================================================= */
/* Participation — measured, not generated                                   */
/* ========================================================================= */

export function DocParticipation({
  facts,
  seed,
}: {
  facts: TranscriptFacts;
  seed: Hue;
}) {
  const MAX_ROWS = 14;
  const speakers = facts.speakers.slice(0, MAX_ROWS);
  const hidden = facts.speakers.length - speakers.length;
  if (speakers.length < 2) return null;
  const max = Math.max(...speakers.map((s) => s.sharePct), 1);

  return (
    <section className="doc-inset pt-[22px]">
      <SectionHeading accent={seed}>Participation — Measured from the Transcript</SectionHeading>

      <div className="doc-keep mt-[10px] rounded-[10px] bg-white px-[14px] py-[12px] shadow-[0_1px_2px_rgba(15,6,22,0.05)]">
        <div className="flex flex-wrap gap-x-[16px] gap-y-[4px] border-b border-ink-100 pb-[9px]">
          <Stat label="Speakers" value={String(facts.speakers.length)} />
          <Stat label="Turns" value={String(facts.totalCues)} />
          <Stat
            label="Words"
            value={new Intl.NumberFormat('en-GB').format(facts.totalWords)}
          />
          <Stat label="Dialogue length" value={formatDuration(facts.durationMs)} />
        </div>

        <ul className="mt-[10px] flex flex-col gap-[6px]">
          {speakers.map((speaker, index) => {
            const tokens = hueTokens(rotateHue(index, seed));
            return (
              <li key={speaker.name} className="flex items-center gap-[9px]">
                <span className="w-[38mm] shrink-0 truncate text-[9.5px] font-semibold leading-[1.4] text-ink-700">
                  {speaker.name}
                </span>
                <span
                  aria-hidden
                  className="relative h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100"
                >
                  <span
                    className={cn('absolute inset-y-0 left-0 rounded-full', tokens.rail)}
                    style={{ width: `${Math.max((speaker.sharePct / max) * 100, 1.5)}%` }}
                  />
                </span>
                <span className="tnum w-[13mm] shrink-0 text-right text-[9px] font-bold leading-[1.4] text-ink-600">
                  {sharePctLabel(speaker.sharePct)}
                </span>
                <span className="tnum w-[16mm] shrink-0 text-right text-[8.5px] leading-[1.4] text-ink-400">
                  {speaker.turns} turns
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-[9px] text-[8.5px] leading-[1.5] text-ink-400">
          Share of spoken words per person, counted directly from the transcript. Not an
          indicator of contribution quality.
          {hidden > 0
            ? ` ${hidden} further ${hidden === 1 ? 'speaker' : 'speakers'} not shown.`
            : ''}
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[7.5px] font-bold uppercase leading-none tracking-[0.14em] text-ink-400">
        {label}
      </p>
      <p className="tnum mt-[3px] text-[13px] font-bold leading-none text-ink-900">{value}</p>
    </div>
  );
}

/* ========================================================================= */
/* Footer                                                                    */
/* ========================================================================= */

export function DocFooter({
  brief,
  departments,
  orgName,
  generatedLabel,
  confidentialityLabel,
}: {
  brief: Brief;
  /** Every department selected, primary first — every code is shown. */
  departments: Department[];
  orgName: string;
  generatedLabel: string;
  confidentialityLabel: string;
}) {
  return (
    <footer className="doc-keep mt-[26px]">
      <div
        className="flex items-center justify-between gap-[12px] px-[12mm] py-[13px]"
        style={{ background: 'linear-gradient(135deg, #170E28 0%, #2A1B4A 100%)' }}
      >
        <p className="text-[9.5px] leading-[1.4] text-white/70">
          <span className="font-bold text-white">
            {departments.map((d) => d.code).join('/')}
          </span>{' '}
          · {brief.title} · {brief.dateLabel}
        </p>
        {brief.footerTags.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-[5px]">
            {brief.footerTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/12 px-[8px] py-[3px] text-[8px] font-semibold leading-none text-white/90"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="bg-[#0B0616] px-[12mm] py-[11px]">
        <p className="text-[8px] leading-[1.6] text-white/60">
          {orgName} · {confidentialityLabel} · {generatedLabel}. Written by an AI model from
          the meeting transcript and checked against it automatically. Verify anything
          consequential against the recording before acting on it. Relative dates
          (&ldquo;today&rdquo;, &ldquo;tomorrow&rdquo;, &ldquo;ASAP&rdquo;) are as stated in
          the meeting on {brief.dateLabel}.
        </p>
      </div>
    </footer>
  );
}
