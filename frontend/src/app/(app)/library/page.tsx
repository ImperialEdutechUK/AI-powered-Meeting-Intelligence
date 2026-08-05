import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, FileUp, LibraryBig, Search } from 'lucide-react';

import { Card, EmptyState, Kicker, Notice, Pill, TextInput } from '@/components/ui';
import { DEPARTMENT_LIST, getDepartment, isDepartmentId } from '@/lib/departments';
import { HUES } from '@/lib/theme';
import { backendJson } from '@/lib/backend';
import type { BriefList, BriefStats } from '@/lib/api-types';
import { cn, formatCost, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Library' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const department =
    params.department && isDepartmentId(params.department) ? params.department : 'all';
  const search = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  let data: BriefList;
  let stats: BriefStats;
  try {
    const query = new URLSearchParams();
    if (department !== 'all') query.set('department', department);
    if (search) query.set('q', search);
    query.set('limit', String(PAGE_SIZE));
    query.set('offset', String((page - 1) * PAGE_SIZE));

    [data, stats] = await Promise.all([
      backendJson<BriefList>(`/api/briefs?${query.toString()}`),
      backendJson<BriefStats>('/api/briefs/stats'),
    ]);
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Notice tone="error" title="The library is unavailable">
          The backend could not be reached. Check <code>BACKEND_URL</code> and that the
          backend service is running, then reload.
        </Notice>
      </div>
    );
  }

  const countFor = (id: string) => stats.byDepartment.find((c) => c.department === id)?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const queryFor = (next: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { department, q: search, page, ...next };
    if (merged.department && merged.department !== 'all') {
      sp.set('department', String(merged.department));
    }
    if (merged.q) sp.set('q', String(merged.q));
    if (merged.page && Number(merged.page) > 1) sp.set('page', String(merged.page));
    const qs = sp.toString();
    return qs ? `/library?${qs}` : '/library';
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-9">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>Library</Kicker>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">
            Every brief the company has generated
          </h1>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="tnum text-xl font-bold text-ink-900">{stats.totals.briefs}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-400">Total</p>
          </div>
          <div>
            <p className="tnum text-xl font-bold text-ink-900">{stats.totals.last7Days}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-400">7 days</p>
          </div>
          <div>
            <p className="tnum text-xl font-bold text-ink-900">
              {formatCost(stats.totals.costUsd)}
            </p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-400">Spend</p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-5 space-y-3">
        <form action="/library" method="get" className="flex gap-2">
          {department !== 'all' ? (
            <input type="hidden" name="department" value={department} />
          ) : null}
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300"
              aria-hidden
            />
            <TextInput
              name="q"
              defaultValue={search}
              placeholder="Search titles, summaries and file names"
              aria-label="Search briefs"
              className="pl-10"
            />
          </div>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-ink-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          <FilterChip href={queryFor({ department: 'all', page: 1 })} active={department === 'all'}>
            All
            <span className="tnum ml-1 opacity-60">{stats.totals.briefs}</span>
          </FilterChip>
          {DEPARTMENT_LIST.map((dept) => (
            <FilterChip
              key={dept.id}
              href={queryFor({ department: dept.id, page: 1 })}
              active={department === dept.id}
              dot={HUES[dept.hue].hex.mid}
            >
              {dept.name}
              <span className="tnum ml-1 opacity-60">{countFor(dept.id)}</span>
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Results */}
      {data.rows.length === 0 ? (
        <EmptyState
          icon={<LibraryBig className="size-8" aria-hidden />}
          title={search || department !== 'all' ? 'Nothing matches those filters' : 'No briefs yet'}
          action={
            <Link
              href="/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
            >
              <FileUp className="size-[18px]" aria-hidden />
              Generate the first one
            </Link>
          }
        >
          {search || department !== 'all'
            ? 'Try clearing the search or picking a different department.'
            : 'Upload a Teams transcript and the brief will appear here.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((row) => {
            const dept = getDepartment(row.department);
            const tokens = HUES[dept.hue];
            return (
              <Card as="li" key={row.id} className="overflow-hidden transition-shadow hover:shadow-[0_2px_4px_rgba(15,6,22,0.05),0_18px_40px_-22px_rgba(15,6,22,0.28)]">
                <Link href={`/brief/${row.id}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900">
                  <span
                    aria-hidden
                    className="block h-[3px] w-full"
                    style={{ backgroundColor: tokens.hex.mid }}
                  />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Pill
                        className="border-transparent text-[10px] uppercase tracking-[0.1em] text-white"
                        style={{ backgroundColor: tokens.hex.base }}
                      >
                        {dept.code}
                      </Pill>
                      {row.findingsHigh > 0 ? (
                        <Pill className="border-red-200 bg-red-50 text-red-700">
                          <AlertTriangle className="size-3" aria-hidden />
                          {row.findingsHigh} to check
                        </Pill>
                      ) : (
                        <Pill className="border-teal-200 bg-teal-50 text-teal-700">
                          {row.groundingScore}% verified
                        </Pill>
                      )}
                    </div>

                    <h2 className="mt-2.5 line-clamp-2 text-[14.5px] font-bold leading-snug text-ink-900">
                      {row.title}
                    </h2>

                    <p className="mt-1.5 text-[12px] text-ink-400">
                      {row.dateLabel || '—'} · {formatRelative(row.createdAt)}
                    </p>

                    {row.sourceFile ? (
                      <p className="mt-2 truncate text-[11px] text-ink-400">
                        {row.sourceFile}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </Card>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="mt-7 flex items-center justify-between gap-4"
        >
          <PageLink href={queryFor({ page: page - 1 })} disabled={page <= 1}>
            Previous
          </PageLink>
          <p className="text-[12.5px] text-ink-400">
            Page {page} of {pageCount}
          </p>
          <PageLink href={queryFor({ page: page + 1 })} disabled={page >= pageCount}>
            Next
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function FilterChip({
  href,
  active,
  dot,
  children,
}: {
  href: string;
  active: boolean;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900',
        active
          ? 'border-transparent bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      ) : null}
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 cursor-not-allowed items-center rounded-xl border border-ink-100 bg-white px-4 text-sm font-semibold text-ink-300">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
    >
      {children}
    </Link>
  );
}
