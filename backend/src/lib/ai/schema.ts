import { z } from 'zod';
import { CALLOUT_TONES, CHIP_KINDS } from '@/lib/theme';

/**
 * The brief document model.
 *
 * Two layers on purpose:
 *
 *   `LenientBrief` accepts anything structurally plausible — over-long strings,
 *   too many items, unknown enum spellings, nulls where we want undefined. This
 *   is what a language model actually returns.
 *
 *   `normaliseBrief()` clamps, de-duplicates and repairs that into `Brief`,
 *   which is the strict shape every renderer and exporter can rely on.
 *
 * Repairing beats retrying: a chip that came back seven words long is not worth
 * a second API call, and silently truncating is safer than rendering a broken
 * layout.
 */

/* ------------------------------------------------------------------------- */
/* Limits — these are layout constraints, not opinions                       */
/* ------------------------------------------------------------------------- */

export const LIMITS = {
  title: 80,
  dateLabel: 40,
  summary: 320,
  chipText: 46,
  metaChip: 48,
  personName: 60,
  role: 70,
  badge: 4,
  trackTitle: 68,
  trackLeads: 90,
  itemTitle: 110,
  ownerTag: 60,
  body: 900,
  spotlightTitle: 110,
  spotlightBody: 480,
  bulletLead: 40,
  bulletText: 300,
  doFirstAction: 260,
  assignment: 300,
  decision: 240,
  risk: 240,
  question: 200,
  timelineWhen: 18,
  timelineWhat: 110,
  timelineWho: 60,
  footerTag: 26,

  maxSpotlights: 3,
  maxMetrics: 6,
  minMetrics: 3,
  maxTracks: 5,
  maxItemsPerTrack: 8,
  maxChipsPerItem: 5,
  maxBullets: 8,
  maxDoFirst: 3,
  maxDecisions: 8,
  maxRisks: 6,
  maxQuestions: 5,
  maxOwners: 16,
  maxTimeline: 6,
  maxFooterTags: 5,
  maxAttendees: 60,
} as const;

/* ------------------------------------------------------------------------- */
/* Lenient input schema                                                      */
/* ------------------------------------------------------------------------- */

/** Anything the model might hand back where we want a trimmed string. */
const looseString = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v).trim());

const looseStringArray = z
  .union([looseString, z.array(z.unknown()), z.null(), z.undefined()])
  .transform((v): string[] => {
    if (v === null || v === undefined) return [];
    if (typeof v === 'string') {
      // Models sometimes return "A · B · C" or "A, B, C" instead of an array.
      return v
        .split(/\s*[·•|;]\s*|\s*,\s(?=[A-Z])/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return v
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        if (item !== null && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          for (const key of ['name', 'text', 'value', 'label', 'title']) {
            const candidate = rec[key];
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
          }
        }
        return '';
      })
      .filter(Boolean);
  });

const looseChip = z
  .union([
    looseString,
    z.object({
      kind: z.unknown().optional(),
      type: z.unknown().optional(),
      status: z.unknown().optional(),
      text: z.unknown().optional(),
      label: z.unknown().optional(),
      value: z.unknown().optional(),
    }),
  ])
  .transform((v) => {
    if (typeof v === 'string') return { kind: 'note', text: v };
    const rec = v as Record<string, unknown>;
    const kind = [rec.kind, rec.type, rec.status].find((k) => typeof k === 'string');
    const text = [rec.text, rec.label, rec.value].find(
      (t) => typeof t === 'string' && t.trim(),
    );
    return { kind: typeof kind === 'string' ? kind : 'note', text: typeof text === 'string' ? text : '' };
  });

/**
 * Tolerate a wrong container type by falling back to empty rather than failing
 * the whole parse. A model that returns `"tracks": "none"` should yield a brief
 * with no tracks, not a 500.
 */
function looseArray<T extends z.ZodType>(item: T) {
  return z.array(item).catch([]);
}

const looseItemObject = z.object({
  title: looseString.optional(),
  heading: looseString.optional(),
  owners: looseStringArray.optional(),
  owner: looseString.optional(),
  body: looseString.optional(),
  detail: looseString.optional(),
  text: looseString.optional(),
  chips: looseArray(looseChip).optional(),
  tags: looseArray(looseChip).optional(),
});

/**
 * Preprocess rather than union so the inferred output type stays a single object
 * shape — a union would force every reader to narrow before touching a field.
 */
const looseItem = z
  .preprocess(
    (v) =>
      typeof v === 'string' || typeof v === 'number'
        ? { title: String(v), body: String(v) }
        : v,
    looseItemObject,
  )
  .catch({});

const looseTrack = z
  .object({
    code: looseString.optional(),
    title: looseString.optional(),
    name: looseString.optional(),
    leads: looseStringArray.optional(),
    items: looseArray(looseItem).optional(),
  })
  .catch({});

const looseSpotlight = z.object({
  tone: looseString.optional(),
  severity: looseString.optional(),
  title: looseString.optional(),
  body: looseString.optional(),
  text: looseString.optional(),
}).catch({});

const looseMetric = z.object({
  value: looseString.optional(),
  label: looseString.optional(),
  caption: looseString.optional(),
}).catch({});

const looseBullet = z.object({
  lead: looseString.optional(),
  label: looseString.optional(),
  text: looseString.optional(),
  body: looseString.optional(),
}).catch({});

const looseOwner = z.object({
  name: looseString.optional(),
  badge: looseString.optional(),
  code: looseString.optional(),
  role: looseString.optional(),
  title: looseString.optional(),
  assignment: looseString.optional(),
  action: looseString.optional(),
}).catch({});

const looseTimeline = z.object({
  when: looseString.optional(),
  label: looseString.optional(),
  what: looseString.optional(),
  text: looseString.optional(),
  who: looseStringArray.optional(),
}).catch({});

const looseDecision = z.union([
  looseString,
  z.object({
    text: looseString.optional(),
    decision: looseString.optional(),
    owner: looseString.optional(),
    status: looseString.optional(),
  }),
]);

const looseRisk = z.union([
  looseString,
  z.object({
    text: looseString.optional(),
    risk: looseString.optional(),
    severity: looseString.optional(),
    owner: looseString.optional(),
    mitigation: looseString.optional(),
  }),
]);

const looseDoFirst = z.union([
  looseString,
  z.object({
    owner: looseString.optional(),
    who: looseString.optional(),
    action: looseString.optional(),
    text: looseString.optional(),
  }),
]);

export const LenientBriefSchema = z.object({
  title: looseString.optional(),
  dateLabel: looseString.optional(),
  date: looseString.optional(),
  summary: looseString.optional(),
  subtitle: looseString.optional(),
  metaChips: looseStringArray.optional(),
  chips: looseStringArray.optional(),
  attendees: looseStringArray.optional(),
  absentees: looseStringArray.optional(),

  spotlights: looseArray(looseSpotlight).optional(),
  callouts: looseArray(looseSpotlight).optional(),

  metrics: looseArray(looseMetric).optional(),

  tracks: looseArray(looseTrack).optional(),

  direction: z
    .object({
      eyebrow: looseString.optional(),
      title: looseString.optional(),
      bullets: looseArray(looseBullet).optional(),
    })
    .nullable()
    .optional(),

  doFirst: looseArray(looseDoFirst).optional(),
  decisions: looseArray(looseDecision).optional(),
  risks: looseArray(looseRisk).optional(),
  openQuestions: looseStringArray.optional(),

  owners: looseArray(looseOwner).optional(),
  ownersNote: looseString.optional(),

  timeline: looseArray(looseTimeline).optional(),
  footerTags: looseStringArray.optional(),
});

export type LenientBrief = z.infer<typeof LenientBriefSchema>;

/* ------------------------------------------------------------------------- */
/* Strict output model                                                       */
/* ------------------------------------------------------------------------- */

export const ChipKindEnum = z.enum(CHIP_KINDS);
export const CalloutToneEnum = z.enum(CALLOUT_TONES);
export const DecisionStatusEnum = z.enum(['agreed', 'deferred', 'rejected']);
export const RiskSeverityEnum = z.enum(['high', 'medium', 'low']);

export const BriefSchema = z.object({
  title: z.string().min(1).max(LIMITS.title),
  dateLabel: z.string().max(LIMITS.dateLabel),
  summary: z.string().max(LIMITS.summary),
  metaChips: z.array(z.string().max(LIMITS.metaChip)).max(4),
  attendees: z.array(z.string().max(LIMITS.personName)).max(LIMITS.maxAttendees),
  absentees: z.array(z.string().max(LIMITS.personName)).max(20),

  spotlights: z
    .array(
      z.object({
        tone: CalloutToneEnum,
        title: z.string().min(1).max(LIMITS.spotlightTitle),
        body: z.string().min(1).max(LIMITS.spotlightBody),
      }),
    )
    .max(LIMITS.maxSpotlights),

  metrics: z
    .array(
      z.object({
        value: z.string().min(1).max(12),
        label: z.string().min(1).max(64),
      }),
    )
    .max(LIMITS.maxMetrics),

  tracks: z
    .array(
      z.object({
        code: z.string().min(1).max(1),
        title: z.string().min(1).max(LIMITS.trackTitle),
        leads: z.array(z.string().max(LIMITS.personName)).max(6),
        items: z
          .array(
            z.object({
              title: z.string().min(1).max(LIMITS.itemTitle),
              owners: z.array(z.string().max(LIMITS.personName)).max(4),
              body: z.string().min(1).max(LIMITS.body),
              chips: z
                .array(
                  z.object({
                    kind: ChipKindEnum,
                    text: z.string().min(1).max(LIMITS.chipText),
                  }),
                )
                .max(LIMITS.maxChipsPerItem),
            }),
          )
          .max(LIMITS.maxItemsPerTrack),
      }),
    )
    .max(LIMITS.maxTracks),

  direction: z
    .object({
      eyebrow: z.string().max(70),
      title: z.string().min(1).max(110),
      bullets: z
        .array(
          z.object({
            lead: z.string().max(LIMITS.bulletLead),
            text: z.string().min(1).max(LIMITS.bulletText),
          }),
        )
        .max(LIMITS.maxBullets),
    })
    .nullable(),

  doFirst: z
    .array(
      z.object({
        owner: z.string().max(LIMITS.personName),
        action: z.string().min(1).max(LIMITS.doFirstAction),
      }),
    )
    .max(LIMITS.maxDoFirst),

  decisions: z
    .array(
      z.object({
        text: z.string().min(1).max(LIMITS.decision),
        owner: z.string().max(LIMITS.personName),
        status: DecisionStatusEnum,
      }),
    )
    .max(LIMITS.maxDecisions),

  risks: z
    .array(
      z.object({
        text: z.string().min(1).max(LIMITS.risk),
        severity: RiskSeverityEnum,
        owner: z.string().max(LIMITS.personName),
      }),
    )
    .max(LIMITS.maxRisks),

  openQuestions: z.array(z.string().min(1).max(LIMITS.question)).max(LIMITS.maxQuestions),

  owners: z
    .array(
      z.object({
        name: z.string().min(1).max(LIMITS.personName),
        badge: z.string().min(1).max(LIMITS.badge),
        role: z.string().max(LIMITS.role),
        assignment: z.string().min(1).max(LIMITS.assignment),
      }),
    )
    .max(LIMITS.maxOwners),

  ownersNote: z.string().max(420),

  timeline: z
    .array(
      z.object({
        when: z.string().min(1).max(LIMITS.timelineWhen),
        what: z.string().min(1).max(LIMITS.timelineWhat),
        who: z.array(z.string().max(LIMITS.personName)).max(4),
      }),
    )
    .max(LIMITS.maxTimeline),

  footerTags: z.array(z.string().min(1).max(LIMITS.footerTag)).max(LIMITS.maxFooterTags),
});

export type Brief = z.infer<typeof BriefSchema>;
export type BriefTrack = Brief['tracks'][number];
export type BriefItem = BriefTrack['items'][number];
export type BriefChip = BriefItem['chips'][number];
export type BriefSpotlight = Brief['spotlights'][number];
export type BriefOwner = Brief['owners'][number];
export type BriefTimelineStep = Brief['timeline'][number];

/* ------------------------------------------------------------------------- */
/* Normalisation helpers                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Trim, collapse whitespace and cut to `max` on a word boundary where possible.
 * The returned string is never longer than `max`, ellipsis included — the strict
 * schema's `.max()` bounds depend on that.
 */
export function clamp(value: string | undefined, max: number): string {
  if (!value || max <= 0) return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  if (max === 1) return '…';

  // Reserve the last character for the ellipsis.
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > (max - 1) * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,;:.\-–—]+$/, '')}…`;
}

/** Strip markdown emphasis the model sometimes leaks into plain-text fields. */
export function deMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(\S(?:.*?\S)?)\*(?=\s|$)/g, '$1$2')
    .replace(/(^|\s)_(\S(?:.*?\S)?)_(?=\s|$)/g, '$1$2')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

function text(value: string | undefined, max: number): string {
  return clamp(deMarkdown(value ?? ''), max);
}

const CHIP_SYNONYMS: Record<string, (typeof CHIP_KINDS)[number]> = {
  blocked: 'blocked',
  blocker: 'blocked',
  block: 'blocked',
  stuck: 'blocked',
  done: 'done',
  complete: 'done',
  completed: 'done',
  finished: 'done',
  ok: 'done',
  success: 'done',
  progress: 'progress',
  inprogress: 'progress',
  ongoing: 'progress',
  wip: 'progress',
  pending: 'progress',
  action: 'action',
  todo: 'action',
  required: 'action',
  next: 'action',
  urgent: 'action',
  decision: 'decision',
  decided: 'decision',
  agreed: 'decision',
  date: 'date',
  deadline: 'date',
  due: 'date',
  target: 'date',
  when: 'date',
  note: 'note',
  info: 'note',
  neutral: 'note',
  context: 'note',
  risk: 'risk',
  warning: 'risk',
  concern: 'risk',
  watch: 'risk',
};

export function coerceChipKind(raw: string | undefined): (typeof CHIP_KINDS)[number] {
  const key = (raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return CHIP_SYNONYMS[key] ?? 'note';
}

const TONE_SYNONYMS: Record<string, (typeof CALLOUT_TONES)[number]> = {
  critical: 'critical',
  blocker: 'critical',
  urgent: 'critical',
  high: 'critical',
  red: 'critical',
  danger: 'critical',
  error: 'critical',
  warning: 'warning',
  warn: 'warning',
  watch: 'warning',
  amber: 'warning',
  medium: 'warning',
  caution: 'warning',
  positive: 'positive',
  win: 'positive',
  good: 'positive',
  green: 'positive',
  success: 'positive',
  milestone: 'positive',
  info: 'info',
  note: 'info',
  neutral: 'info',
  blue: 'info',
  update: 'info',
};

export function coerceTone(raw: string | undefined): (typeof CALLOUT_TONES)[number] {
  const key = (raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return TONE_SYNONYMS[key] ?? 'info';
}

function coerceDecisionStatus(raw: string | undefined): z.infer<typeof DecisionStatusEnum> {
  const key = (raw ?? '').toLowerCase();
  if (/defer|postpon|later|park|hold/.test(key)) return 'deferred';
  if (/reject|declin|no\b|drop/.test(key)) return 'rejected';
  return 'agreed';
}

function coerceSeverity(raw: string | undefined): z.infer<typeof RiskSeverityEnum> {
  const key = (raw ?? '').toLowerCase();
  if (/high|critical|red|severe|major/.test(key)) return 'high';
  if (/low|minor|green|small/.test(key)) return 'low';
  return 'medium';
}

/** Track letters A, B, C… derived from position, never trusted from the model. */
function trackCode(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/**
 * Initials-based badge fallback, e.g. "Sadeev Silva" → "SS".
 * Never returns an empty string.
 */
export function initialsBadge(name: string): string {
  const parts = name
    .split(/[\s.\-']+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const letters = parts
    .slice(0, 3)
    .map((p) => [...p][0] ?? '')
    .join('')
    .toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 3);
  const fallback = name.replace(/[^\p{L}]/gu, '').toUpperCase();
  return fallback.slice(0, 2) || 'NA';
}

function dedupeStrings(values: string[], max: number, itemMax: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = text(raw, itemMax);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

/* ------------------------------------------------------------------------- */
/* Normalisation                                                             */
/* ------------------------------------------------------------------------- */

export interface NormaliseContext {
  /** Fallback title when the model omits one. */
  fallbackTitle: string;
  fallbackDateLabel: string;
  /** Department short code, used for footer tags and owner tags. */
  departmentCode: string;
  /** Attendee roster from the upload form, merged with what the model found. */
  rosterNames: string[];
}

/**
 * Turn a lenient model payload into a renderable `Brief`.
 * Never throws: every field either normalises or is dropped.
 */
export function normaliseBrief(input: LenientBrief, ctx: NormaliseContext): Brief {
  const title =
    text(firstNonEmpty(input.title), LIMITS.title) || clamp(ctx.fallbackTitle, LIMITS.title);

  const dateLabel =
    text(firstNonEmpty(input.dateLabel, input.date), LIMITS.dateLabel) ||
    clamp(ctx.fallbackDateLabel, LIMITS.dateLabel);

  const summary = text(firstNonEmpty(input.summary, input.subtitle), LIMITS.summary);

  const metaChips = dedupeStrings(
    [...(input.metaChips ?? []), ...(input.chips ?? [])],
    4,
    LIMITS.metaChip,
  );

  const attendees = dedupeStrings(
    [...(input.attendees ?? []), ...ctx.rosterNames],
    LIMITS.maxAttendees,
    LIMITS.personName,
  );

  const absentees = dedupeStrings(input.absentees ?? [], 20, LIMITS.personName);

  const spotlights: Brief['spotlights'] = [];
  for (const raw of [...(input.spotlights ?? []), ...(input.callouts ?? [])]) {
    if (spotlights.length >= LIMITS.maxSpotlights) break;
    const spotTitle = text(raw.title, LIMITS.spotlightTitle);
    const body = text(firstNonEmpty(raw.body, raw.text), LIMITS.spotlightBody);
    if (!spotTitle || !body) continue;
    if (spotlights.some((s) => s.title.toLowerCase() === spotTitle.toLowerCase())) continue;
    spotlights.push({
      tone: coerceTone(firstNonEmpty(raw.tone, raw.severity)),
      title: spotTitle,
      body,
    });
  }

  const metrics: Brief['metrics'] = [];
  for (const raw of input.metrics ?? []) {
    if (metrics.length >= LIMITS.maxMetrics) break;
    const value = text(raw.value, 12);
    const label = text(firstNonEmpty(raw.label, raw.caption), 64);
    if (!value || !label) continue;
    metrics.push({ value, label });
  }

  const tracks: Brief['tracks'] = [];
  for (const raw of input.tracks ?? []) {
    if (tracks.length >= LIMITS.maxTracks) break;
    const trackTitle = text(firstNonEmpty(raw.title, raw.name), LIMITS.trackTitle);
    if (!trackTitle) continue;

    const items: BriefItem[] = [];
    for (const rawItem of raw.items ?? []) {
      if (items.length >= LIMITS.maxItemsPerTrack) break;
      const itemTitle = text(firstNonEmpty(rawItem.title, rawItem.heading), LIMITS.itemTitle);
      const body = text(
        firstNonEmpty(rawItem.body, rawItem.detail, rawItem.text),
        LIMITS.body,
      );
      if (!itemTitle || !body) continue;

      const owners = dedupeStrings(
        [...(rawItem.owners ?? []), ...(rawItem.owner ? [rawItem.owner] : [])],
        4,
        LIMITS.personName,
      );

      const chips: BriefChip[] = [];
      const seenChip = new Set<string>();
      for (const rawChip of [...(rawItem.chips ?? []), ...(rawItem.tags ?? [])]) {
        if (chips.length >= LIMITS.maxChipsPerItem) break;
        const chipText = text(rawChip.text, LIMITS.chipText);
        if (!chipText) continue;
        const key = chipText.toLowerCase();
        if (seenChip.has(key)) continue;
        seenChip.add(key);
        chips.push({ kind: coerceChipKind(rawChip.kind), text: chipText });
      }

      items.push({ title: itemTitle, owners, body, chips });
    }

    if (items.length === 0) continue;
    tracks.push({
      code: trackCode(tracks.length),
      title: trackTitle,
      leads: dedupeStrings(raw.leads ?? [], 6, LIMITS.personName),
      items,
    });
  }

  let direction: Brief['direction'] = null;
  if (input.direction) {
    const dirTitle = text(input.direction.title, 110);
    const bullets: NonNullable<Brief['direction']>['bullets'] = [];
    for (const raw of input.direction.bullets ?? []) {
      if (bullets.length >= LIMITS.maxBullets) break;
      const bulletText = text(firstNonEmpty(raw.text, raw.body), LIMITS.bulletText);
      if (!bulletText) continue;
      bullets.push({
        lead: text(firstNonEmpty(raw.lead, raw.label), LIMITS.bulletLead),
        text: bulletText,
      });
    }
    if (dirTitle && bullets.length > 0) {
      direction = {
        eyebrow: text(input.direction.eyebrow, 70) || 'DIRECTION',
        title: dirTitle,
        bullets,
      };
    }
  }

  const doFirst: Brief['doFirst'] = [];
  for (const raw of input.doFirst ?? []) {
    if (doFirst.length >= LIMITS.maxDoFirst) break;
    if (typeof raw === 'string') {
      const action = text(raw, LIMITS.doFirstAction);
      if (action) doFirst.push({ owner: '', action });
      continue;
    }
    const action = text(firstNonEmpty(raw.action, raw.text), LIMITS.doFirstAction);
    if (!action) continue;
    doFirst.push({
      owner: text(firstNonEmpty(raw.owner, raw.who), LIMITS.personName),
      action,
    });
  }

  const decisions: Brief['decisions'] = [];
  for (const raw of input.decisions ?? []) {
    if (decisions.length >= LIMITS.maxDecisions) break;
    if (typeof raw === 'string') {
      const value = text(raw, LIMITS.decision);
      if (value) decisions.push({ text: value, owner: '', status: 'agreed' });
      continue;
    }
    const value = text(firstNonEmpty(raw.text, raw.decision), LIMITS.decision);
    if (!value) continue;
    decisions.push({
      text: value,
      owner: text(raw.owner, LIMITS.personName),
      status: coerceDecisionStatus(raw.status),
    });
  }

  const risks: Brief['risks'] = [];
  for (const raw of input.risks ?? []) {
    if (risks.length >= LIMITS.maxRisks) break;
    if (typeof raw === 'string') {
      const value = text(raw, LIMITS.risk);
      if (value) risks.push({ text: value, severity: 'medium', owner: '' });
      continue;
    }
    const value = text(firstNonEmpty(raw.text, raw.risk), LIMITS.risk);
    if (!value) continue;
    risks.push({
      text: value,
      severity: coerceSeverity(raw.severity),
      owner: text(raw.owner, LIMITS.personName),
    });
  }

  const openQuestions = dedupeStrings(
    input.openQuestions ?? [],
    LIMITS.maxQuestions,
    LIMITS.question,
  );

  const owners: Brief['owners'] = [];
  const seenOwner = new Set<string>();
  for (const raw of input.owners ?? []) {
    if (owners.length >= LIMITS.maxOwners) break;
    const name = text(raw.name, LIMITS.personName);
    const assignment = text(firstNonEmpty(raw.assignment, raw.action), LIMITS.assignment);
    if (!name || !assignment) continue;
    const key = name.toLowerCase();
    if (seenOwner.has(key)) continue;
    seenOwner.add(key);
    // Strip separators before clamping, or "m-g-t" would clamp to "m-g-".
    const rawBadge = clamp(
      deMarkdown(firstNonEmpty(raw.badge, raw.code) ?? '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toUpperCase(),
      LIMITS.badge,
    ).replace(/…/g, '');
    owners.push({
      name,
      badge: rawBadge || initialsBadge(name),
      role: text(firstNonEmpty(raw.role, raw.title), LIMITS.role),
      assignment,
    });
  }

  const timeline: Brief['timeline'] = [];
  for (const raw of input.timeline ?? []) {
    if (timeline.length >= LIMITS.maxTimeline) break;
    const when = text(firstNonEmpty(raw.when, raw.label), LIMITS.timelineWhen);
    const what = text(firstNonEmpty(raw.what, raw.text), LIMITS.timelineWhat);
    if (!when || !what) continue;
    timeline.push({
      when,
      what,
      who: dedupeStrings(raw.who ?? [], 4, LIMITS.personName),
    });
  }

  const footerTags = dedupeStrings(
    input.footerTags && input.footerTags.length > 0
      ? input.footerTags
      : tracks.map((t) => t.title),
    LIMITS.maxFooterTags,
    LIMITS.footerTag,
  );

  return {
    title,
    dateLabel,
    summary,
    metaChips,
    attendees,
    absentees,
    spotlights,
    metrics,
    tracks,
    direction,
    doFirst,
    decisions,
    risks,
    openQuestions,
    owners,
    ownersNote: text(input.ownersNote, 420),
    timeline,
    footerTags,
  };
}

/**
 * Is the normalised brief substantial enough to publish?
 * Used to decide whether a retry is worth an extra API call.
 */
export function briefIsUsable(brief: Brief): { ok: boolean; reason?: string } {
  const itemCount = brief.tracks.reduce((sum, t) => sum + t.items.length, 0);
  if (!brief.title) return { ok: false, reason: 'no title' };
  if (brief.tracks.length === 0) return { ok: false, reason: 'no workstream tracks' };
  if (itemCount < 2) return { ok: false, reason: `only ${itemCount} discussion item(s)` };
  if (brief.owners.length === 0 && brief.doFirst.length === 0) {
    return { ok: false, reason: 'no owners and no immediate actions' };
  }
  return { ok: true };
}
