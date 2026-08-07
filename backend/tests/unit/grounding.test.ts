import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildNumberIndex,
  canonicalNumber,
  extractNumbers,
  isTriviallyAttested,
  spelledNumbers,
} from '@/lib/qa/numbers';
import { checkGrounding } from '@/lib/qa/grounding';
import { ingestTranscript } from '@/lib/transcript';
import { BriefSchema, LenientBriefSchema, normaliseBrief } from '@/lib/ai/schema';
import type { Brief } from '@/lib/ai/schema';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

/* ------------------------------------------------------------------ */
/* Number words                                                       */
/* ------------------------------------------------------------------ */

describe('spelledNumbers', () => {
  it('reads simple cardinals', () => {
    expect(spelledNumbers('we have nine done')).toContain(9);
    expect(spelledNumbers('thirty four e-books')).toContain(34);
  });

  it('reads hundreds and thousands', () => {
    expect(spelledNumbers('one thousand nine hundred videos')).toContain(1900);
    expect(spelledNumbers('a hundred plus per subject')).toContain(100);
    expect(spelledNumbers('two thousand and twenty six')).toContain(2026);
  });

  it('reads compound tens', () => {
    expect(spelledNumbers('twenty five')).toContain(25);
    expect(spelledNumbers('ninety nine')).toContain(99);
  });

  it('handles the common "fourty" misspelling', () => {
    expect(spelledNumbers('fourty two')).toContain(42);
  });

  it('reads ordinals', () => {
    expect(spelledNumbers('the second week')).toContain(2);
    expect(spelledNumbers('day four')).toContain(4);
  });

  it('reads millions', () => {
    expect(spelledNumbers('two million five hundred thousand')).toContain(2_500_000);
  });

  it('splits adjacent unrelated units', () => {
    const found = spelledNumbers('nine five');
    expect(found).toContain(9);
    expect(found).toContain(5);
  });

  it('ignores a bare scale word with no quantity', () => {
    expect(spelledNumbers('hundreds of things')).toEqual([]);
  });

  it('ignores prose with no numbers', () => {
    expect(spelledNumbers('we should organise the meeting')).toEqual([]);
  });

  it('does not treat a bare article as a number', () => {
    expect(spelledNumbers('a meeting about a plan')).toEqual([]);
  });
});

describe('canonicalNumber', () => {
  it('normalises separators', () => {
    expect(canonicalNumber('1,900')).toBe('1900');
    expect(canonicalNumber('1 900')).toBe('1900');
    expect(canonicalNumber('1900')).toBe('1900');
  });
  it('strips currency and modifiers', () => {
    expect(canonicalNumber('£5,000')).toBe('5000');
    expect(canonicalNumber('100+')).toBe('100');
    expect(canonicalNumber('12%')).toBe('12');
  });
  it('normalises decimals', () => {
    expect(canonicalNumber('12.0')).toBe('12');
    expect(canonicalNumber('12.50')).toBe('12.5');
  });
  it('rejects non-numbers', () => {
    expect(canonicalNumber('abc')).toBeNull();
    expect(canonicalNumber('')).toBeNull();
    expect(canonicalNumber('1-2')).toBeNull();
  });
});

describe('extractNumbers', () => {
  it('finds every literal in a sentence', () => {
    expect(extractNumbers('34 books, 1,900 videos and 100+ per subject')).toEqual([
      '34',
      '1900',
      '100',
    ]);
  });
  it('returns an empty array for prose', () => {
    expect(extractNumbers('no digits here')).toEqual([]);
  });
});

describe('isTriviallyAttested', () => {
  it('waves through single digits and years', () => {
    expect(isTriviallyAttested('5')).toBe(true);
    expect(isTriviallyAttested('2026')).toBe(true);
  });
  it('requires attestation for real quantities', () => {
    expect(isTriviallyAttested('34')).toBe(false);
    expect(isTriviallyAttested('1900')).toBe(false);
  });
});

describe('buildNumberIndex', () => {
  it('indexes digits and words together', () => {
    const index = buildNumberIndex(['we finished thirty four of them', 'and 1,900 remain']);
    expect(index.has('34')).toBe(true);
    expect(index.has('1900')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Grounding against a real transcript                                */
/* ------------------------------------------------------------------ */

function makeBrief(overrides: Record<string, unknown>): Brief {
  const base = {
    title: 'CDD Weekly Sync',
    summary: '27 July 2026 — accounts, videos and e-books.',
    tracks: [
      {
        title: 'Content',
        items: [
          { title: 'Prospectus', body: 'Ridma will finish it tomorrow.' },
          { title: 'E-books', body: 'Yoga has completed 34 e-books in total.' },
        ],
      },
    ],
    owners: [{ name: 'Sadeev Silva', role: 'Manager', assignment: 'Clear the accounts today.' }],
    ...overrides,
  };
  const parsed = LenientBriefSchema.parse(base);
  const brief = normaliseBrief(parsed, {
    fallbackTitle: 'Meeting',
    fallbackDateLabel: '27 July 2026',
    departmentCode: 'CDD',
    rosterNames: [],
  });
  return BriefSchema.parse(brief);
}

describe('checkGrounding', () => {
  const load = async () =>
    ingestTranscript({
      fileName: 'teams.vtt',
      buffer: readFileSync(join(FIXTURES, 'teams.vtt')),
      maxBytes: 25 * 1024 * 1024,
    });

  it('passes figures that were spoken as words', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        metrics: [
          { value: '34', label: 'E-books completed' },
          { value: '1,900', label: 'Videos remaining' },
          { value: '100+', label: 'Videos per subject' },
        ],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });

    const numberFindings = report.findings.filter((f) => f.kind === 'unattested-number');
    expect(numberFindings, JSON.stringify(numberFindings)).toHaveLength(0);
    expect(report.checked.numbers).toBeGreaterThan(0);
  });

  it('flags an invented figure', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({ metrics: [{ value: '7,431', label: 'Fabricated total' }] }),
      transcript,
      userContext: [],
      rosterNames: [],
    });

    const finding = report.findings.find((f) => f.value === '7431');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('high');
    expect(finding?.location).toContain('Metric');
  });

  it('accepts a figure the user supplied in the context fields', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({ metrics: [{ value: '7,431', label: 'Learners enrolled' }] }),
      transcript,
      userContext: ['Current enrolment is 7,431 learners across all centres.'],
      rosterNames: [],
    });
    expect(report.findings.some((f) => f.value === '7431')).toBe(false);
  });

  it('accepts names that spoke in the meeting', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        owners: [
          { name: 'Sadeev Silva', assignment: 'Clear accounts.' },
          { name: 'Yenushka Bandara', assignment: 'Support the UI work.' },
        ],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(report.findings.some((f) => f.kind === 'unknown-person')).toBe(false);
  });

  it('flags a person who is nowhere in the source', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        owners: [{ name: 'Gregor Fenwick', assignment: 'Do the thing.' }],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    const finding = report.findings.find((f) => f.kind === 'unknown-person');
    expect(finding?.value).toBe('Gregor Fenwick');
    expect(finding?.severity).toBe('high');
  });

  it('accepts a person supplied only on the roster', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        owners: [{ name: 'Gregor Fenwick', assignment: 'Do the thing.' }],
      }),
      transcript,
      userContext: [],
      rosterNames: ['Gregor Fenwick'],
    });
    expect(report.findings.some((f) => f.kind === 'unknown-person')).toBe(false);
  });

  it('accepts a person only mentioned by others, never a speaker', async () => {
    const transcript = await load();
    // "Mr. Rushan" is named in the dialogue but never speaks.
    const report = checkGrounding({
      brief: makeBrief({
        owners: [{ name: 'Rushan', assignment: 'Return and restore card access.' }],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(report.findings.some((f) => f.kind === 'unknown-person')).toBe(false);
  });

  it('downgrades a half-matching name to low severity', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        owners: [{ name: 'Sadeev Wickramasinghe', assignment: 'Something.' }],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    const finding = report.findings.find((f) => f.kind === 'partial-person');
    expect(finding?.severity).toBe('low');
  });

  it('notes a missing owners section', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({ owners: [] }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(report.findings.some((f) => f.kind === 'empty-section')).toBe(true);
  });

  it('scores 100 and reports clean when everything checks out', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        metrics: [{ value: '34', label: 'E-books completed' }],
        timeline: [{ when: 'Today', what: 'Accounts restored', who: ['Sadeev Silva'] }],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(report.score).toBe(100);
    expect(report.clean).toBe(true);
  });

  it('sorts high severity findings first', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({
        metrics: [{ value: '9,999', label: 'Invented' }],
        owners: [
          { name: 'Sadeev Wickramasinghe', assignment: 'Partial name.' },
          { name: 'Gregor Fenwick', assignment: 'Unknown name.' },
        ],
      }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(report.findings[0]?.severity).toBe('high');
    expect(report.findings[report.findings.length - 1]?.severity).toBe('low');
    expect(report.score).toBeLessThan(100);
  });

  it('does not flag the date label the user supplied', async () => {
    const transcript = await load();
    const report = checkGrounding({
      brief: makeBrief({ dateLabel: '27 July 2026' }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(report.findings.some((f) => f.value === '27')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Adversarial input                                                  */
/* ------------------------------------------------------------------ */

describe('spelledNumbers performance guard', () => {
  it('stays fast on a document made entirely of number words', () => {
    // Before the run-window cap this input was cubic in the word count and hung
    // the request. 20,000 words must complete in well under a second.
    const hostile = 'one '.repeat(20_000).trim();
    const started = Date.now();
    const found = spelledNumbers(hostile);
    const elapsed = Date.now() - started;

    expect(found.length).toBe(20_000);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('stays fast on long mixed number-word runs', () => {
    const hostile = 'one hundred and twenty three thousand '.repeat(3_000).trim();
    const started = Date.now();
    spelledNumbers(hostile);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('still reads a full-length real number after the cap', () => {
    expect(
      spelledNumbers('two hundred and thirty four thousand five hundred and sixty seven'),
    ).toContain(234_567);
  });
});

describe('checkGrounding on adversarial content', () => {
  it('completes promptly against a transcript of number words', async () => {
    const buffer = Buffer.from(
      `Ana Diaz: ${'seven '.repeat(8_000).trim()}\nBen Cole: ${'nine '.repeat(8_000).trim()}`,
    );
    const transcript = await ingestTranscript({
      fileName: 'hostile.txt',
      buffer,
      maxBytes: 25 * 1024 * 1024,
    });

    const started = Date.now();
    const report = checkGrounding({
      brief: makeBrief({ metrics: [{ value: '7', label: 'Sevens' }] }),
      transcript,
      userContext: [],
      rosterNames: [],
    });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(report.score).toBeGreaterThanOrEqual(0);
  });
});
