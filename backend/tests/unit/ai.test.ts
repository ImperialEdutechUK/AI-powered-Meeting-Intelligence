import { describe, expect, it } from 'vitest';

import {
  clamp,
  coerceChipKind,
  coerceTone,
  deMarkdown,
  initialsBadge,
  briefIsUsable,
  BriefSchema,
  LenientBriefSchema,
  normaliseBrief,
  type NormaliseContext,
} from '@/lib/ai/schema';
import { recoverJson, stripFences, stripTrailingCommas, JsonRecoveryError } from '@/lib/ai/json';
import {
  formatDateLabel,
  parseRoster,
  parseTermList,
  BriefInputsSchema,
} from '@/lib/brief-inputs';
import { estimateCostUsd, MODEL_PRICING } from '@/lib/ai/openrouter';

const CTX: NormaliseContext = {
  fallbackTitle: 'Course Development Meeting',
  fallbackDateLabel: '27 July 2026',
  departmentCode: 'CDD',
  rosterNames: ['Sadeev Silva'],
};

/* ------------------------------------------------------------------ */
/* String helpers                                                     */
/* ------------------------------------------------------------------ */

describe('clamp', () => {
  it('leaves short strings alone', () => {
    expect(clamp('hello', 20)).toBe('hello');
  });
  it('collapses internal whitespace', () => {
    expect(clamp('a   b\n\nc', 20)).toBe('a b c');
  });
  it('cuts on a word boundary and adds an ellipsis', () => {
    const out = clamp('the quick brown fox jumps over the lazy dog', 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
  it('handles undefined and empty input', () => {
    expect(clamp(undefined, 10)).toBe('');
    expect(clamp('', 10)).toBe('');
  });
  it('never leaves dangling punctuation before the ellipsis', () => {
    expect(clamp('alpha beta, gamma delta', 12)).not.toContain(',…');
  });
});

describe('deMarkdown', () => {
  it('removes bold, italic, code and headings', () => {
    expect(deMarkdown('**bold** and *italic* and `code`')).toBe('bold and italic and code');
    expect(deMarkdown('## Heading')).toBe('Heading');
  });
  it('unwraps links to their label', () => {
    expect(deMarkdown('see [the doc](https://x.test)')).toBe('see the doc');
  });
  it('leaves ordinary asterisk-free prose untouched', () => {
    expect(deMarkdown('2 * 3 = 6')).toBe('2 * 3 = 6');
  });
  it('does not mangle snake_case identifiers', () => {
    expect(deMarkdown('use the some_field_name value')).toBe('use the some_field_name value');
  });
});

describe('initialsBadge', () => {
  it('builds initials from a full name', () => {
    expect(initialsBadge('Sadeev Silva')).toBe('SS');
    expect(initialsBadge('Pragatheesh Rajenthiram Kumar')).toBe('PRK');
  });
  it('falls back for a single-word name', () => {
    expect(initialsBadge('Yoga')).toBe('YO');
  });
  it('never returns empty', () => {
    expect(initialsBadge('!!!')).toBe('NA');
    expect(initialsBadge('')).toBe('NA');
  });
});

describe('enum coercion', () => {
  it('maps chip synonyms', () => {
    expect(coerceChipKind('completed')).toBe('done');
    expect(coerceChipKind('BLOCKER')).toBe('blocked');
    expect(coerceChipKind('in-progress')).toBe('progress');
    expect(coerceChipKind('deadline')).toBe('date');
    expect(coerceChipKind('nonsense')).toBe('note');
    expect(coerceChipKind(undefined)).toBe('note');
  });
  it('maps tone synonyms', () => {
    expect(coerceTone('urgent')).toBe('critical');
    expect(coerceTone('amber')).toBe('warning');
    expect(coerceTone('win')).toBe('positive');
    expect(coerceTone('whatever')).toBe('info');
  });
});

/* ------------------------------------------------------------------ */
/* JSON recovery                                                      */
/* ------------------------------------------------------------------ */

describe('stripFences', () => {
  it('extracts a fenced block', () => {
    expect(stripFences('Here you go:\n```json\n{"a":1}\n```\nDone.')).toBe('{"a":1}');
  });
  it('picks the largest of several blocks', () => {
    const out = stripFences('```\n{"a":1}\n```\ntext\n```json\n{"a":1,"b":2}\n```');
    expect(out).toBe('{"a":1,"b":2}');
  });
  it('handles an unterminated fence', () => {
    expect(stripFences('```json\n{"a":1}')).toBe('{"a":1}');
  });
  it('passes through unfenced text', () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('stripTrailingCommas', () => {
  it('removes commas before closers', () => {
    expect(stripTrailingCommas('{"a":[1,2,],}')).toBe('{"a":[1,2]}');
  });
  it('leaves commas inside strings alone', () => {
    expect(stripTrailingCommas('{"a":"x, ]"}')).toBe('{"a":"x, ]"}');
  });
});

describe('recoverJson', () => {
  it('parses clean JSON without repair', () => {
    const r = recoverJson('{"title":"x"}');
    expect(r.repaired).toBe(false);
    expect(r.truncated).toBe(false);
  });

  it('recovers from surrounding prose', () => {
    const r = recoverJson('Sure! Here is the brief:\n{"title":"x"}\nHope that helps.');
    expect((r.value as { title: string }).title).toBe('x');
  });

  it('ignores braces inside string values', () => {
    const r = recoverJson('{"title":"a } b { c","n":1}');
    expect((r.value as { title: string; n: number }).n).toBe(1);
  });

  it('handles escaped quotes', () => {
    const r = recoverJson('{"title":"she said \\"hi\\"","n":2}');
    expect((r.value as { n: number }).n).toBe(2);
  });

  it('closes a truncated object and reports it', () => {
    const raw = '{"title":"Sync","tracks":[{"title":"A","items":[{"title":"one","body":"two"';
    const r = recoverJson(raw);
    expect(r.truncated).toBe(true);
    const value = r.value as { title: string; tracks: { title: string }[] };
    expect(value.title).toBe('Sync');
    expect(value.tracks[0]?.title).toBe('A');
  });

  it('drops a dangling key rather than emitting invalid JSON', () => {
    const raw = '{"title":"Sync","summary":';
    const r = recoverJson(raw);
    expect((r.value as { title: string }).title).toBe('Sync');
  });

  it('closes a string cut off mid-word', () => {
    const raw = '{"title":"Sync","summary":"we discussed the acc';
    const r = recoverJson(raw);
    expect((r.value as { title: string }).title).toBe('Sync');
  });

  it('tolerates trailing commas', () => {
    const r = recoverJson('{"a":[1,2,],}');
    expect(r.value).toEqual({ a: [1, 2] });
  });

  it('throws when there is no object at all', () => {
    expect(() => recoverJson('I cannot help with that.')).toThrow(JsonRecoveryError);
  });
});

/* ------------------------------------------------------------------ */
/* Brief normalisation                                                */
/* ------------------------------------------------------------------ */

const MINIMAL = {
  title: 'CDD Weekly Sync',
  tracks: [
    {
      title: 'Design & Content',
      items: [
        { title: 'Prospectus', body: 'Body text here.', chips: [{ kind: 'done', text: 'ok' }] },
        { title: 'E-books', body: 'More body text.' },
      ],
    },
  ],
  owners: [{ name: 'Sadeev Silva', role: 'Manager', assignment: 'Clear the accounts.' }],
};

function normalise(input: unknown) {
  const parsed = LenientBriefSchema.safeParse(input);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error('unreachable');
  const brief = normaliseBrief(parsed.data, CTX);
  const strict = BriefSchema.safeParse(brief);
  expect(strict.success, JSON.stringify(strict.error?.issues ?? [])).toBe(true);
  return brief;
}

describe('normaliseBrief', () => {
  it('produces a schema-valid brief from a minimal payload', () => {
    const brief = normalise(MINIMAL);
    expect(brief.title).toBe('CDD Weekly Sync');
    expect(brief.tracks[0]?.code).toBe('A');
    expect(brief.tracks[0]?.items).toHaveLength(2);
  });

  it('falls back to the supplied title and date', () => {
    const brief = normalise({ tracks: MINIMAL.tracks, owners: MINIMAL.owners });
    expect(brief.title).toBe('Course Development Meeting');
    expect(brief.dateLabel).toBe('27 July 2026');
  });

  it('assigns track codes by position, ignoring the model', () => {
    const brief = normalise({
      ...MINIMAL,
      tracks: [
        { code: 'Z', title: 'One', items: MINIMAL.tracks[0]!.items },
        { code: 'Q', title: 'Two', items: MINIMAL.tracks[0]!.items },
      ],
    });
    expect(brief.tracks.map((t) => t.code)).toEqual(['A', 'B']);
  });

  it('drops tracks with no usable items', () => {
    const brief = normalise({
      ...MINIMAL,
      tracks: [
        { title: 'Empty', items: [] },
        { title: 'Real', items: MINIMAL.tracks[0]!.items },
      ],
    });
    expect(brief.tracks).toHaveLength(1);
    expect(brief.tracks[0]?.title).toBe('Real');
  });

  it('accepts a delimited string where an array was expected', () => {
    const brief = normalise({ ...MINIMAL, attendees: 'Ana Diaz · Ben Cole · Cai Wu' });
    expect(brief.attendees).toContain('Ana Diaz');
    expect(brief.attendees).toContain('Cai Wu');
  });

  it('accepts a bare string chip', () => {
    const brief = normalise({
      ...MINIMAL,
      tracks: [
        {
          title: 'T',
          items: [{ title: 'i', body: 'b', chips: ['just text'] }],
        },
      ],
    });
    expect(brief.tracks[0]?.items[0]?.chips[0]).toEqual({ kind: 'note', text: 'just text' });
  });

  it('truncates over-long strings instead of failing', () => {
    const brief = normalise({
      ...MINIMAL,
      tracks: [
        {
          title: 'T',
          items: [
            {
              title: 'x'.repeat(400),
              body: 'y'.repeat(4_000),
              chips: [{ kind: 'done', text: 'z'.repeat(200) }],
            },
          ],
        },
      ],
    });
    const item = brief.tracks[0]?.items[0];
    // clamp() must never exceed the schema bound, ellipsis included.
    expect(item!.title.length).toBeLessThanOrEqual(110);
    expect(item!.body.length).toBeLessThanOrEqual(900);
    expect(item!.chips[0]!.text.length).toBeLessThanOrEqual(46);
    expect(item!.title.endsWith('…')).toBe(true);
  });

  it('caps collection sizes', () => {
    const brief = normalise({
      ...MINIMAL,
      metrics: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 10), label: `l${i}` })),
      tracks: Array.from({ length: 12 }, (_, i) => ({
        title: `Track ${i}`,
        items: MINIMAL.tracks[0]!.items,
      })),
      doFirst: Array.from({ length: 9 }, (_, i) => ({ owner: 'A', action: `do ${i}` })),
    });
    expect(brief.metrics.length).toBeLessThanOrEqual(6);
    expect(brief.tracks.length).toBeLessThanOrEqual(5);
    expect(brief.doFirst.length).toBeLessThanOrEqual(3);
  });

  it('de-duplicates owners and attendees case-insensitively', () => {
    const brief = normalise({
      ...MINIMAL,
      attendees: ['Ana Diaz', 'ana diaz', 'Ben Cole'],
      owners: [
        { name: 'Ana Diaz', assignment: 'one' },
        { name: 'ANA DIAZ', assignment: 'two' },
      ],
    });
    expect(brief.attendees.filter((a) => a.toLowerCase() === 'ana diaz')).toHaveLength(1);
    expect(brief.owners).toHaveLength(1);
  });

  it('derives an owner badge when the model omits one', () => {
    const brief = normalise({
      ...MINIMAL,
      owners: [{ name: 'Yenushka Bandara', assignment: 'Support the UI work.' }],
    });
    expect(brief.owners[0]?.badge).toBe('YB');
  });

  it('sanitises a badge down to letters and digits', () => {
    const brief = normalise({
      ...MINIMAL,
      owners: [{ name: 'Ana Diaz', badge: 'm-g-t!', assignment: 'x' }],
    });
    expect(brief.owners[0]?.badge).toBe('MGT');
  });

  it('strips markdown that leaked into text fields', () => {
    const brief = normalise({
      ...MINIMAL,
      summary: '**27 July** — the *big* items',
    });
    expect(brief.summary).toBe('27 July — the big items');
  });

  it('nulls the direction panel when it has no bullets', () => {
    const brief = normalise({ ...MINIMAL, direction: { title: 'Standards', bullets: [] } });
    expect(brief.direction).toBeNull();
  });

  it('keeps a valid direction panel', () => {
    const brief = normalise({
      ...MINIMAL,
      direction: {
        title: 'Standards',
        bullets: [{ lead: 'Tool:', text: 'Use After Effects.' }],
      },
    });
    expect(brief.direction?.bullets).toHaveLength(1);
    expect(brief.direction?.eyebrow).toBe('DIRECTION');
  });

  it('coerces string decisions, risks and doFirst entries', () => {
    const brief = normalise({
      ...MINIMAL,
      decisions: ['Monthly subscription, not annual.'],
      risks: ['The feed may not be restored.'],
      doFirst: ['Clear the accounts today.'],
    });
    expect(brief.decisions[0]).toMatchObject({ status: 'agreed' });
    expect(brief.risks[0]).toMatchObject({ severity: 'medium' });
    expect(brief.doFirst[0]).toMatchObject({ owner: '' });
  });

  it('maps decision and severity synonyms', () => {
    const brief = normalise({
      ...MINIMAL,
      decisions: [{ text: 'Trip location', status: 'postponed' }],
      risks: [{ text: 'Close slips', severity: 'critical' }],
    });
    expect(brief.decisions[0]?.status).toBe('deferred');
    expect(brief.risks[0]?.severity).toBe('high');
  });

  it('defaults footer tags to the track titles', () => {
    const brief = normalise(MINIMAL);
    expect(brief.footerTags.length).toBeGreaterThan(0);
  });

  it('merges roster names into attendees', () => {
    const brief = normalise(MINIMAL);
    expect(brief.attendees).toContain('Sadeev Silva');
  });

  it('survives a completely empty object', () => {
    const parsed = LenientBriefSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const brief = normaliseBrief(parsed.data, CTX);
    expect(BriefSchema.safeParse(brief).success).toBe(true);
    expect(brief.tracks).toEqual([]);
  });

  it('survives hostile input types', () => {
    const parsed = LenientBriefSchema.safeParse({
      title: 12345,
      attendees: [null, 42, { name: 'Ana Diaz' }, ''],
      metrics: [{ value: 7, label: true }],
      tracks: 'not an array',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const brief = normaliseBrief(parsed.data, CTX);
    expect(brief.title).toBe('12345');
    expect(brief.attendees).toContain('Ana Diaz');
    expect(BriefSchema.safeParse(brief).success).toBe(true);
  });
});

describe('briefIsUsable', () => {
  it('accepts a populated brief', () => {
    expect(briefIsUsable(normalise(MINIMAL)).ok).toBe(true);
  });
  it('rejects a brief with no tracks', () => {
    const brief = normalise({ title: 'x', owners: MINIMAL.owners });
    expect(briefIsUsable(brief).ok).toBe(false);
  });
  it('rejects a brief with a single item', () => {
    const brief = normalise({
      title: 'x',
      tracks: [{ title: 'T', items: [{ title: 'i', body: 'b' }] }],
      owners: MINIMAL.owners,
    });
    expect(briefIsUsable(brief).ok).toBe(false);
  });
  it('rejects a brief with no owners and no actions', () => {
    const brief = normalise({ title: 'x', tracks: MINIMAL.tracks });
    expect(briefIsUsable(brief).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Inputs                                                            */
/* ------------------------------------------------------------------ */

describe('parseRoster', () => {
  it('parses em-dash separated name and role', () => {
    expect(parseRoster('Sadeev Silva — Manager\nRidma Keshan — Senior Graphic Designer')).toEqual([
      { name: 'Sadeev Silva', role: 'Manager' },
      { name: 'Ridma Keshan', role: 'Senior Graphic Designer' },
    ]);
  });
  it('parses hyphen, parenthesis and colon forms', () => {
    expect(parseRoster('A One - Role X')[0]).toEqual({ name: 'A One', role: 'Role X' });
    expect(parseRoster('B Two (Role Y)')[0]).toEqual({ name: 'B Two', role: 'Role Y' });
    expect(parseRoster('C Three: Role Z')[0]).toEqual({ name: 'C Three', role: 'Role Z' });
  });

  it('parses the comma form only in multi-line mode', () => {
    // Multi-line: "Name, Role" is unambiguous.
    expect(parseRoster('D Four, Role W\nE Five')[0]).toEqual({
      name: 'D Four',
      role: 'Role W',
    });
    // Single line: commas separate names, which is what a one-line paste means.
    expect(parseRoster('D Four, E Five').map((r) => r.name)).toEqual(['D Four', 'E Five']);
  });
  it('treats a single comma-separated line as a name list', () => {
    expect(parseRoster('Ana Diaz, Ben Cole, Cai Wu').map((r) => r.name)).toEqual([
      'Ana Diaz',
      'Ben Cole',
      'Cai Wu',
    ]);
  });
  it('strips list markers', () => {
    expect(parseRoster('1. Ana Diaz\n- Ben Cole\n• Cai Wu').map((r) => r.name)).toEqual([
      'Ana Diaz',
      'Ben Cole',
      'Cai Wu',
    ]);
  });
  it('de-duplicates', () => {
    expect(parseRoster('Ana Diaz\nana diaz')).toHaveLength(1);
  });
  it('returns an empty array for blank input', () => {
    expect(parseRoster('   \n  ')).toEqual([]);
  });
});

describe('parseTermList', () => {
  it('splits on commas, semicolons and newlines', () => {
    expect(parseTermList('LMS, Aspirex\nSLC; ITIL5')).toEqual(['LMS', 'Aspirex', 'SLC', 'ITIL5']);
  });
  it('de-duplicates case-insensitively', () => {
    expect(parseTermList('LMS, lms')).toEqual(['LMS']);
  });
});

describe('formatDateLabel', () => {
  it('formats an ISO date in British long form', () => {
    expect(formatDateLabel('2026-07-27')).toBe('27 July 2026');
    expect(formatDateLabel('2026-01-01')).toBe('1 January 2026');
  });
  it('rejects malformed and impossible dates', () => {
    expect(formatDateLabel('27/07/2026')).toBe('');
    expect(formatDateLabel('2026-02-31')).toBe('');
    expect(formatDateLabel('')).toBe('');
  });
});

describe('BriefInputsSchema', () => {
  it('applies defaults', () => {
    const parsed = BriefInputsSchema.parse({
      departments: ['finance'],
      meetingType: 'team',
      confidentiality: 'internal',
    });
    expect(parsed.depth).toBe('fast');
    expect(parsed.meetingTitle).toBe('');
  });
  it('rejects an unknown department', () => {
    expect(
      BriefInputsSchema.safeParse({
        departments: ['legal'],
        meetingType: 'team',
        confidentiality: 'internal',
      }).success,
    ).toBe(false);
  });
  it('rejects an empty department list', () => {
    expect(
      BriefInputsSchema.safeParse({
        departments: [],
        meetingType: 'team',
        confidentiality: 'internal',
      }).success,
    ).toBe(false);
  });
  it('rejects a malformed date', () => {
    expect(
      BriefInputsSchema.safeParse({
        departments: ['finance'],
        meetingType: 'team',
        confidentiality: 'internal',
        meetingDate: '27-07-2026',
      }).success,
    ).toBe(false);
  });
  it('rejects over-long free text', () => {
    expect(
      BriefInputsSchema.safeParse({
        departments: ['finance'],
        meetingType: 'team',
        confidentiality: 'internal',
        focus: 'x'.repeat(2_000),
      }).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Cost                                                              */
/* ------------------------------------------------------------------ */

describe('estimateCostUsd', () => {
  it('prices a Flash call', () => {
    const cost = estimateCostUsd('deepseek/deepseek-v4-flash', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    expect(cost).toBeCloseTo(0.09 + 0.18, 6);
  });
  it('prices a Pro call', () => {
    const cost = estimateCostUsd('deepseek/deepseek-v4-pro', {
      promptTokens: 1_000_000,
      completionTokens: 0,
      totalTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.435, 6);
  });
  it('returns null for an unpriced model rather than guessing', () => {
    expect(
      estimateCostUsd('some/unknown-model', {
        promptTokens: 100,
        completionTokens: 100,
        totalTokens: 200,
      }),
    ).toBeNull();
  });
  it('has pricing for both configured tiers', () => {
    expect(MODEL_PRICING['deepseek/deepseek-v4-flash']).toBeDefined();
    expect(MODEL_PRICING['deepseek/deepseek-v4-pro']).toBeDefined();
  });
});
