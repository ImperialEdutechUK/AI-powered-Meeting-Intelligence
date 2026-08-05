import { CONFIDENTIALITY_LEVELS, getDepartment } from '@/lib/departments';
import { rotateHue } from '@/lib/theme';
import type { BriefBundle } from '@/lib/brief-bundle';
import { formatTimestamp } from '@/lib/utils';
import {
  DocAttendees,
  DocDecisionsAndRisks,
  DocDirection,
  DocDoFirst,
  DocFooter,
  DocHero,
  DocMetrics,
  DocOwners,
  DocParticipation,
  DocSpotlights,
  DocTimeline,
  DocTrack,
} from './sections';

/**
 * The complete brief, laid out at exactly one A4 width.
 *
 * Pure and server-rendered: no client JavaScript, no effects, no measurement.
 * That is what lets the same component produce the on-screen preview and the
 * printed PDF with no divergence between them.
 *
 * Section order follows the reference document, with three additions that only
 * appear when the meeting produced the content: decisions/risks, open questions
 * and the measured participation panel.
 */
export function BriefDocument({
  bundle,
  orgName,
  showParticipation = true,
}: {
  bundle: BriefBundle;
  orgName: string;
  /** The participation panel is measured data; suppressible for a shorter doc. */
  showParticipation?: boolean;
}) {
  const { brief, transcript } = bundle;
  const department = getDepartment(bundle.department);
  const seed = department.hue;

  const confidentiality = CONFIDENTIALITY_LEVELS.find(
    (c) => c.id === bundle.confidentiality,
  );
  const confidentialityLabel = confidentiality ? confidentiality.name : 'Internal';

  return (
    <article className="doc-page" lang="en-GB">
      <DocHero
        brief={brief}
        department={department}
        confidentialityLabel={confidentialityLabel}
      />

      <DocAttendees brief={brief} />
      <DocSpotlights brief={brief} />
      <DocMetrics brief={brief} seed={seed} />

      {brief.tracks.map((track, index) => (
        <DocTrack
          key={track.code}
          track={track}
          accent={rotateHue(index, seed)}
          departmentCode={department.code}
        />
      ))}

      <DocDecisionsAndRisks brief={brief} seed={seed} />
      <DocDirection brief={brief} seed={seed} />
      <DocDoFirst brief={brief} />
      <DocOwners brief={brief} seed={seed} />
      <DocTimeline brief={brief} seed={seed} />

      {showParticipation ? <DocParticipation facts={transcript} seed={seed} /> : null}

      <DocFooter
        brief={brief}
        department={department}
        orgName={orgName}
        generatedLabel={`Generated ${formatTimestamp(bundle.generatedAt)}`}
        confidentialityLabel={confidentialityLabel}
      />
    </article>
  );
}
