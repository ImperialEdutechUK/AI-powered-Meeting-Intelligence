'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileUp, LibraryBig, LogOut, Menu, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

/**
 * Application chrome.
 *
 * A single left rail with three destinations, collapsing to a sheet under `lg`.
 * Three is the whole navigation: generate, library, example. Anything more would
 * be menu for its own sake — the app does one job.
 */

const NAV = [
  { href: '/new', label: 'New brief', icon: FileUp, hint: 'Upload a transcript' },
  { href: '/library', label: 'Library', icon: LibraryBig, hint: 'Everything generated' },
  { href: '/example', label: 'Example', icon: Sparkles, hint: 'A worked sample' },
] as const;

export function Shell({
  children,
  orgName,
  who,
}: {
  children: ReactNode;
  orgName: string;
  who: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  /*
   * Sheet keyboard behaviour: Escape closes it, focus moves inside on open and
   * returns to the trigger on close, and the body does not scroll behind it.
   */
  useEffect(() => {
    if (!open) return;

    // Captured now so cleanup restores focus to the element that opened the
    // sheet, even if the ref has since been detached.
    const trigger = menuButtonRef.current;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/example' && pathname.startsWith(`${href}/`));

  const navList = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
              active ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/6 hover:text-white/90',
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.label}</span>
              <span className="block truncate text-[11px] text-white/55">{item.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/new" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-teal-600">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path
            d="M4.5 12.5l5 5 10-11"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight text-white">ActionBrief</span>
        <span className="block truncate text-[11px] leading-tight text-white/55">
          {orgName}
        </span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop rail */}
      <aside
        className="sticky top-0 hidden h-dvh flex-col justify-between p-4 lg:flex"
        style={{ background: 'linear-gradient(170deg, #0B0616 0%, #1A0E30 60%, #241546 100%)' }}
      >
        <div>
          <div className="px-1 pb-6 pt-1">{brand}</div>
          {navList}
        </div>

        <div className="border-t border-white/10 pt-3">
          {who ? (
            <p className="truncate px-3 pb-2 text-[11px] text-white/55">Signed in as {who}</p>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-white/60 transition-colors hover:bg-white/6 hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
          >
            <LogOut className="size-[18px] shrink-0" aria-hidden />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Mobile bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 lg:hidden"
        style={{ background: 'linear-gradient(120deg, #0B0616 0%, #241546 100%)' }}
      >
        {brand}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-nav-sheet"
          className="flex size-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
          />
          <div
            id="mobile-nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[264px] flex-col justify-between p-4"
            style={{ background: 'linear-gradient(170deg, #0B0616 0%, #241546 100%)' }}
          >
            <div>
              <div className="flex items-center justify-between pb-6">
                {brand}
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex size-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              {navList}
            </div>
            <Button variant="ghost" onClick={signOut} busy={signingOut} className="justify-start text-white/70 hover:bg-white/10 hover:text-white">
              <LogOut className="size-[18px]" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      ) : null}

      <main className="min-w-0 pb-16">{children}</main>
    </div>
  );
}
