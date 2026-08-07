import { BriefBundleSchema, type BriefBundle } from './brief-bundle';

/**
 * Hand-off for a just-generated brief between the generate screen and the
 * preview screen.
 *
 * Briefs are never persisted server-side, so there is no id to route to and
 * fetch by. The full bundle travels in `sessionStorage` instead — scoped to
 * the tab, gone when it closes, never sent anywhere.
 */

const KEY = 'actionbrief:pending';

export function storePendingBrief(bundle: BriefBundle): void {
  sessionStorage.setItem(KEY, JSON.stringify(bundle));
}

export function readPendingBrief(): BriefBundle | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = BriefBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearPendingBrief(): void {
  sessionStorage.removeItem(KEY);
}
