'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Shell } from '@/components/app/Shell';
import { frontendEnv } from '@/lib/env';
import { useSession } from '@/lib/session';

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session && !session.signedIn) router.replace('/login');
  }, [router, session]);

  // Render nothing until the backend confirms the session, so signed-out
  // visitors never see the app chrome flash before the redirect.
  if (!session?.signedIn) return null;

  return (
    <Shell orgName={frontendEnv().ORG_NAME} who={session.who ?? ''}>
      {children}
    </Shell>
  );
}
