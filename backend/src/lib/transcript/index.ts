import { textToCues } from './cues';
import { extractTranscriptText } from './extract';
import { computeStats, toDialogue } from './stats';
import { TranscriptError, type Transcript } from './types';

export * from './types';
export {
  ACCEPTED_EXTENSIONS,
  ACCEPT_ATTRIBUTE,
  extensionOf,
  formatFromName,
  extractTranscriptText,
} from './extract';
export {
  normaliseText,
  cleanSpeakerName,
  speakerKey,
  looksLikeSpeaker,
  parseTimestamp,
  formatDuration,
  formatClock,
  countWords,
  detectCueFormat,
  parseCueFile,
  parsePlainTranscript,
  textToCues,
} from './cues';
export { computeStats, toDialogue, sharePctLabel } from './stats';
export {
  chunkCues,
  needsChunking,
  clampDialogue,
  dialogueWordCount,
  SINGLE_PASS_TOKEN_LIMIT,
  CHUNK_TARGET_TOKENS,
} from './chunk';

/** Minimum words before a transcript is considered usable. */
export const MIN_TRANSCRIPT_WORDS = 60;

/**
 * Full ingestion: bytes in, structured transcript out.
 *
 * `knownNames` should carry any attendee names the user typed on the upload
 * form. They materially improve speaker detection in plain-text exports and
 * cost nothing when absent.
 */
export async function ingestTranscript(options: {
  fileName: string;
  buffer: Buffer;
  maxBytes: number;
  knownNames?: string[];
}): Promise<Transcript> {
  const { fileName, buffer, maxBytes, knownNames = [] } = options;

  const { text, format: containerFormat } = await extractTranscriptText(
    fileName,
    buffer,
    maxBytes,
  );

  const { cues, warnings, format } = textToCues(text, containerFormat, knownNames);

  if (cues.length === 0) {
    throw new TranscriptError(
      'NO_DIALOGUE',
      `No dialogue could be found in "${fileName}". Check that this is a meeting transcript and not the meeting invitation or chat log.`,
    );
  }

  const stats = computeStats(cues);

  if (stats.totalWords < MIN_TRANSCRIPT_WORDS) {
    throw new TranscriptError(
      'NO_DIALOGUE',
      `"${fileName}" contains only ${stats.totalWords} words of dialogue — too short to build a brief from. A usable transcript needs at least ${MIN_TRANSCRIPT_WORDS}.`,
    );
  }

  const allWarnings = [...warnings];
  if (stats.unattributedCues > 0 && stats.speakers.length > 0) {
    const pct = Math.round((stats.unattributedCues / stats.totalCues) * 100);
    if (pct >= 15) {
      allWarnings.push(
        `${pct}% of utterances have no speaker label, so talk-time shares are approximate.`,
      );
    }
  }
  if (!stats.hasTimings) {
    allWarnings.push(
      'This transcript has no timestamps, so meeting duration cannot be measured.',
    );
  }

  return {
    format,
    sourceName: fileName,
    cues,
    stats,
    dialogue: toDialogue(cues),
    warnings: allWarnings,
  };
}
