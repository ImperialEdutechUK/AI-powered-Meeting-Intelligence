import { redirect } from 'next/navigation';
import { backendJson } from '@/lib/backend';
import type { SessionInfo } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

/** Route to the app when signed in, otherwise to the gate. */
export default async function RootPage() {
  const { signedIn } = await backendJson<SessionInfo>('/api/auth/session');
  redirect(signedIn ? '/new' : '/login');
}
