import type { Cue, TranscriptFormat } from './types';

/* ------------------------------------------------------------------------- */
/* Text hygiene                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Characters that masquerade as a plain space and silently break the speaker
 * regexes: NBSP, Ogham space, the en/em/thin/hair space block, narrow NBSP,
 * medium mathematical space and the ideographic space.
 */
const SPACE_LIKE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Zero-width space/joiners, word joiner, and a mid-document BOM. */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

/** Any run of 2+ spaces, including the exotic ones above once normalised. */
const MULTI_SPACE = /[ \u00A0]{2,}/g;

/** Strip BOM, normalise newlines and unify exotic whitespace. */
export function normaliseText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(SPACE_LIKE, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(/\t/g, '  ');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#34': '"',
};

/** Decode the small set of entities WebVTT and Teams exports actually emit. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    const direct = ENTITIES[name.toLowerCase()];
    if (direct !== undefined) return direct;
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return whole;
  });
}

/** Remove WebVTT/HTML inline markup but keep the words. */
export function stripTags(input: string): string {
  return input.replace(/<\/?[^<>]{0,200}>/g, '');
}

/** Collapse runs of spaces (including former NBSPs) and trim the ends. */
export function collapseSpaces(input: string): string {
  return input.replace(MULTI_SPACE, ' ').trim();
}

export function cleanUtterance(input: string): string {
  return collapseSpaces(decodeEntities(stripTags(input)).replace(/\n+/g, ' '));
}

export function countWords(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/* ------------------------------------------------------------------------- */
/* Timestamps                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Parse a cue timestamp.
 * Accepts `HH:MM:SS.mmm`, `HH:MM:SS,mmm`, `MM:SS.mmm`, `MM:SS` and `H:MM:SS`.
 * Returns milliseconds, or null when the shape is not a timestamp.
 */
export function parseTimestamp(raw: string): number | null {
  const s = raw.trim();
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s);
  if (!m) return null;

  const [, hh, mm, ss, frac] = m;
  const hours = hh === undefined ? 0 : Number(hh);
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  // A cue timestamp never has >59 minutes or seconds; reject junk that happens
  // to have colons in it so we do not silently mis-time a document.
  if (minutes > 59 || seconds > 59) return null;

  const ms = frac === undefined ? 0 : Number(frac.padEnd(3, '0'));
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + ms;
}

/** Milliseconds → `1h 04m` / `47m` / `38s`, for display. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** Milliseconds → `mm:ss` / `h:mm:ss`, for cue prefixes. */
export function formatClock(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/* ------------------------------------------------------------------------- */
/* Speaker names                                                            */
/* ------------------------------------------------------------------------- */

const SPEAKER_NOISE =
  /\s*\((?:guest|external|unverified|he\/him|she\/her|they\/them|[^)]{0,24}(?:guest|external))\)\s*$/i;

/**
 * Tidy a raw speaker label: drop Teams suffixes, trailing punctuation and
 * ALL-CAPS shouting, but never invent or reorder names.
 */
export function cleanSpeakerName(raw: string): string {
  let name = collapseSpaces(decodeEntities(stripTags(raw)));
  name = name.replace(SPEAKER_NOISE, '');
  name = name.replace(/^[-–—•>\s]+/, '').replace(/[:：,.\s]+$/, '');
  // Teams occasionally emits "Silva, Sadeev" from directory data.
  const swapped = /^([\p{L}'’-]+),\s+([\p{L}'’.\- ]{2,40})$/u.exec(name);
  if (swapped?.[1] && swapped[2]) name = `${swapped[2]} ${swapped[1]}`;
  // Fully upper-case names read as shouting in the document.
  if (name.length > 2 && name === name.toUpperCase() && /[A-Z]{3,}/.test(name)) {
    name = name
      .toLowerCase()
      .replace(/(^|[\s'’.-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return collapseSpaces(name);
}

/** Case/spacing-insensitive key for grouping the same person. */
export function speakerKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Could this string plausibly be a person's display name?
 * Deliberately conservative: this gate is what stops "Note", "Action" and
 * "Agenda item 3" from becoming speakers.
 */
export function looksLikeSpeaker(candidate: string): boolean {
  const s = candidate.trim();
  if (s.length < 2 || s.length > 60) return false;
  if (/[.!?]$/.test(s)) return false;
  if (/[<>{}[\]|@#$%^*_=+~`"]/.test(s)) return false;
  if (/\d{3,}/.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length > 5) return false;
  // Must contain letters, and start with a letter.
  if (!/^\p{L}/u.test(s)) return false;
  if (!/\p{L}{2}/u.test(s)) return false;
  // Reject obvious non-name labels.
  const lower = s.toLowerCase();
  const stop = new Set([
    'note',
    'notes',
    'action',
    'actions',
    'agenda',
    'summary',
    'decision',
    'decisions',
    'attendees',
    'present',
    'apologies',
    'date',
    'time',
    'topic',
    'subject',
    'meeting',
    'transcript',
    'recording',
    'webvtt',
    'title',
    'location',
    'chair',
    'minutes',
    'next steps',
    'follow up',
    'follow-up',
    'question',
    'answer',
    'q',
    'a',
    'speaker',
    'unknown',
    'todo',
    'to do',
    'aob',
  ]);
  if (stop.has(lower)) return false;
  return true;
}

/* ------------------------------------------------------------------------- */
/* WebVTT / SRT                                                             */
/* ------------------------------------------------------------------------- */

const ARROW = /-{2,}>|→/;

/** True when the text is a WebVTT or SRT cue list. */
export function detectCueFormat(text: string): 'vtt' | 'srt' | null {
  const head = text.slice(0, 4000);
  if (/^\s*WEBVTT/i.test(head)) return 'vtt';
  const hasArrowTiming = /^\s*(?:\d{1,3}:)?\d{1,2}:\d{1,2}[.,]\d{1,3}\s*(?:-{2,}>|→)/m.test(
    head,
  );
  if (!hasArrowTiming) return null;
  // SRT cues are preceded by a bare integer index line.
  return /^\s*\d+\s*$/m.test(head) && /,\d{3}\s*(?:-{2,}>)/.test(head) ? 'srt' : 'vtt';
}

interface RawBlock {
  startMs: number;
  endMs: number;
  lines: string[];
}

/** Split a VTT/SRT body into timed blocks, ignoring metadata sections. */
function readCueBlocks(text: string): { blocks: RawBlock[]; skipped: number } {
  const lines = text.split('\n');
  const blocks: RawBlock[] = [];
  let skipped = 0;
  let i = 0;

  // Skip the WEBVTT signature and any header metadata up to the first blank line.
  if (/^\s*WEBVTT/i.test(lines[0] ?? '')) {
    while (i < lines.length && (lines[i] ?? '').trim() !== '') i += 1;
  }

  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();

    if (line === '') {
      i += 1;
      continue;
    }

    // Block comments / styling — consume to the next blank line.
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) {
      while (i < lines.length && (lines[i] ?? '').trim() !== '') i += 1;
      continue;
    }

    // A timing line, possibly preceded by a cue identifier line.
    let timingLine = line;
    let timingIndex = i;
    if (!ARROW.test(line)) {
      const next = (lines[i + 1] ?? '').trim();
      if (ARROW.test(next)) {
        timingLine = next;
        timingIndex = i + 1;
      } else {
        // Not a cue at all — a stray line. Skip it.
        i += 1;
        skipped += 1;
        continue;
      }
    }

    const parts = timingLine.split(ARROW);
    const startMs = parseTimestamp((parts[0] ?? '').trim());
    // The end field may carry cue settings: "00:00:05.000 align:start line:90%".
    const endRaw = (parts[1] ?? '').trim().split(/\s+/)[0] ?? '';
    const endMs = parseTimestamp(endRaw);

    i = timingIndex + 1;
    const payload: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '') {
      payload.push(lines[i] ?? '');
      i += 1;
    }

    if (startMs === null) {
      skipped += 1;
      continue;
    }
    blocks.push({
      startMs,
      endMs: endMs === null ? startMs : endMs,
      lines: payload,
    });
  }

  return { blocks, skipped };
}

/**
 * Parse WebVTT/SRT into cues.
 *
 * Teams writes the speaker as `<v Display Name>text</v>`. Zoom and some Stream
 * exports instead prefix `Display Name: text`. Both are handled; consecutive
 * cues from the same speaker are merged so the model sees whole turns.
 */
export function parseCueFile(
  text: string,
  format: 'vtt' | 'srt',
  knownNames: string[] = [],
): { cues: Cue[]; warnings: string[] } {
  const warnings: string[] = [];
  const { blocks, skipped } = readCueBlocks(text);
  if (skipped > 0) {
    warnings.push(
      `${skipped} malformed cue ${skipped === 1 ? 'block was' : 'blocks were'} skipped in the ${format.toUpperCase()} file.`,
    );
  }

  const roster = new Set(knownNames.map(speakerKey).filter(Boolean));

  interface Turn {
    startMs: number;
    endMs: number;
    speaker: string | null;
    parts: string[];
  }
  const turns: Turn[] = [];

  for (const block of blocks) {
    const joined = block.lines.join('\n');
    let speaker: string | null = null;
    let body = joined;

    const voice = /<v(?:\.[^\s>]+)*\s+([^>]+)>/i.exec(joined);
    if (voice?.[1]) {
      speaker = cleanSpeakerName(voice[1]);
      body = joined.replace(/<v(?:\.[^\s>]+)*\s+[^>]+>/i, '');
    } else {
      const firstLine = (block.lines[0] ?? '').trim();
      const colon = /^([^:]{2,60}):\s*(.*)$/.exec(stripTags(firstLine));
      if (colon?.[1]) {
        const candidate = cleanSpeakerName(colon[1]);
        if (roster.has(speakerKey(candidate)) || looksLikeSpeaker(candidate)) {
          speaker = candidate;
          const rest = [colon[2] ?? '', ...block.lines.slice(1)].join('\n');
          body = rest;
        }
      }
    }

    const cleaned = cleanUtterance(body);
    if (!cleaned) continue;

    const previous = turns[turns.length - 1];
    if (
      previous &&
      previous.speaker !== null &&
      speaker !== null &&
      speakerKey(previous.speaker) === speakerKey(speaker) &&
      block.startMs - previous.endMs <= 15_000
    ) {
      previous.parts.push(cleaned);
      previous.endMs = Math.max(previous.endMs, block.endMs);
    } else {
      turns.push({
        startMs: block.startMs,
        endMs: block.endMs,
        speaker,
        parts: [cleaned],
      });
    }
  }

  const cues: Cue[] = turns.map((t, index) => ({
    index,
    startMs: t.startMs,
    endMs: t.endMs >= t.startMs ? t.endMs : t.startMs,
    speaker: t.speaker,
    text: collapseSpaces(t.parts.join(' ')),
  }));

  return { cues, warnings };
}

/* ------------------------------------------------------------------------- */
/* Plain text / DOCX / PDF                                                  */
/* ------------------------------------------------------------------------- */

/**
 * `Name   0:42` — the header line Teams writes when you download a transcript
 * as a Word document. Two-or-more spaces (or a tab, already widened) separate
 * the name from the clock.
 */
const DOCX_HEADER =
  /^([\p{L}][\p{L}'’.\- ]{1,58}?)\s{2,}((?:\d{1,3}:)?\d{1,2}:\d{2})\s*$/u;

/** `0:42  Name` — the reverse order used by some exporters. */
const CLOCK_FIRST =
  /^\[?((?:\d{1,3}:)?\d{1,2}:\d{2})\]?\s{1,}(?:-\s*)?([\p{L}][\p{L}'’.\- ]{1,58}?)\s*:?\s*$/u;

/** `Name: text` on one line. */
const INLINE_SPEAKER = /^([^:]{2,60}):\s*(\S.*)$/;

/** `[00:12:33] Name: text` — Stream/Zoom style. */
const BRACKET_INLINE =
  /^\[?((?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*[-–]?\s*([^:]{2,60}):\s*(\S.*)$/;

/**
 * Lines every transcript exporter writes above the first utterance: the
 * generated file name, the meeting date/time, and the recording length.
 *
 * These are only ever tested against lines that appear *before* the first
 * detected speaker, so a sentence mid-meeting that happens to contain a date is
 * never discarded.
 */
const PREAMBLE_PATTERNS: RegExp[] = [
  /meeting recording/i,
  /^transcri(?:pt|bed)\b/i,
  /^recording\b/i,
  /^(?:started|ended|start time|end time|duration|organiser|organizer|meeting id|conference id)\b/i,
  // "July 27, 2026, 9:01AM" / "27 July 2026 09:01"
  /^\d{1,2}\s+\p{L}{3,}\s+\d{4}\b/u,
  /^\p{L}{3,}\s+\d{1,2},\s*\d{4}\b/u,
  /\d{1,2}:\d{2}\s*(?:am|pm)\b/i,
  // "34m 12s" / "1h 04m 22s" / "00:34:12"
  /^(?:\d{1,3}h\s*)?(?:\d{1,3}m\s*)?(?:\d{1,3}s)$/i,
  /^(?:\d{1,3}:)?\d{1,2}:\d{2}$/,
  // A generated file name: no spaces, contains digits and a separator.
  /^[\p{L}\d]+[-_][\p{L}\d\-_.]*\d[\p{L}\d\-_.]*$/u,
];

function looksLikePreamble(line: string): boolean {
  return PREAMBLE_PATTERNS.some((re) => re.test(line));
}

/**
 * Segment free text into speaker turns.
 *
 * Two passes: the first collects candidate `Name:` prefixes and counts them, the
 * second only promotes a prefix to a speaker if it recurs or matches the roster
 * the user supplied. That is what keeps "Action:" and "Decision:" out of the
 * speaker list.
 */
export function parsePlainTranscript(
  text: string,
  knownNames: string[] = [],
): { cues: Cue[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text.split('\n');
  const roster = new Set(knownNames.map(speakerKey).filter(Boolean));

  // ---- Pass 1: count inline "Prefix:" candidates ------------------------
  const counts = new Map<string, number>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bracket = BRACKET_INLINE.exec(line);
    const inline = bracket ? null : INLINE_SPEAKER.exec(line);
    const candidateRaw = bracket?.[2] ?? inline?.[1];
    if (!candidateRaw) continue;
    const candidate = cleanSpeakerName(candidateRaw);
    if (!looksLikeSpeaker(candidate)) continue;
    const key = speakerKey(candidate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const accepted = new Set<string>();
  for (const [key, n] of counts) {
    if (n >= 2 || roster.has(key)) accepted.add(key);
  }
  // A one-to-one meeting can legitimately have a speaker who talks once. If we
  // found exactly two candidates and each appears once, trust them.
  if (accepted.size === 0 && counts.size > 0 && counts.size <= 2) {
    for (const key of counts.keys()) accepted.add(key);
  }

  // ---- Pass 2: build turns ---------------------------------------------
  interface Turn {
    startMs: number | null;
    speaker: string | null;
    parts: string[];
  }
  const turns: Turn[] = [];

  /** Flips to true on the first attributed turn; gates preamble filtering. */
  let sawSpeaker = false;
  let droppedPreambleWords = 0;

  const openTurn = (speaker: string | null, startMs: number | null, first?: string): void => {
    if (speaker !== null) sawSpeaker = true;
    turns.push({ startMs, speaker, parts: first ? [first] : [] });
  };

  /** Append to the turn currently being built, opening an anonymous one if needed. */
  const appendLine = (body: string): void => {
    const last = turns[turns.length - 1];
    if (last) last.parts.push(body);
    else openTurn(null, null, body);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Ignore export boilerplate anywhere in the file.
    if (/^(WEBVTT|Meeting transcript|Recording started|Recording stopped)\b/i.test(line)) {
      continue;
    }
    // Bare page numbers from PDF exports.
    if (/^\d{1,3}$/.test(line) && line.length <= 3) continue;

    // Header block above the first utterance: file name, date, duration.
    if (!sawSpeaker && looksLikePreamble(line)) {
      droppedPreambleWords += countWords(line);
      continue;
    }

    const header = DOCX_HEADER.exec(line);
    if (header?.[1] && header[2]) {
      const name = cleanSpeakerName(header[1]);
      if (looksLikeSpeaker(name) || roster.has(speakerKey(name))) {
        openTurn(name, parseTimestamp(header[2]));
        continue;
      }
    }

    const clockFirst = CLOCK_FIRST.exec(line);
    if (clockFirst?.[1] && clockFirst[2]) {
      const name = cleanSpeakerName(clockFirst[2]);
      if (looksLikeSpeaker(name) || roster.has(speakerKey(name))) {
        openTurn(name, parseTimestamp(clockFirst[1]));
        continue;
      }
    }

    const bracket = BRACKET_INLINE.exec(line);
    if (bracket?.[2] && bracket[3]) {
      const name = cleanSpeakerName(bracket[2]);
      if (accepted.has(speakerKey(name))) {
        openTurn(name, parseTimestamp(bracket[1] ?? ''), cleanUtterance(bracket[3]));
        continue;
      }
    }

    const inline = INLINE_SPEAKER.exec(line);
    if (inline?.[1] && inline[2]) {
      const name = cleanSpeakerName(inline[1]);
      if (accepted.has(speakerKey(name))) {
        openTurn(name, null, cleanUtterance(inline[2]));
        continue;
      }
    }

    const cleaned = cleanUtterance(line);
    if (!cleaned) continue;
    appendLine(cleaned);
  }

  /*
   * Backstop for header blocks the pattern list did not recognise: when the file
   * clearly has speaker labels, a short unattributed block sitting above the
   * first one is metadata, not dialogue. Anything substantial is kept, and the
   * user is told when we drop something non-trivial.
   */
  const PREAMBLE_WORD_CEILING = 30;
  if (sawSpeaker) {
    const first = turns[0];
    if (first && first.speaker === null) {
      const body = collapseSpaces(first.parts.join(' '));
      const words = countWords(body);
      if (words <= PREAMBLE_WORD_CEILING) {
        turns.shift();
        droppedPreambleWords += words;
      }
    }
  }
  if (droppedPreambleWords > PREAMBLE_WORD_CEILING) {
    warnings.push(
      `${droppedPreambleWords} words of export header text above the first utterance were treated as metadata and excluded.`,
    );
  }

  const cues: Cue[] = [];
  for (const turn of turns) {
    const body = collapseSpaces(turn.parts.join(' '));
    if (!body) continue;
    cues.push({
      index: cues.length,
      startMs: turn.startMs,
      endMs: null,
      speaker: turn.speaker,
      text: body,
    });
  }

  if (cues.length > 0 && cues.every((c) => c.speaker === null)) {
    warnings.push(
      'No speaker labels were detected, so talk-time and per-person attribution are unavailable. Add the attendee list in the form to improve owner detection.',
    );
  }

  return { cues, warnings };
}

/** Route normalised text to the right cue parser. */
export function textToCues(
  text: string,
  format: TranscriptFormat,
  knownNames: string[] = [],
): { cues: Cue[]; warnings: string[]; format: TranscriptFormat } {
  const cueFormat = detectCueFormat(text);
  if (cueFormat) {
    const parsed = parseCueFile(text, cueFormat, knownNames);
    return { ...parsed, format: cueFormat };
  }
  const parsed = parsePlainTranscript(text, knownNames);
  return { ...parsed, format };
}
