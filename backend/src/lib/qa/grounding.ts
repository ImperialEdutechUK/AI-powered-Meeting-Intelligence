import type { Brief } from '@/lib/ai/schema';
import type { Transcript } from '@/lib/transcript/types';
import { speakerKey } from '@/lib/transcript/cues';
import { buildNumberIndex, extractNumbers, isTriviallyAttested } from './numbers';

/**
 * Fact-anchor QA.
 *
 * After the model writes the brief, every figure and every person named in it is
 * checked back against the source material. Nothing is silently corrected — the
 * findings are attached to the brief and shown to the user before they export,
 * so a claim the source does not support is visible rather than buried.
 *
 * Source material = the transcript plus the context the user typed in. Both are
 * legitimate: a job title from the roster is attested even though nobody said it
 * out loud.
 */

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  kind: 'unattested-number' | 'unknown-person' | 'partial-person' | 'empty-section';
  severity: FindingSeverity;
  /** The offending value. */
  value: string;
  /** Where in the document it appeared, e.g. "Track A · item 2 · chip". */
  location: string;
  /** What the reader should do about it. */
  message: string;
}

export interface GroundingReport {
  findings: Finding[];
  /** Counts for the summary line. */
  checked: {
    numbers: number;
    people: number;
  };
  /** Percentage of checks that passed, 0-100. */
  score: number;
  /** True when nothing above `low` severity was found. */
  clean: boolean;
}

/* ------------------------------------------------------------------------- */
/* Field walking                                                             */
/* ------------------------------------------------------------------------- */

interface TextField {
  text: string;
  location: string;
}

interface PersonField {
  name: string;
  location: string;
}

/**
 * Collect the fields worth number-checking.
 *
 * Excluded on purpose:
 *   - `dateLabel` and the date meta chip: supplied by the uploader, not the model.
 *   - `title`: often contains a date or a version the user typed.
 *   - `timeline[].when`: relative labels like "Aug wk 2" carry week numbers that
 *     are structural, not claims about quantities.
 */
function collectNumberFields(brief: Brief): TextField[] {
  const fields: TextField[] = [];

  fields.push({ text: brief.summary, location: 'Header summary' });

  brief.spotlights.forEach((s, i) => {
    fields.push({ text: s.title, location: `Spotlight ${i + 1} · title` });
    fields.push({ text: s.body, location: `Spotlight ${i + 1} · body` });
  });

  brief.metrics.forEach((m, i) => {
    fields.push({ text: m.value, location: `Metric ${i + 1} · value` });
    fields.push({ text: m.label, location: `Metric ${i + 1} · label` });
  });

  brief.tracks.forEach((track) => {
    track.items.forEach((item, j) => {
      const base = `Track ${track.code} · item ${j + 1}`;
      fields.push({ text: item.title, location: `${base} · title` });
      fields.push({ text: item.body, location: `${base} · body` });
      item.chips.forEach((chip, k) => {
        fields.push({ text: chip.text, location: `${base} · chip ${k + 1}` });
      });
    });
  });

  if (brief.direction) {
    brief.direction.bullets.forEach((b, i) => {
      fields.push({ text: `${b.lead} ${b.text}`, location: `Direction · bullet ${i + 1}` });
    });
  }

  brief.doFirst.forEach((d, i) => {
    fields.push({ text: d.action, location: `Do first ${i + 1}` });
  });

  brief.decisions.forEach((d, i) => {
    fields.push({ text: d.text, location: `Decision ${i + 1}` });
  });

  brief.risks.forEach((r, i) => {
    fields.push({ text: r.text, location: `Risk ${i + 1}` });
  });

  brief.openQuestions.forEach((q, i) => {
    fields.push({ text: q, location: `Open question ${i + 1}` });
  });

  brief.owners.forEach((o) => {
    fields.push({ text: o.assignment, location: `Owner · ${o.name}` });
  });

  if (brief.ownersNote) {
    fields.push({ text: brief.ownersNote, location: 'Owners note' });
  }

  brief.timeline.forEach((t, i) => {
    fields.push({ text: t.what, location: `Timeline ${i + 1}` });
  });

  return fields;
}

/** Every person name the document asserts. */
function collectPeople(brief: Brief): PersonField[] {
  const people: PersonField[] = [];

  brief.attendees.forEach((name) => people.push({ name, location: 'Attendees' }));
  brief.absentees.forEach((name) => people.push({ name, location: 'Absentees' }));

  brief.tracks.forEach((track) => {
    track.leads.forEach((name) =>
      people.push({ name, location: `Track ${track.code} · leads` }),
    );
    track.items.forEach((item, j) => {
      item.owners.forEach((name) =>
        people.push({ name, location: `Track ${track.code} · item ${j + 1} · owner` }),
      );
    });
  });

  brief.doFirst.forEach((d, i) => {
    if (d.owner) people.push({ name: d.owner, location: `Do first ${i + 1}` });
  });

  brief.decisions.forEach((d, i) => {
    if (d.owner) people.push({ name: d.owner, location: `Decision ${i + 1}` });
  });

  brief.risks.forEach((r, i) => {
    if (r.owner) people.push({ name: r.owner, location: `Risk ${i + 1}` });
  });

  brief.owners.forEach((o) => people.push({ name: o.name, location: "Who's owning what" }));

  brief.timeline.forEach((t, i) => {
    t.who.forEach((name) => people.push({ name, location: `Timeline ${i + 1}` }));
  });

  return people;
}

/* ------------------------------------------------------------------------- */
/* Name attestation                                                          */
/* ------------------------------------------------------------------------- */

/** Split a display name into comparable tokens, dropping honorifics. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|prof|sir|madam)\.?\b/g, ' ')
    .split(/[^\p{L}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

interface NameIndex {
  /** Exact keys of whole names known from speakers and the roster. */
  full: Set<string>;
  /** Individual tokens seen anywhere in the source. */
  tokens: Set<string>;
}

function buildNameIndex(transcript: Transcript, rosterNames: string[]): NameIndex {
  const full = new Set<string>();
  const tokens = new Set<string>();

  const add = (name: string) => {
    const key = speakerKey(name);
    if (key) full.add(key);
    for (const token of nameTokens(name)) tokens.add(token);
  };

  for (const speaker of transcript.stats.speakers) add(speaker.name);
  for (const name of rosterNames) add(name);

  // Names mentioned in the body of the dialogue but who never spoke: index every
  // capitalised word so a mentioned-only person still counts as attested.
  for (const cue of transcript.cues) {
    for (const match of cue.text.matchAll(/\b\p{Lu}\p{L}{1,}\b/gu)) {
      const word = match[0].toLowerCase();
      if (word.length >= 3) tokens.add(word);
    }
  }

  return { full, tokens };
}

type NameVerdict = 'known' | 'partial' | 'unknown';

function verifyName(name: string, index: NameIndex): NameVerdict {
  const key = speakerKey(name);
  if (key && index.full.has(key)) return 'known';

  const tokens = nameTokens(name);
  if (tokens.length === 0) return 'unknown';

  const matched = tokens.filter((t) => index.tokens.has(t));
  if (matched.length === tokens.length) return 'known';
  if (matched.length > 0) return 'partial';
  return 'unknown';
}

/* ------------------------------------------------------------------------- */
/* Report                                                                    */
/* ------------------------------------------------------------------------- */

export interface GroundingOptions {
  brief: Brief;
  transcript: Transcript;
  /** Free-text the user supplied; numbers and names in it count as attested. */
  userContext: string[];
  rosterNames: string[];
}

export function checkGrounding(options: GroundingOptions): GroundingReport {
  const { brief, transcript, userContext, rosterNames } = options;

  const numberIndex = buildNumberIndex([
    transcript.dialogue,
    ...userContext,
    // The printed date and title come from the upload form, not the model, and
    // the summary line conventionally repeats the date.
    brief.dateLabel,
    brief.title,
    // Deterministic stats are facts about the transcript, so they are attested.
    String(transcript.stats.totalWords),
    String(transcript.stats.speakers.length),
    String(transcript.stats.totalCues),
  ]);

  const nameIndex = buildNameIndex(transcript, rosterNames);

  const findings: Finding[] = [];
  let numbersChecked = 0;
  const reportedNumbers = new Set<string>();

  for (const field of collectNumberFields(brief)) {
    for (const canonical of extractNumbers(field.text)) {
      if (isTriviallyAttested(canonical)) continue;
      numbersChecked += 1;
      if (numberIndex.has(canonical)) continue;

      const dedupeKey = `${canonical}@${field.location}`;
      if (reportedNumbers.has(dedupeKey)) continue;
      reportedNumbers.add(dedupeKey);

      findings.push({
        kind: 'unattested-number',
        severity: 'high',
        value: canonical,
        location: field.location,
        message: `The figure ${canonical} does not appear in the transcript or in the context you supplied. Verify it against the recording before circulating.`,
      });
    }
  }

  let peopleChecked = 0;
  const reportedPeople = new Set<string>();

  for (const person of collectPeople(brief)) {
    const name = person.name.trim();
    if (!name) continue;
    peopleChecked += 1;

    const verdict = verifyName(name, nameIndex);
    if (verdict === 'known') continue;

    const dedupeKey = `${name.toLowerCase()}@${verdict}`;
    if (reportedPeople.has(dedupeKey)) continue;
    reportedPeople.add(dedupeKey);

    if (verdict === 'unknown') {
      findings.push({
        kind: 'unknown-person',
        severity: 'high',
        value: name,
        location: person.location,
        message: `"${name}" does not appear anywhere in the transcript or the attendee list. Correct the name or remove the item.`,
      });
    } else {
      findings.push({
        kind: 'partial-person',
        severity: 'low',
        value: name,
        location: person.location,
        message: `Only part of "${name}" appears in the source. Check the full name is right — adding the attendee list on upload prevents this.`,
      });
    }
  }

  // Structural completeness: sections a reader will expect and notice missing.
  if (brief.owners.length === 0) {
    findings.push({
      kind: 'empty-section',
      severity: 'medium',
      value: "Who's owning what",
      location: 'Document',
      message:
        'No owner assignments were extracted. If the meeting did allocate work, regenerate with the attendee list filled in.',
    });
  }
  if (brief.timeline.length === 0) {
    findings.push({
      kind: 'empty-section',
      severity: 'low',
      value: 'Deadlines & next steps',
      location: 'Document',
      message: 'No dated commitments were found, so the timeline strip is omitted.',
    });
  }

  const totalChecks = numbersChecked + peopleChecked;
  const failures = findings.filter((f) => f.kind !== 'empty-section').length;
  const score =
    totalChecks === 0
      ? 100
      : Math.max(0, Math.round(((totalChecks - failures) / totalChecks) * 100));

  return {
    findings: findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    checked: { numbers: numbersChecked, people: peopleChecked },
    score,
    clean: findings.every((f) => f.severity === 'low'),
  };
}

function severityRank(severity: FindingSeverity): number {
  return severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
}
