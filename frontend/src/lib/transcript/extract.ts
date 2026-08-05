import type { TranscriptFormat } from './types';

/**
 * Client-side file-picker constants only.
 *
 * The actual extraction (mammoth/unpdf, Buffer-based) is backend-only — it runs
 * inside the /api/briefs POST handler, never in the browser or during frontend
 * SSR. Keep this file's exports in sync with backend/src/lib/transcript/extract.ts.
 */

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
