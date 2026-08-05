import { redirect } from 'next/navigation';

import { Shell } from '@/components/app/Shell';
import { backendJson } from '@/lib/backend';
import { frontendEnv } from '@/lib/env';
import type { SessionInfo } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { signedIn, who } = await backendJson<SessionInfo>('/api/auth/session');
  if (!signedIn) redirect('/login');

  return (
    <Shell orgName={frontendEnv().ORG_NAME} who={who ?? ''}>
      {children}
    </Shell>
  );
}
