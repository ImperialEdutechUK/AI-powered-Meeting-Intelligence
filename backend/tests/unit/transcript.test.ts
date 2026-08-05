import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  cleanSpeakerName,
  computeStats,
  detectCueFormat,
  formatClock,
  formatDuration,
  ingestTranscript,
  looksLikeSpeaker,
  normaliseText,
  parseCueFile,
  parsePlainTranscript,
  parseTimestamp,
  speakerKey,
  toDialogue,
} from '@/lib/transcript';
import { chunkCues, clampDialogue, needsChunking } from '@/lib/transcript/chunk';
import { cleanUtterance, decodeEntities, stripTags } from '@/lib/transcript/cues';
import { TranscriptError } from '@/lib/transcript/types';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const readFixture = (name: string) => readFileSync(join(FIXTURES, name));
const MAX = 25 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Text hygiene                                                       */
/* ------------------------------------------------------------------ */

describe('normaliseText', () => {
  it('strips a leading BOM and normalises CRLF', () => {
    expect(normaliseText('﻿a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('converts space-like characters to plain spaces', () => {
    // NBSP, thin space, narrow NBSP, ideographic space
    const input = 'a b c d　e';
    expect(normaliseText(input)).toBe('a b c d e');
  });

  it('removes zero-width characters', () => {
    expect(normaliseText('a​b‍c⁠d﻿e')).toBe('abcde');
  });

  it('expands tabs so the two-space speaker header regex still matches', () => {
    expect(normaliseText('Amara Osei\t0:04')).toBe('Amara Osei  0:04');
  });
});

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot;')).toBe('a & b <c> "d"');
  });
  it('decodes decimal and hex numeric references', () => {
    expect(decodeEntities('&#39;&#x2014;')).toBe("'—");
  });
  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&notareal;')).toBe('&notareal;');
  });
  it('does not crash on out-of-range code points', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;');
  });
});

describe('stripTags / cleanUtterance', () => {
  it('removes markup but keeps the words', () => {
    expect(stripTags('<v Bob><c.yellow>hello</c></v>')).toBe('hello');
  });
  it('collapses newlines and runs of spaces', () => {
    expect(cleanUtterance('one\ntwo    three')).toBe('one two three');
  });
});

/* ------------------------------------------------------------------ */
/* Timestamps                                                         */
/* ------------------------------------------------------------------ */

describe('parseTimestamp', () => {
  it('parses HH:MM:SS.mmm', () => {
    expect(parseTimestamp('01:02:03.456')).toBe(3_723_456);
  });
  it('parses SRT comma decimals', () => {
    expect(parseTimestamp('00:00:05,250')).toBe(5_250);
  });
  it('parses MM:SS', () => {
    expect(parseTimestamp('4:07')).toBe(247_000);
  });
  it('pads short fractions correctly', () => {
    expect(parseTimestamp('00:00:01.5')).toBe(1_500);
    expect(parseTimestamp('00:00:01.05')).toBe(1_050);
  });
  it('rejects impossible minute and second fields', () => {
    expect(parseTimestamp('00:75:00')).toBeNull();
    expect(parseTimestamp('00:00:99')).toBeNull();
  });
  it('rejects non-timestamps', () => {
    expect(parseTimestamp('hello')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('1900')).toBeNull();
  });
});

describe('duration formatting', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3_840_000)).toBe('1h 04m');
    expect(formatDuration(2_820_000)).toBe('47m');
    expect(formatDuration(38_000)).toBe('38s');
  });
  it('returns an em dash for missing durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
  });
  it('formats clocks with and without an hour component', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(null)).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* Speaker names                                                      */
/* ------------------------------------------------------------------ */

describe('cleanSpeakerName', () => {
  it('drops Teams guest suffixes', () => {
    expect(cleanSpeakerName('Sadeev Silva (Guest)')).toBe('Sadeev Silva');
    expect(cleanSpeakerName('Ridma Keshan (External)')).toBe('Ridma Keshan');
  });
  it('un-swaps directory order', () => {
    expect(cleanSpeakerName('Silva, Sadeev')).toBe('Sadeev Silva');
  });
  it('title-cases shouted names', () => {
    expect(cleanSpeakerName('SADEEV SILVA')).toBe('Sadeev Silva');
  });
  it('keeps legitimate short forms intact', () => {
    expect(cleanSpeakerName("O'Brien")).toBe("O'Brien");
    expect(cleanSpeakerName('Jo')).toBe('Jo');
  });
  it('strips trailing punctuation and leading bullets', () => {
    expect(cleanSpeakerName('- Priya Raman:')).toBe('Priya Raman');
  });
});

describe('speakerKey', () => {
  it('matches the same person across spelling noise', () => {
    expect(speakerKey('Sadeev  Silva')).toBe(speakerKey('sadeev silva'));
    expect(speakerKey("O'Brien")).toBe(speakerKey('OBrien'));
  });
});

describe('looksLikeSpeaker', () => {
  it('accepts plausible names', () => {
    expect(looksLikeSpeaker('Amara Osei')).toBe(true);
    expect(looksLikeSpeaker('Fathima Zahra')).toBe(true);
  });
  it('rejects document labels', () => {
    for (const label of ['Note', 'Action', 'Agenda', 'Decisions', 'Attendees', 'AOB']) {
      expect(looksLikeSpeaker(label), label).toBe(false);
    }
  });
  it('rejects sentences and long phrases', () => {
    expect(looksLikeSpeaker('That is the plan.')).toBe(false);
    expect(looksLikeSpeaker('one two three four five six')).toBe(false);
  });
  it('rejects strings with markup or long digit runs', () => {
    expect(looksLikeSpeaker('Item #1234')).toBe(false);
    expect(looksLikeSpeaker('<v Bob>')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* VTT parsing                                                        */
/* ------------------------------------------------------------------ */

describe('detectCueFormat', () => {
  it('detects WEBVTT', () => {
    expect(detectCueFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi')).toBe('vtt');
  });
  it('detects SRT by index lines and comma decimals', () => {
    expect(detectCueFormat('1\n00:00:01,000 --> 00:00:02,000\nhi\n')).toBe('srt');
  });
  it('returns null for prose', () => {
    expect(detectCueFormat('Amara Osei  0:04\nMorning all.')).toBeNull();
  });
});

describe('parseCueFile on a real Teams VTT', () => {
  const raw = normaliseText(readFixture('teams.vtt').toString('utf8'));
  const { cues } = parseCueFile(raw, 'vtt');

  it('extracts every speaker with no metadata leakage', () => {
    const names = [...new Set(cues.map((c) => c.speaker))];
    expect(names).toContain('Sadeev Silva');
    expect(names).toContain('Ridma Keshan');
    expect(names).toContain('Yenushka Bandara');
    expect(names).not.toContain(null);
    expect(names.some((n) => n?.includes('WEBVTT'))).toBe(false);
  });

  it('never emits a cue identifier or NOTE block as dialogue', () => {
    const joined = cues.map((c) => c.text).join(' ');
    expect(joined).not.toContain('8f2c1a90');
    expect(joined).not.toContain('generated by Microsoft Teams');
  });

  it('merges consecutive turns from the same speaker', () => {
    // Cues 1 and 2 are both Sadeev, 0.0s apart, so they must be one turn.
    const first = cues[0];
    expect(first?.speaker).toBe('Sadeev Silva');
    expect(first?.text).toContain('account suspensions');
    expect(first?.text).toContain('payment cards');
  });

  it('recovers from a cue with an unclosed <v> tag', () => {
    const nonNegotiable = cues.find((c) => c.text.includes('non negotiable'));
    expect(nonNegotiable?.speaker).toBe('Sadeev Silva');
  });

  it('produces monotonically non-decreasing start times', () => {
    for (let i = 1; i < cues.length; i += 1) {
      expect(cues[i]!.startMs!).toBeGreaterThanOrEqual(cues[i - 1]!.startMs!);
    }
  });

  it('keeps end times at or after start times', () => {
    for (const cue of cues) {
      expect(cue.endMs!).toBeGreaterThanOrEqual(cue.startMs!);
    }
  });
});

describe('parseCueFile edge cases', () => {
  it('handles cue settings appended to the end timestamp', () => {
    const vtt =
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000 align:start line:90%\n<v Bob>Hello there.</v>\n';
    const { cues } = parseCueFile(vtt, 'vtt');
    expect(cues).toHaveLength(1);
    expect(cues[0]?.endMs).toBe(4_000);
  });

  it('reads Zoom-style "Name: text" cue bodies', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nAmara Osei: Morning all.\n';
    const { cues } = parseCueFile(vtt, 'vtt', ['Amara Osei']);
    expect(cues[0]?.speaker).toBe('Amara Osei');
    expect(cues[0]?.text).toBe('Morning all.');
  });

  it('does not treat a label prefix as a speaker', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nNote: the room was changed.\n';
    const { cues } = parseCueFile(vtt, 'vtt');
    expect(cues[0]?.speaker).toBeNull();
    expect(cues[0]?.text).toBe('Note: the room was changed.');
  });

  it('reports malformed blocks as warnings rather than throwing', () => {
    const vtt = 'WEBVTT\n\nnot a cue at all\n\n00:00:01.000 --> 00:00:02.000\n<v A>Hi.</v>\n';
    const { cues, warnings } = parseCueFile(vtt, 'vtt');
    expect(cues).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/skipped/i);
  });

  it('does not merge same-speaker turns separated by a long gap', () => {
    const vtt =
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v A>First.</v>\n\n00:01:00.000 --> 00:01:01.000\n<v A>Second.</v>\n';
    const { cues } = parseCueFile(vtt, 'vtt');
    expect(cues).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Plain-text parsing                                                 */
/* ------------------------------------------------------------------ */

describe('parsePlainTranscript on a Teams Word export', () => {
  const raw = normaliseText(readFixture('teams-docx-style.txt').toString('utf8'));
  const { cues } = parsePlainTranscript(raw);
  const speakers = [...new Set(cues.map((c) => c.speaker).filter(Boolean))];

  it('finds exactly the three real speakers', () => {
    expect(speakers.sort()).toEqual(['Amara Osei', 'Daniel Verhoeven', 'Priya Raman']);
  });

  it('does not promote "Note:" to a speaker', () => {
    expect(speakers).not.toContain('Note');
  });

  it('attaches the clock from the speaker header line', () => {
    expect(cues[0]?.startMs).toBe(4_000);
  });

  it('keeps the header metadata out of the dialogue', () => {
    const joined = cues.map((c) => c.text).join(' ');
    expect(joined).not.toContain('Meeting Recording');
    expect(joined).not.toContain('34m 12s');
  });
});

describe('parsePlainTranscript speaker promotion rules', () => {
  it('requires a prefix to recur before accepting it', () => {
    const text = 'Risk: something might happen.\nAmara Osei: hello.\nAmara Osei: again.';
    const { cues } = parsePlainTranscript(text);
    const speakers = new Set(cues.map((c) => c.speaker));
    expect(speakers.has('Amara Osei')).toBe(true);
    expect(speakers.has('Risk')).toBe(false);
  });

  it('accepts a single-appearance prefix when it is on the roster', () => {
    const text = 'Zara Khan: I will own that.\nSomething else entirely on its own line.';
    const { cues } = parsePlainTranscript(text, ['Zara Khan']);
    expect(cues[0]?.speaker).toBe('Zara Khan');
  });

  it('handles a two-person meeting where each speaks once', () => {
    const text = 'Ana Diaz: shall we ship it?\nBen Cole: yes, ship it.';
    const { cues } = parsePlainTranscript(text);
    expect(cues.map((c) => c.speaker)).toEqual(['Ana Diaz', 'Ben Cole']);
  });

  it('parses bracketed Zoom style lines', () => {
    const text =
      '[00:01:10] Ana Diaz: shall we ship it?\n[00:01:20] Ben Cole: yes.\n[00:01:30] Ana Diaz: good.';
    const { cues } = parsePlainTranscript(text);
    expect(cues[0]?.speaker).toBe('Ana Diaz');
    expect(cues[0]?.startMs).toBe(70_000);
  });

  it('warns when nothing is attributable', () => {
    const text =
      'We talked about the budget for a while and then agreed to reconvene next week to finish.';
    const { cues, warnings } = parsePlainTranscript(text);
    expect(cues[0]?.speaker).toBeNull();
    expect(warnings.join(' ')).toMatch(/No speaker labels/i);
  });
});

/* ------------------------------------------------------------------ */
/* Stats                                                              */
/* ------------------------------------------------------------------ */

describe('computeStats', () => {
  const raw = normaliseText(readFixture('teams.vtt').toString('utf8'));
  const { cues } = parseCueFile(raw, 'vtt');
  const stats = computeStats(cues);

  it('measures duration from first start to last end', () => {
    expect(stats.hasTimings).toBe(true);
    expect(stats.durationMs).toBe(284_200 - 2_140);
  });

  it('shares sum to approximately 100%', () => {
    const total = stats.speakers.reduce((s, x) => s + x.sharePct, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it('ranks the chair as the highest share', () => {
    expect(stats.speakers[0]?.name).toBe('Sadeev Silva');
  });

  it('counts turns and words consistently', () => {
    const words = stats.speakers.reduce((s, x) => s + x.words, 0);
    expect(words).toBeLessThanOrEqual(stats.totalWords);
    expect(stats.totalCues).toBe(cues.length);
  });

  it('handles an empty cue list without dividing by zero', () => {
    const empty = computeStats([]);
    expect(empty.totalWords).toBe(0);
    expect(empty.durationMs).toBeNull();
    expect(empty.speakers).toEqual([]);
    expect(empty.hasTimings).toBe(false);
  });

  it('falls back to a median turn length when cues lack end times', () => {
    const untimedEnds = cues.map((c) => ({ ...c, endMs: null }));
    const s = computeStats(untimedEnds);
    expect(s.speakers[0]!.spokenMs).toBeGreaterThan(0);
  });
});

describe('toDialogue', () => {
  const raw = normaliseText(readFixture('teams.vtt').toString('utf8'));
  const { cues } = parseCueFile(raw, 'vtt');
  const dialogue = toDialogue(cues);

  it('prefixes every line with a speaker', () => {
    for (const line of dialogue.split('\n')) {
      expect(line).toMatch(/^(\[\d{1,2}:\d{2}(?::\d{2})?\] )?[^:]+: /);
    }
  });

  it('emits timestamps sparsely, not on every line', () => {
    const stamped = dialogue.split('\n').filter((l) => l.startsWith('[')).length;
    expect(stamped).toBeGreaterThan(0);
    expect(stamped).toBeLessThan(cues.length);
  });
});

/* ------------------------------------------------------------------ */
/* Chunking                                                           */
/* ------------------------------------------------------------------ */

describe('chunking', () => {
  const cues = Array.from({ length: 500 }, (_, i) => ({
    index: i,
    startMs: i * 5_000,
    endMs: i * 5_000 + 4_000,
    speaker: `Speaker ${i % 4}`,
    text: 'word '.repeat(120).trim(),
  }));

  it('only engages above the single-pass limit', () => {
    expect(needsChunking(1_000)).toBe(false);
    expect(needsChunking(500_000)).toBe(true);
  });

  it('splits on turn boundaries and overlaps for continuity', () => {
    const chunks = chunkCues(cues, 20_000, 4);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.cues.length).toBeGreaterThan(0);
    }
    const firstOfSecond = chunks[1]!.cues[0]!.index;
    const lastOfFirst = chunks[0]!.cues[chunks[0]!.cues.length - 1]!.index;
    expect(firstOfSecond).toBeLessThan(lastOfFirst);
  });

  it('covers every cue at least once', () => {
    const chunks = chunkCues(cues, 20_000, 4);
    const seen = new Set(chunks.flatMap((c) => c.cues.map((x) => x.index)));
    expect(seen.size).toBe(cues.length);
  });

  it('labels chunks for the prompt', () => {
    const chunks = chunkCues(cues, 20_000, 4);
    expect(chunks[0]?.label).toBe(`part 1 of ${chunks.length}`);
  });

  it('returns an empty array for no cues', () => {
    expect(chunkCues([])).toEqual([]);
  });

  it('clamps a pathological dialogue on a line boundary', () => {
    const huge = `${'a'.repeat(10)}\n`.repeat(400_000);
    const { text, truncated } = clampDialogue(huge);
    expect(truncated).toBe(true);
    expect(text.endsWith('\n')).toBe(false);
    expect(text.length).toBeLessThanOrEqual(3_400_000);
  });
});

/* ------------------------------------------------------------------ */
/* Full ingestion                                                     */
/* ------------------------------------------------------------------ */

describe('ingestTranscript', () => {
  it('ingests a Teams VTT end to end', async () => {
    const t = await ingestTranscript({
      fileName: 'teams.vtt',
      buffer: readFixture('teams.vtt'),
      maxBytes: MAX,
    });
    expect(t.format).toBe('vtt');
    expect(t.stats.speakers.length).toBeGreaterThanOrEqual(10);
    expect(t.stats.totalWords).toBeGreaterThan(400);
    expect(t.dialogue.length).toBeGreaterThan(1_000);
    expect(t.stats.approxTokens).toBeGreaterThan(100);
  });

  it('ingests a Word-style plain transcript', async () => {
    const t = await ingestTranscript({
      fileName: 'notes.txt',
      buffer: readFixture('teams-docx-style.txt'),
      maxBytes: MAX,
    });
    expect(t.stats.speakers.map((s) => s.name).sort()).toEqual([
      'Amara Osei',
      'Daniel Verhoeven',
      'Priya Raman',
    ]);
  });

  it('rejects an empty file', async () => {
    await expect(
      ingestTranscript({ fileName: 'a.txt', buffer: Buffer.alloc(0), maxBytes: MAX }),
    ).rejects.toMatchObject({ code: 'EMPTY' });
  });

  it('rejects an oversized file before parsing', async () => {
    await expect(
      ingestTranscript({
        fileName: 'a.txt',
        buffer: Buffer.from('x'.repeat(2_000)),
        maxBytes: 1_000,
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('rejects an unsupported extension', async () => {
    await expect(
      ingestTranscript({
        fileName: 'recording.mp4',
        buffer: Buffer.from('x'.repeat(200)),
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('rejects binary content disguised as text', async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03, 0x04, 0x00]);
    await expect(
      ingestTranscript({ fileName: 'a.txt', buffer: binary, maxBytes: MAX }),
    ).rejects.toMatchObject({ code: 'UNREADABLE' });
  });

  it('rejects a docx without a zip signature', async () => {
    await expect(
      ingestTranscript({
        fileName: 'a.docx',
        buffer: Buffer.from('this is not a docx'),
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: 'UNREADABLE' });
  });

  it('rejects a transcript that is too short to summarise', async () => {
    await expect(
      ingestTranscript({
        fileName: 'a.txt',
        buffer: Buffer.from('Amara: hello.\nBen: hi.'),
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: 'NO_DIALOGUE' });
  });

  it('throws a TranscriptError, never a bare Error', async () => {
    await expect(
      ingestTranscript({ fileName: 'a.zip', buffer: Buffer.from('PK'), maxBytes: MAX }),
    ).rejects.toBeInstanceOf(TranscriptError);
  });

  it('surfaces a warning when timings are absent', async () => {
    const lines = [
      'Ana Diaz: We reviewed the whole campaign plan today and agreed the budget was acceptable given the circumstances and the timeline pressure we are under this quarter.',
      'Ben Cole: Agreed, and I will circulate the revised numbers to the wider team before Friday so everyone has time to comment properly before we commit.',
      'Ana Diaz: One more thing, the landing page copy still needs a second pass because the headline does not match the paid social creative at all.',
      'Ben Cole: I will take that and have a revised version ready for review on Monday morning at the latest.',
    ];
    const t = await ingestTranscript({
      fileName: 'a.txt',
      buffer: Buffer.from(lines.join('\n')),
      maxBytes: MAX,
    });
    expect(t.stats.totalWords).toBeGreaterThanOrEqual(60);
    expect(t.stats.hasTimings).toBe(false);
    expect(t.warnings.join(' ')).toMatch(/no timestamps/i);
  });
});
