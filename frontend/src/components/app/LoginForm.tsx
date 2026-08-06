'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button, Field, Notice, TextInput } from '@/components/ui';

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
        <TextInput
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="••••••••"
        />
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
          placeholder="e.g. John Smith"
        />
      </Field>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button type="submit" size="lg" busy={busy} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
