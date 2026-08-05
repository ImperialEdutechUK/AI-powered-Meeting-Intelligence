import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ingestTranscript } from '@/lib/transcript';
import { generateBrief, GenerationError } from '@/lib/ai/generate';
import { checkGrounding } from '@/lib/qa/grounding';
import { BriefBundleSchema, BUNDLE_VERSION, type BriefBundle } from '@/lib/brief-bundle';
import { DEFAULT_BRIEF_INPUTS, type BriefInputs } from '@/lib/brief-inputs';
import { OpenRouterError, type CompletionOptions, type CompletionResult } from '@/lib/ai/openrouter';
import { resetEnvCache } from '@/lib/env';

/**
 * End-to-end pipeline with the model mocked at the HTTP boundary.
 *
 * Everything below the model is exercised for real: parsing, prompting,
 * JSON recovery, normalisation, schema validation, grounding and bundling.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

beforeAll(() => {
  // The generator reads model names and pricing from the environment.
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-key-not-real-000000000000';
  process.env.APP_PASSCODE = 'test-passcode-123';
  process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.DATABASE_URL ??= 'postgres://postgres@127.0.0.1:5433/actionbrief';
  resetEnvCache();
});

const INPUTS: BriefInputs = {
  ...DEFAULT_BRIEF_INPUTS,
  department: 'course-development',
  meetingType: 'team',
  meetingDate: '2026-07-27',
  chair: 'Sadeev Silva',
  roster: 'Sadeev Silva — Manager\nRidma Keshan — Senior Graphic Designer',
  glossary: 'ITIL5, Freepik, After Effects',
};

/** A well-formed model response covering every optional section. */
const GOOD_JSON = JSON.stringify({
  title: 'CDD Weekly Sync',
  dateLabel: '27 July 2026',
  summary: '27 July 2026 — account suspensions, e-books, video uploads and the ITIL overhaul.',
  metaChips: ['27 July 2026', 'Chaired by Sadeev Silva'],
  attendees: ['Sadeev Silva', 'Ridma Keshan', 'Yoga Milona', 'Malsha Nirmani'],
  spotlights: [
    {
      tone: 'critical',
      title: 'Account suspensions blocking projects',
      body: 'Google, Freepik and Adobe are suspended. Sadeev will clear them today.',
    },
  ],
  metrics: [
    { value: '34', label: 'E-books completed' },
    { value: '1,900', label: 'Videos remaining' },
    { value: '9', label: 'Science videos done' },
  ],
  tracks: [
    {
      title: 'Design, Content & E-books',
      leads: ['Ridma Keshan'],
      items: [
        {
          title: 'Prospectus — finish by end of tomorrow once accounts are restored',
          owners: ['Ridma Keshan'],
          body: 'Blocked on Freepik access. Ridma commits to end of tomorrow once restored.',
          chips: [
            { kind: 'blocked', text: 'Blocked by suspension' },
            { kind: 'date', text: 'End of tomorrow' },
          ],
        },
        {
          title: 'E-books — 34 complete',
          owners: ['Yoga Milona'],
          body: 'Yoga has completed 34 e-books and is now on childcare and early education.',
          chips: [{ kind: 'done', text: '34 done' }],
        },
      ],
    },
    {
      title: 'Video Production',
      leads: ['Malsha Nirmani'],
      items: [
        {
          title: 'Science videos — rate is unsustainable',
          owners: ['Malsha Nirmani'],
          body: 'Nine done, five more targeted. Malsha to produce a subject breakdown.',
          chips: [{ kind: 'action', text: 'Breakdown as PPT' }],
        },
      ],
    },
  ],
  direction: {
    eyebrow: 'DIRECTION · ITIL5 STANDARDS',
    title: 'Move away from static AI avatars',
    bullets: [{ lead: 'Primary tool:', text: 'After Effects for animated content.' }],
  },
  doFirst: [
    { owner: 'Sadeev Silva', action: 'Clear all suspended accounts today.' },
    { owner: 'Ridma Keshan', action: 'Finish the prospectus by end of tomorrow.' },
  ],
  decisions: [{ text: 'Monthly diagram subscription, not annual.', owner: 'Malsha Nirmani', status: 'agreed' }],
  risks: [{ text: 'Science video timeline is impractical.', severity: 'high', owner: 'Malsha Nirmani' }],
  openQuestions: ['Who covers card access when Ms. Rushan is away?'],
  owners: [
    { name: 'Sadeev Silva', badge: 'MGT', role: 'Manager', assignment: 'Clear the suspended accounts today.' },
    { name: 'Ridma Keshan', badge: 'DES', role: 'Senior Graphic Designer', assignment: 'Finish the prospectus.' },
  ],
  ownersNote: '',
  timeline: [
    { when: 'Today', what: 'Accounts restored', who: ['Sadeev Silva'] },
    { when: 'Tomorrow', what: 'Prospectus finalised', who: ['Ridma Keshan'] },
  ],
  footerTags: ['Design & E-books', 'Video Production'],
});

function mockCompletion(
  text: string,
  overrides: Partial<CompletionResult> = {},
): typeof import('@/lib/ai/openrouter').complete {
  return async (_options: CompletionOptions): Promise<CompletionResult> => ({
    text,
    model: 'deepseek/deepseek-v4-flash',
    usage: { promptTokens: 11_284, completionTokens: 4_902, totalTokens: 16_186 },
    finishReason: 'stop',
    attempts: 1,
    ...overrides,
  });
}

async function loadTranscript() {
  return ingestTranscript({
    fileName: 'teams.vtt',
    buffer: readFileSync(join(FIXTURES, 'teams.vtt')),
    maxBytes: 25 * 1024 * 1024,
    knownNames: ['Sadeev Silva', 'Ridma Keshan'],
  });
}

describe('generateBrief', () => {
  it('produces a complete brief from a clean response', async () => {
    const transcript = await loadTranscript();
    const result = await generateBrief({
      inputs: INPUTS,
      transcript,
      completionFn: mockCompletion(GOOD_JSON),
    });

    expect(result.brief.title).toBe('CDD Weekly Sync');
    expect(result.brief.tracks).toHaveLength(2);
    expect(result.brief.tracks.map((t) => t.code)).toEqual(['A', 'B']);
    expect(result.telemetry.strategy).toBe('single-pass');
    expect(result.telemetry.retries).toBe(0);
    expect(result.telemetry.repaired).toBe(false);
    expect(result.telemetry.costUsd).toBeGreaterThan(0);
    expect(result.telemetry.calls).toHaveLength(1);
  });

  it('recovers when the model wraps the JSON in fences and prose', async () => {
    const transcript = await loadTranscript();
    const result = await generateBrief({
      inputs: INPUTS,
      transcript,
      completionFn: mockCompletion(
        `Certainly — here is the brief.\n\n\`\`\`json\n${GOOD_JSON}\n\`\`\`\n\nLet me know if you need changes.`,
      ),
    });
    expect(result.brief.title).toBe('CDD Weekly Sync');
    expect(result.brief.tracks).toHaveLength(2);
    // Unwrapping a fence is not counted as a repair: the payload inside was
    // valid, so raising the "JSON needed repairing" caveat would be a false alarm.
    expect(result.telemetry.repaired).toBe(false);
  });

  it('reports a repair when the JSON is structurally broken', async () => {
    const transcript = await loadTranscript();
    const result = await generateBrief({
      inputs: INPUTS,
      transcript,
      // Trailing commas: recoverable, but genuinely a repair.
      completionFn: mockCompletion(GOOD_JSON.replace(/}\]/g, '},]')),
    });
    expect(result.telemetry.repaired).toBe(true);
    expect(result.brief.tracks.length).toBeGreaterThan(0);
  });

  it('retries once when the first response is too thin, then succeeds', async () => {
    const transcript = await loadTranscript();
    let call = 0;
    const result = await generateBrief({
      inputs: INPUTS,
      transcript,
      completionFn: async (): Promise<CompletionResult> => {
        call += 1;
        return {
          text: call === 1 ? JSON.stringify({ title: 'Thin', tracks: [] }) : GOOD_JSON,
          model: 'deepseek/deepseek-v4-flash',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          finishReason: 'stop',
          attempts: 1,
        };
      },
    });

    expect(call).toBe(2);
    expect(result.telemetry.retries).toBe(1);
    expect(result.brief.tracks).toHaveLength(2);
  });

  it('gives up with a clear error when both attempts are unusable', async () => {
    const transcript = await loadTranscript();
    await expect(
      generateBrief({
        inputs: INPUTS,
        transcript,
        completionFn: mockCompletion(JSON.stringify({ title: 'Thin', tracks: [] })),
      }),
    ).rejects.toBeInstanceOf(GenerationError);
  });

  it('surfaces a model transport error rather than retrying forever', async () => {
    const transcript = await loadTranscript();
    await expect(
      generateBrief({
        inputs: INPUTS,
        transcript,
        completionFn: async () => {
          throw new OpenRouterError('CREDIT', 'Out of credit.', 402, false);
        },
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });

  it('flags truncated output in telemetry so the reader is warned', async () => {
    const transcript = await loadTranscript();
    const cut = GOOD_JSON.slice(0, GOOD_JSON.length - 400);
    const result = await generateBrief({
      inputs: INPUTS,
      transcript,
      completionFn: mockCompletion(cut, { finishReason: 'length' }),
    });
    expect(result.telemetry.truncatedOutput).toBe(true);
    // The salvageable part is still a usable document.
    expect(result.brief.tracks.length).toBeGreaterThan(0);
  });

  it('passes the roster through to attendees', async () => {
    const transcript = await loadTranscript();
    const result = await generateBrief({
      inputs: INPUTS,
      transcript,
      completionFn: mockCompletion(GOOD_JSON),
    });
    expect(result.brief.attendees).toContain('Ridma Keshan');
  });
});

describe('full bundle assembly', () => {
  it('produces a schema-valid bundle with a grounding report', async () => {
    const transcript = await loadTranscript();
    const { brief, telemetry } = await generateBrief({
      inputs: INPUTS,
      transcript,
      completionFn: mockCompletion(GOOD_JSON),
    });

    const grounding = checkGrounding({
      brief,
      transcript,
      userContext: [INPUTS.chair, INPUTS.roster, INPUTS.glossary],
      rosterNames: ['Sadeev Silva', 'Ridma Keshan'],
    });

    const bundle: BriefBundle = {
      version: BUNDLE_VERSION,
      brief,
      department: INPUTS.department,
      meetingType: INPUTS.meetingType,
      confidentiality: INPUTS.confidentiality,
      transcript: {
        fileName: transcript.sourceName,
        format: transcript.format,
        hasTimings: transcript.stats.hasTimings,
        durationMs: transcript.stats.durationMs,
        totalWords: transcript.stats.totalWords,
        totalCues: transcript.stats.totalCues,
        speakers: transcript.stats.speakers,
        unattributedCues: transcript.stats.unattributedCues,
        warnings: transcript.warnings,
      },
      grounding,
      telemetry,
      generatedAt: new Date().toISOString(),
    };

    const parsed = BriefBundleSchema.safeParse(bundle);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 8) ?? [])).toBe(true);

    // Every figure in the mock response is genuinely spoken in the fixture.
    const unattested = grounding.findings.filter((f) => f.kind === 'unattested-number');
    expect(unattested, JSON.stringify(unattested)).toHaveLength(0);
  });
});
