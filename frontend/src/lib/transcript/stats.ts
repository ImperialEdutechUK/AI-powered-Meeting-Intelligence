import { countWords, formatClock, speakerKey } from './cues';
import type { Cue, SpeakerStat, TranscriptStats } from './types';

/**
 * Deterministic transcript metrics.
 *
 * Nothing in here is produced by the language model. Talk-time, turn counts and
 * duration are arithmetic on the parsed cues, which is why they can be presented
 * in the document as measured facts rather than AI output.
 */

/** Median gap between consecutive cue starts, used to estimate turn length. */
function medianGapMs(cues: Cue[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < cues.length; i += 1) {
    const previous = cues[i - 1];
    const current = cues[i];
    if (!previous || !current) continue;
    if (previous.startMs === null || current.startMs === null) continue;
    const gap = current.startMs - previous.startMs;
    if (gap > 0 && gap < 120_000) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  if (gaps.length % 2 === 1) return gaps[mid] ?? 0;
  return Math.round(((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2);
}

export function computeStats(cues: Cue[]): TranscriptStats {
  const timed = cues.filter((c) => c.startMs !== null);
  const hasTimings = timed.length > 0;

  let durationMs: number | null = null;
  if (hasTimings) {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const cue of timed) {
      if (cue.startMs !== null) min = Math.min(min, cue.startMs);
      const end = cue.endMs ?? cue.startMs;
      if (end !== null) max = Math.max(max, end);
    }
    durationMs = Number.isFinite(min) && max > min ? max - min : null;
  }

  const fallbackTurn = medianGapMs(cues);

  interface Bucket {
    name: string;
    turns: number;
    words: number;
    spokenMs: number;
  }
  const buckets = new Map<string, Bucket>();
  let totalWords = 0;
  let unattributedCues = 0;

  for (const cue of cues) {
    const words = countWords(cue.text);
    totalWords += words;

    if (cue.speaker === null || cue.speaker.trim() === '') {
      unattributedCues += 1;
      continue;
    }

    const key = speakerKey(cue.speaker);
    if (!key) {
      unattributedCues += 1;
      continue;
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { name: cue.speaker, turns: 0, words: 0, spokenMs: 0 };
      buckets.set(key, bucket);
    }
    bucket.turns += 1;
    bucket.words += words;

    if (cue.startMs !== null && cue.endMs !== null && cue.endMs > cue.startMs) {
      bucket.spokenMs += cue.endMs - cue.startMs;
    } else if (cue.startMs !== null && fallbackTurn > 0) {
      bucket.spokenMs += fallbackTurn;
    }
  }

  const attributedWords = [...buckets.values()].reduce((sum, b) => sum + b.words, 0);

  const speakers: SpeakerStat[] = [...buckets.values()]
    .map((b) => ({
      name: b.name,
      turns: b.turns,
      words: b.words,
      spokenMs: b.spokenMs,
      sharePct:
        attributedWords > 0 ? Math.round((b.words / attributedWords) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.words - a.words || a.name.localeCompare(b.name));

  const charCount = cues.reduce((sum, c) => sum + c.text.length + 24, 0);

  return {
    hasTimings,
    durationMs,
    totalWords,
    totalCues: cues.length,
    speakers,
    unattributedCues,
    // Empirical ratio for English dialogue on a byte-pair tokeniser.
    approxTokens: Math.ceil(charCount / 3.6),
  };
}

/**
 * Flatten cues into the dialogue string handed to the model.
 * A clock prefix is emitted at most every 60 s so the model can quote timings
 * without the timestamps swamping the token budget.
 */
export function toDialogue(cues: Cue[]): string {
  const out: string[] = [];
  let lastStamp = -Infinity;

  for (const cue of cues) {
    const speaker = cue.speaker ?? 'Unattributed';
    let prefix = '';
    if (cue.startMs !== null && cue.startMs - lastStamp >= 60_000) {
      prefix = `[${formatClock(cue.startMs)}] `;
      lastStamp = cue.startMs;
    }
    out.push(`${prefix}${speaker}: ${cue.text}`);
  }

  return out.join('\n');
}

/** Human-readable share label, e.g. "24.5%". */
export function sharePctLabel(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '0%';
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}
