import { z } from 'zod';
import {
  CONFIDENTIALITY_LEVELS,
  DEPARTMENT_IDS,
  MEETING_TYPES,
} from './departments';

/**
 * The "additional information" the uploader can supply alongside the transcript.
 *
 * Every field is optional. Each one measurably improves output quality:
 *   - the roster fixes name spelling and lets the model assign real job titles
 *   - the glossary fixes product/acronym spelling the transcriber mangled
 *   - focus/exclusions steer what gets emphasised or left out
 * None of it is required, so a user can drop a file and press generate.
 */

const trimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\r\n?/g, '\n').trim())
    .refine((s) => s.length <= max, { message: `Must be ${max} characters or fewer` });

export const BriefInputsSchema = z.object({
  /** One or more departments; the first is primary (theme, footer code, filing). */
  departments: z.array(z.enum(DEPARTMENT_IDS)).min(1, 'Select at least one department'),
  meetingType: z.enum(MEETING_TYPES.map((m) => m.id) as [string, ...string[]]),
  confidentiality: z.enum(
    CONFIDENTIALITY_LEVELS.map((c) => c.id) as [string, ...string[]],
  ),

  /** Blank means "derive it from the transcript". */
  meetingTitle: trimmed(120).default(''),
  /** ISO `yyyy-mm-dd`, or blank to fall back to today. */
  meetingDate: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s), {
      message: 'Use the date picker (yyyy-mm-dd)',
    })
    .default(''),
  chair: trimmed(80).default(''),

  /** One attendee per line, optionally `Name — Role`. */
  roster: trimmed(4_000).default(''),
  absentees: trimmed(600).default(''),

  /** Projects, systems, product names and acronyms, comma or newline separated. */
  glossary: trimmed(2_000).default(''),

  /** What to emphasise. */
  focus: trimmed(1_000).default(''),
  /** What to leave out. */
  exclusions: trimmed(1_000).default(''),
  /** Carry-over context from the previous meeting. */
  previousContext: trimmed(2_000).default(''),

  /** Model tier. */
  depth: z.enum(['fast', 'deep']).default('fast'),
});

export type BriefInputs = z.infer<typeof BriefInputsSchema>;

export const DEFAULT_BRIEF_INPUTS: BriefInputs = {
  departments: [],
  meetingType: 'team',
  confidentiality: 'internal',
  meetingTitle: '',
  meetingDate: '',
  chair: '',
  roster: '',
  absentees: '',
  glossary: '',
  focus: '',
  exclusions: '',
  previousContext: '',
  depth: 'fast',
};

export interface RosterEntry {
  name: string;
  role: string;
}

/**
 * Parse the roster textarea.
 *
 * One person per line. Each line may be `Name`, `Name — Role`, `Name - Role`,
 * `Name (Role)`, `Name: Role` or `Name, Role`.
 *
 * A single line containing no newline is treated as a comma-separated list of
 * bare names ("Ana Diaz, Ben Cole, Cai Wu"), because that is overwhelmingly what
 * a one-line paste is. `Name, Role` on its own line is therefore ambiguous by
 * construction — use an em dash or parentheses for a single person with a role.
 * The form's helper text states this.
 */
export function parseRoster(raw: string): RosterEntry[] {
  const source = raw.trim();
  if (!source) return [];

  const multiline = source.includes('\n');
  const lines = multiline ? source.split('\n') : source.split(/\s*[,;·]\s*/);

  const out: RosterEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const value = line.trim().replace(/^[-*•\d.)\s]+/, '');
    if (!value) continue;

    let name = value;
    let role = '';

    const dash = /^(.+?)\s+[—–]\s+(.+)$/.exec(value) ?? /^(.+?)\s+-\s+(.+)$/.exec(value);
    const paren = /^(.+?)\s*\((.+)\)\s*$/.exec(value);
    const colon = /^(.+?)\s*:\s*(.+)$/.exec(value);
    // Only meaningful in multi-line mode; a single line was already comma-split.
    const comma = multiline ? /^([^,]{2,60}),\s*(.+)$/.exec(value) : null;

    const match = dash ?? paren ?? colon ?? comma;
    if (match?.[1] && match[2]) {
      name = match[1].trim();
      role = match[2].trim();
    }

    name = name.replace(/\s+/g, ' ').slice(0, 60).trim();
    role = role.replace(/\s+/g, ' ').slice(0, 70).trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, role });
    if (out.length >= 60) break;
  }

  return out;
}

/** Split a comma/newline separated list into clean terms. */
export function parseTermList(raw: string, max = 60): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,;]+/)) {
    const value = part.trim().replace(/^[-*•\s]+/, '');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

/** `2026-07-27` → `27 July 2026`. Returns '' for anything unparseable. */
export function formatDateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return '';
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Today in `yyyy-mm-dd`, UTC. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
