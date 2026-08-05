'use client';

import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import { FileText, Trash2, UploadCloud } from 'lucide-react';

import { ACCEPTED_EXTENSIONS, extensionOf } from '@/lib/transcript/extract';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui';

const ACCEPT = ACCEPTED_EXTENSIONS.join(',');

/**
 * Transcript picker.
 *
 * Validates extension and size in the browser so the obvious mistakes are caught
 * before a multi-megabyte upload starts. The server revalidates regardless — this
 * is a courtesy, not a control.
 */
export function Dropzone({
  file,
  onChange,
  maxMb,
  disabled = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  maxMb: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const accept = useCallback(
    (candidate: File | undefined) => {
      setError(null);
      if (!candidate) return;

      const ext = extensionOf(candidate.name);
      if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
        setError(
          `${ext || 'That file type'} is not supported. Use ${ACCEPTED_EXTENSIONS.join(', ')}.`,
        );
        return;
      }
      if (candidate.size === 0) {
        setError('That file is empty.');
        return;
      }
      if (candidate.size > maxMb * 1024 * 1024) {
        setError(
          `That file is ${formatBytes(candidate.size)}. The limit is ${maxMb} MB.`,
        );
        return;
      }
      onChange(candidate);
    },
    [maxMb, onChange],
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(event.dataTransfer.files?.[0]);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-teal-900">{file.name}</p>
          <p className="mt-0.5 text-xs text-teal-800/70">
            {formatBytes(file.size)} · ready to generate
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
        >
          <Trash2 className="size-4" aria-hidden />
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging
            ? 'border-teal-500 bg-teal-50'
            : 'border-ink-200 bg-white hover:border-ink-300',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
          <UploadCloud className="size-6" aria-hidden />
        </span>

        <p className="mt-4 text-[15px] font-bold text-ink-900">
          Drop your meeting transcript here
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-400">
          In Teams, open the meeting, go to <strong className="font-semibold text-ink-600">Recap</strong>{' '}
          → <strong className="font-semibold text-ink-600">Transcript</strong> → Download as{' '}
          <strong className="font-semibold text-ink-600">.docx</strong> or{' '}
          <strong className="font-semibold text-ink-600">.vtt</strong>.
        </p>

        <div className="mt-5">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            Choose a file
          </Button>
        </div>

        <p className="mt-4 text-[11.5px] text-ink-400">
          {ACCEPTED_EXTENSIONS.join(' · ')} — up to {maxMb} MB
        </p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-[12.5px] font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
