'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button, Field, Notice, TextInput } from '@/components/ui';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    // Eye-open
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-4.5">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ) : (
    // Eye-off
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-4.5">
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.48 18.48 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Resolve the post-login destination against an allowlist of real app routes.
 *
 * A prefix check is not enough on its own: `//evil.test` and `/\evil.test` both
 * begin with a slash yet resolve to an external origin in browsers. Matching the
 * handful of paths that actually exist removes the question entirely.
 */
const NEXT_ALLOWLIST: RegExp[] = [
  /^\/new$/,
  /^\/library$/,
  /^\/example$/,
  /^\/brief\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
];

function safeNext(candidate: string): string {
  return NEXT_ALLOWLIST.some((pattern) => pattern.test(candidate)) ? candidate : '/new';
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, name }),
      });
      const payload = (await response.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };

      if (!response.ok || !payload.ok) {
        setError(
          'error' in payload ? payload.error.message : 'Sign-in failed. Try again.',
        );
        setBusy(false);
        return;
      }

      // Full navigation so server components pick up the new cookie.
      router.replace(safeNext(next));
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Access code"
        htmlFor="passcode"
        hint="The shared code your team was given."
      >
        <div className="relative">
          <TextInput
            id="passcode"
            name="passcode"
            type={showPasscode ? 'text' : 'password'}
            autoComplete="current-password"
            required
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPasscode((v) => !v)}
            aria-label={showPasscode ? 'Hide access code' : 'Show access code'}
            className="absolute inset-y-0 right-0 flex items-center px-3.5 text-ink-400 hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          >
            <EyeIcon open={showPasscode} />
          </button>
        </div>
      </Field>

      <Field
        label="Your name"
        htmlFor="name"
        optional
        hint="Recorded against the briefs you generate, so colleagues know who to ask."
      >
        <TextInput
          id="name"
          name="name"
          autoComplete="name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Smith"
        />
      </Field>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button type="submit" size="lg" busy={busy} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
