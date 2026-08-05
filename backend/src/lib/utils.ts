import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** `24500` → `24,500` in en-GB. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value);
}

/** ISO timestamp → `27 Jul 2026, 14:32`. */
export function formatTimestamp(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Relative age, e.g. `3 days ago`. Falls back to an absolute date past 30 days. */
export function formatRelative(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatTimestamp(date);
}

/** Bytes → `2.4 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** USD → `$0.0024` / `$1.24`, or `—` when unpriced. */
export function formatCost(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return '—';
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Filesystem-safe slug for download file names. */
export function slugify(value: string, fallback = 'brief'): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return slug || fallback;
}

/** Join names with middot separators, the document's house style. */
export function joinNames(names: string[]): string {
  return names.filter(Boolean).join(' · ');
}

/**
 * Sanitise a value destined for an HTTP header (Content-Disposition filename).
 * Strips CR/LF and quotes so a crafted title cannot inject a header.
 */
export function headerSafe(value: string): string {
  return value.replace(/[\r\n"\\]/g, '').slice(0, 120);
}
