import { describe, expect, it, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderDocx } from '@/lib/export/docx';
import { SAMPLE_BUNDLE } from '@/lib/sample-brief';
import { BriefBundleSchema } from '@/lib/brief-bundle';

const ARTIFACTS = join(process.cwd(), 'artifacts');

describe('sample bundle', () => {
  it('satisfies the persisted bundle schema', () => {
    const parsed = BriefBundleSchema.safeParse(SAMPLE_BUNDLE);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 6) ?? [])).toBe(true);
  });
});

describe('renderDocx', () => {
  beforeAll(() => {
    mkdirSync(ARTIFACTS, { recursive: true });
  });

  it('produces a valid, non-trivial .docx', async () => {
    const buffer = await renderDocx(SAMPLE_BUNDLE, 'Imperial Learning');
    writeFileSync(join(ARTIFACTS, 'sample.docx'), buffer);

    // A DOCX is a zip: check the local file header magic.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.length).toBeGreaterThan(12_000);
  });

  it('handles a minimal brief without throwing', async () => {
    const minimal = {
      ...SAMPLE_BUNDLE,
      brief: {
        ...SAMPLE_BUNDLE.brief,
        spotlights: [],
        metrics: [],
        direction: null,
        doFirst: [],
        decisions: [],
        risks: [],
        openQuestions: [],
        owners: [],
        ownersNote: '',
        timeline: [],
        footerTags: [],
        absentees: [],
      },
      transcript: { ...SAMPLE_BUNDLE.transcript, speakers: [] },
    };
    const buffer = await renderDocx(minimal, 'Imperial Learning');
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
