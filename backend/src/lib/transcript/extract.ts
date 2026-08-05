import { TranscriptError, type TranscriptFormat } from './types';
import { normaliseText } from './cues';

/**
 * Turn an uploaded file into normalised plain text.
 *
 * Every branch is defensive: a corrupt or password-protected file must surface a
 * readable error, never a stack trace and never a silently empty transcript.
 */

/**
 * Ceiling on extracted text, independent of the upload size limit.
 *
 * A .docx is a zip: 20 MB of archive can decompress to gigabytes of text, and a
 * PDF can carry a similar ratio. 25 million characters is far more than any real
 * meeting (a 12-hour recording is under 1 million) while bounding what the parser
 * and the grounding checks can be made to allocate.
 */
export const MAX_EXTRACTED_CHARS = 25_000_000;

export const ACCEPTED_EXTENSIONS = ['.vtt', '.srt', '.txt', '.md', '.docx', '.pdf', '.json'] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

export function extensionOf(fileName: string): string {
  const clean = fileName.trim().toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot);
}

export function formatFromName(fileName: string): TranscriptFormat {
  switch (extensionOf(fileName)) {
    case '.vtt':
      return 'vtt';
    case '.srt':
      return 'srt';
    case '.docx':
      return 'docx';
    case '.pdf':
      return 'pdf';
    case '.json':
      return 'json';
    default:
      return 'txt';
  }
}

/** Reject binary payloads masquerading as text before we hand them to a parser. */
function assertTextual(buffer: Buffer, fileName: string): void {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let control = 0;
  for (const byte of sample) {
    // Allow tab (9), LF (10), CR (13), FF (12) and everything printable.
    if (byte === 0) {
      throw new TranscriptError(
        'UNREADABLE',
        `"${fileName}" looks like a binary file, not a text transcript. Export the transcript as .vtt, .docx or .txt and try again.`,
      );
    }
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  if (sample.length > 0 && control / sample.length > 0.1) {
    throw new TranscriptError(
      'UNREADABLE',
      `"${fileName}" could not be read as text. Export the transcript as .vtt, .docx or .txt and try again.`,
    );
  }
}

/** DOCX and PDF have unambiguous magic bytes; verify before parsing. */
function assertMagic(buffer: Buffer, expected: 'zip' | 'pdf', fileName: string): void {
  if (expected === 'zip') {
    const ok = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (!ok) {
      throw new TranscriptError(
        'UNREADABLE',
        `"${fileName}" is not a valid .docx file. If it is an older .doc, open it in Word and re-save as .docx.`,
      );
    }
  } else {
    const head = buffer.subarray(0, 5).toString('latin1');
    if (!head.startsWith('%PDF')) {
      throw new TranscriptError(
        'UNREADABLE',
        `"${fileName}" is not a valid PDF.`,
      );
    }
  }
}

async function extractDocx(buffer: Buffer, fileName: string): Promise<string> {
  assertMagic(buffer, 'zip', fileName);
  const mammoth = await import('mammoth');
  try {
    // Raw text keeps the line structure Teams uses (name + clock, then speech).
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  } catch (cause) {
    throw new TranscriptError(
      'UNREADABLE',
      `Could not read the Word file "${fileName}". It may be corrupt or password protected. (${describe(cause)})`,
    );
  }
}

async function extractPdf(buffer: Buffer, fileName: string): Promise<string> {
  assertMagic(buffer, 'pdf', fileName);
  const { extractText, getDocumentProxy } = await import('unpdf');
  try {
    const proxy = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(proxy, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  } catch (cause) {
    throw new TranscriptError(
      'UNREADABLE',
      `Could not read text from the PDF "${fileName}". If it is a scan, run OCR first or upload the .vtt/.docx transcript instead. (${describe(cause)})`,
    );
  }
}

/**
 * Teams Graph transcripts and some third-party tools ship JSON. Pull out the
 * common shapes; fall back to the raw JSON text so nothing is lost.
 */
function extractJson(raw: string, fileName: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TranscriptError('UNREADABLE', `"${fileName}" is not valid JSON.`);
  }

  const lines: string[] = [];

  const readEntry = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object') return;
    const obj = entry as Record<string, unknown>;
    const speaker =
      pickString(obj, ['speaker', 'speakerName', 'displayName', 'name', 'author', 'user']) ??
      null;
    const text = pickString(obj, ['text', 'content', 'transcript', 'utterance', 'body', 'value']);
    if (text) lines.push(speaker ? `${speaker}: ${text}` : text);
  };

  const walk = (node: unknown, depth: number): void => {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        readEntry(item);
        walk(item, depth + 1);
      }
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value, depth + 1);
      }
    }
  };

  walk(parsed, 0);
  return lines.length > 0 ? lines.join('\n') : raw;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message.slice(0, 200);
  return String(cause).slice(0, 200);
}

export interface ExtractResult {
  text: string;
  format: TranscriptFormat;
}

/** Read any accepted transcript container into normalised text. */
export async function extractTranscriptText(
  fileName: string,
  buffer: Buffer,
  maxBytes: number,
): Promise<ExtractResult> {
  if (buffer.length === 0) {
    throw new TranscriptError('EMPTY', `"${fileName}" is empty.`);
  }
  if (buffer.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new TranscriptError(
      'TOO_LARGE',
      `"${fileName}" is larger than the ${mb} MB limit.`,
    );
  }

  const ext = extensionOf(fileName);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new TranscriptError(
      'UNSUPPORTED',
      `${ext || 'That file type'} is not supported. Upload a .vtt, .docx, .txt, .srt or .pdf transcript.`,
    );
  }

  const format = formatFromName(fileName);
  let text: string;

  if (format === 'docx') {
    text = await extractDocx(buffer, fileName);
  } else if (format === 'pdf') {
    text = await extractPdf(buffer, fileName);
  } else {
    assertTextual(buffer, fileName);
    const raw = buffer.toString('utf8');
    text = format === 'json' ? extractJson(raw, fileName) : raw;
  }

  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new TranscriptError(
      'TOO_LARGE',
      `"${fileName}" expands to ${Math.round(text.length / 1_000_000)} million characters of text, which is far larger than any real meeting transcript. Check you have uploaded the transcript and not another document.`,
    );
  }

  const normalised = normaliseText(text);
  if (normalised.trim().length === 0) {
    throw new TranscriptError(
      'EMPTY',
      `No text could be read from "${fileName}". If it is a scanned PDF, upload the .vtt or .docx transcript instead.`,
    );
  }

  return { text: normalised, format };
}
