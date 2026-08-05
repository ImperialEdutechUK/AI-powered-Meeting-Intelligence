'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileDown, FileText, Printer, Trash2 } from 'lucide-react';

import { Button, Notice } from '@/components/ui';

/**
 * Export and delete controls.
 *
 * Downloads go through `fetch` rather than a bare link so a server-side failure
 * surfaces as a readable message instead of the browser saving an HTML error page
 * with a .pdf extension.
 */
export function ExportBar({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'pdf' | 'docx' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: 'pdf' | 'docx') {
    if (busy) return;
    setBusy(kind);
    setError(null);

    try {
      const response = await fetch(`/api/briefs/${id}/${kind}`);

      if (!response.ok) {
        let message = `The ${kind.toUpperCase()} could not be generated.`;
        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          if (payload.error?.message) message = payload.error.message;
        } catch {
          // Non-JSON error body; keep the generic message.
        }
        setError(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFrom(response.headers.get('content-disposition'), kind, title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke on the next tick so Safari has committed the download.
      setTimeout(() => URL.revokeObjectURL(url), 4_000);
    } catch {
      setError('The download failed. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;

    setBusy('delete');
    setError(null);
    try {
      const response = await fetch(`/api/briefs/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('That brief could not be deleted.');
        setBusy(null);
        return;
      }
      router.replace('/library');
      router.refresh();
    } catch {
      setError('The delete request failed. Try again.');
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => download('pdf')} busy={busy === 'pdf'} disabled={busy !== null}>
          <FileDown className="size-[18px]" aria-hidden />
          Download PDF
        </Button>

        <Button
          variant="secondary"
          onClick={() => download('docx')}
          busy={busy === 'docx'}
          disabled={busy !== null}
        >
          <FileText className="size-[18px]" aria-hidden />
          Download Word
        </Button>

        <Button
          variant="secondary"
          onClick={() => window.print()}
          disabled={busy !== null}
          title="Print this page"
        >
          <Printer className="size-[18px]" aria-hidden />
          Print
        </Button>

        <Button
          variant="danger"
          onClick={remove}
          busy={busy === 'delete'}
          disabled={busy !== null}
          className="ml-auto"
        >
          <Trash2 className="size-[18px]" aria-hidden />
          Delete
        </Button>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

/** Prefer the server's filename; fall back to a slug of the title. */
function filenameFrom(
  disposition: string | null,
  kind: string,
  title: string,
): string {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  if (match?.[1]) return match[1];
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'brief';
  return `${slug}.${kind}`;
}
