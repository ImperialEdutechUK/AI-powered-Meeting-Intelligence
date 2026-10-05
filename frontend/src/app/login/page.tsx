import type { Metadata } from 'next';
import Link from 'next/link';

import { frontendEnv } from '@/lib/env';
import { LoginForm } from '@/components/app/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  const orgName = frontendEnv().ORG_NAME;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      {/* Same visual language as the document hero. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(135deg, #0B0616 0%, #170E2B 34%, #341459 68%, #0F766E 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -right-32 -top-32 -z-10 size-[520px] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #14B8A688 0%, transparent 68%)' }}
      />

      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-teal-600">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
              <path
                d="M4.5 12.5l5 5 10-11"
                stroke="white"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">ActionBrief</h1>
          <p className="mt-1.5 text-sm text-white/60">
            {orgName} · meeting transcripts into action briefs
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-xs text-white/60">
          Not sure what this produces?{' '}
          <Link
            href="/example"
            className="font-semibold text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white"
          >
            See an example brief
          </Link>
        </p>
      </div>
    </main>
  );
}
