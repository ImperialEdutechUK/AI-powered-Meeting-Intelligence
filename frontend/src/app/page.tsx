'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '@/lib/session';

/** Route to the app when signed in, otherwise to the gate. */
export default function RootPage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session) router.replace(session.signedIn ? '/new' : '/login');
  }, [router, session]);

  return null;
}
