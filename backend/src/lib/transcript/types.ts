/** Recognised transcript container formats. */
export type TranscriptFormat = 'vtt' | 'srt' | 'docx' | 'pdf' | 'txt' | 'json';

/** A single utterance. */
export interface Cue {
  /** Zero-based position in the transcript. */
  index: number;
  /** Milliseconds from the start of the recording, when the format carries it. */
  startMs: number | null;
  endMs: number | null;
  /** Normalised speaker display name, or null when unattributed. */
  speaker: string | null;
  /** Utterance text, tags stripped and entities decoded. */
  text: string;
}

export interface SpeakerStat {
  name: string;
  /** Number of separate utterances. */
  turns: number;
  words: number;
  /** Summed cue durations in ms. Zero when the format has no timestamps. */
  spokenMs: number;
  /** Share of total words, 0–100, rounded to one decimal. */
  sharePct: number;
}

export interface TranscriptStats {
  /** True when at least one cue carried a usable timestamp. */
  hasTimings: boolean;
  /** Wall-clock span of the transcript in ms, or null without timings. */
  durationMs: number | null;
  totalWords: number;
  totalCues: number;
  speakers: SpeakerStat[];
  /** Utterances with no attributable speaker. */
  unattributedCues: number;
  /** Approximate token count of the flattened dialogue (chars / 3.6). */
  approxTokens: number;
}

export interface Transcript {
  format: TranscriptFormat;
  /** Original file name as uploaded. */
  sourceName: string;
  cues: Cue[];
  stats: TranscriptStats;
  /**
   * Speaker-prefixed dialogue, one line per cue, used as the model input.
   * Timestamps are included only at the head of each speaker change.
   */
  dialogue: string;
  /** Non-fatal problems worth surfacing to the user. */
  warnings: string[];
}

export class TranscriptError extends Error {
  readonly code:
    | 'EMPTY'
    | 'UNSUPPORTED'
    | 'TOO_LARGE'
    | 'UNREADABLE'
    | 'NO_DIALOGUE';
  constructor(code: TranscriptError['code'], message: string) {
    super(message);
    this.name = 'TranscriptError';
    this.code = code;
  }
}
