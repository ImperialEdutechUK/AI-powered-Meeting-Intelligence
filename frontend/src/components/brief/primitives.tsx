import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Hue } from '@/lib/departments';
import { chip as chipTokens, hue as hueTokens, type ChipKind } from '@/lib/theme';

/**
 * Document primitives.
 *
 * Every type size is an explicit pixel value. The document renders at exactly
 * one A4 width, so there is no responsive behaviour to reason about and the
 * printed page is guaranteed to match the preview.
 */

/** Small-caps letterspaced label, e.g. "ACTION BRIEF · COURSE DEVELOPMENT". */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-[8.5px] font-bold uppercase leading-none tracking-[0.19em]',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Section heading with the accent rule on its left, as in the sample. */
export function SectionHeading({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent: Hue;
  className?: string;
}) {
  const tokens = hueTokens(accent);
  return (
    <div className={cn('doc-keep flex items-stretch gap-[7px]', className)}>
      <span aria-hidden className={cn('w-[3px] shrink-0 rounded-full', tokens.rail)} />
      <h2 className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-ink-900">
        {children}
      </h2>
    </div>
  );
}

/** Status chip used under each discussion item. */
export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  const tokens = chipTokens(kind);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-[3px] rounded-full border px-[7px] py-[2.5px]',
        'text-[8.5px] font-semibold leading-[1.35]',
        tokens.wrap,
      )}
    >
      <span aria-hidden className="shrink-0 text-[8px] leading-none opacity-90">
        {tokens.glyph}
      </span>
      <span className="min-w-0">{children}</span>
      <span className="sr-only"> ({tokens.label})</span>
    </span>
  );
}

/** Dark pill used in the hero for date / systems / chair. */
export function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full bg-white/12 px-[9px] py-[4px] text-[8.5px] font-semibold leading-none text-white/95 ring-1 ring-inset ring-white/15">
      <span aria-hidden className="size-[3.5px] shrink-0 rounded-full bg-teal-300" />
      {children}
    </span>
  );
}

/** The `CDD · RIDMA` ownership tag on the right of an item header. */
export function OwnerTag({ accent, children }: { accent: Hue; children: ReactNode }) {
  const tokens = hueTokens(accent);
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-[6px] py-[3px] text-[7.5px] font-bold uppercase leading-none tracking-[0.11em]',
        tokens.chip,
        tokens.chipText,
      )}
    >
      {children}
    </span>
  );
}

/** Rounded square badge holding a person's function code. */
export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-[7.5px] font-bold uppercase leading-none tracking-[0.04em]',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin horizontal rule used under track headers. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-ink-200/70', className)} />;
}

/** A white card with the accent rail down its left edge. */
export function RailCard({
  accent,
  children,
  className,
}: {
  accent: Hue;
  children: ReactNode;
  className?: string;
}) {
  const tokens = hueTokens(accent);
  return (
    <div
      className={cn(
        'doc-keep flex overflow-hidden rounded-[9px] bg-white shadow-[0_1px_2px_rgba(15,6,22,0.05)]',
        className,
      )}
    >
      <span aria-hidden className={cn('w-[3px] shrink-0', tokens.rail)} />
      <div className="min-w-0 flex-1 px-[13px] py-[11px]">{children}</div>
    </div>
  );
}
