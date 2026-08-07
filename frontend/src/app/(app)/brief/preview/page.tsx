import type { Metadata } from 'next';

import { BriefPreview } from '@/components/app/BriefPreview';
import { frontendEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Brief' };
export const dynamic = 'force-dynamic';

export default function BriefPreviewPage() {
  return <BriefPreview orgName={frontendEnv().ORG_NAME} />;
}
