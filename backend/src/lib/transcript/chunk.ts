import { countWords } from './cues';
import type { Cue } from './types';
import { toDialogue } from './stats';

/**
 * Chunking for oversized transcripts.
 *
 * GPT-5.6 Luna carries a 1,050,000-token context, so in practice a single meeting
 * always fits in one request. Chunking exists for two reasons:
 *   1. A day-long recording or a merged multi-meeting file can still exceed it.
 *   2. Sending 400k tokens costs ~40x more than sending 10k, and the map-reduce
 *      path is measurably cheaper on very long inputs.
 *
 * Splits fall on speaker turn boundaries, never mid-utterance, and carry a small
 * overlap so a decision spanning the seam is not lost.
 */

/** Above this estimated token count we map-reduce instead of one-shotting. */
export const SINGLE_PASS_TOKEN_LIMIT = 180_000;

/** Target tokens per chunk when map-reducing. */
export const CHUNK_TARGET_TOKENS = 60_000;

/** Turns of overlap between adjacent chunks. */
export const CHUNK_OVERLAP_TURNS = 6;

export interface Chunk {
  index: number;
  /** 1-based for prompt readability. */
  label: string;
  cues: Cue[];
  dialogue: string;
  approxTokens: number;
}

function estimateTokens(cue: Cue): number {
  return Math.ceil((cue.text.length + (cue.speaker?.length ?? 8) + 8) / 3.6);
}

export function needsChunking(approxTokens: number): boolean {
  return approxTokens > SINGLE_PASS_TOKEN_LIMIT;
}

/**
 * Split cues into overlapping chunks of roughly `targetTokens` each.
 * A single cue larger than the target still gets its own chunk rather than being
 * cut in half.
 */
export function chunkCues(
  cues: Cue[],
  targetTokens: number = CHUNK_TARGET_TOKENS,
  overlapTurns: number = CHUNK_OVERLAP_TURNS,
): Chunk[] {
  if (cues.length === 0) return [];

  const target = Math.max(4_000, targetTokens);
  const groups: Cue[][] = [];
  let currentGroup: Cue[] = [];
  let currentTokens = 0;

  for (const cue of cues) {
    const cost = estimateTokens(cue);
    if (currentGroup.length > 0 && currentTokens + cost > target) {
      groups.push(currentGroup);
      // Seed the next group with the tail of this one for continuity.
      const overlap = overlapTurns > 0 ? currentGroup.slice(-overlapTurns) : [];
      currentGroup = [...overlap];
      currentTokens = overlap.reduce((sum, c) => sum + estimateTokens(c), 0);
    }
    currentGroup.push(cue);
    currentTokens += cost;
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  const total = groups.length;
  return groups.map((group, index) => ({
    index,
    label: `part ${index + 1} of ${total}`,
    cues: group,
    dialogue: toDialogue(group),
    approxTokens: group.reduce((sum, c) => sum + estimateTokens(c), 0),
  }));
}

/**
 * Hard ceiling applied to any single dialogue string before it is sent. Prevents
 * a pathological file from producing a request the API will reject outright.
 */
export const MAX_DIALOGUE_CHARS = 3_400_000;

export function clampDialogue(dialogue: string): { text: string; truncated: boolean } {
  if (dialogue.length <= MAX_DIALOGUE_CHARS) {
    return { text: dialogue, truncated: false };
  }
  // Cut on a line boundary so we never send half an utterance.
  const slice = dialogue.slice(0, MAX_DIALOGUE_CHARS);
  const lastNewline = slice.lastIndexOf('\n');
  return {
    text: lastNewline > 0 ? slice.slice(0, lastNewline) : slice,
    truncated: true,
  };
}

/** Rough word count of a dialogue string, for the UI preflight panel. */
export function dialogueWordCount(dialogue: string): number {
  return countWords(dialogue);
}
