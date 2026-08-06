import { cloneElement, isValidElement } from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Application UI kit.
 *
 * Deliberately small and explicit. Two rules run through all of it:
 *   - Every interactive control is at least 40px tall (44px for primary actions),
 *     which clears the WCAG 2.5.8 target-size minimum on touch.
 *   - Button label text is 14px — never smaller — so actions stay legible next to
 *     the 12px metadata around them.
 */

/* ------------------------------------------------------------------------- */
/* Button                                                                    */
/* ------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 disabled:hover:bg-ink-900',
  secondary:
    'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 active:bg-ink-100 disabled:hover:bg-white',
  ghost: 'text-ink-600 hover:bg-ink-100 active:bg-ink-200 disabled:hover:bg-transparent',
  danger:
    'border border-red-200 bg-white text-red-700 hover:bg-red-50 active:bg-red-100 disabled:hover:bg-white',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-xl font-semibold',
        'transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900',
        'disabled:cursor-not-allowed disabled:opacity-55',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    >
      {busy ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------------- */
/* Card                                                                     */
/* ------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <As
      className={cn(
        'rounded-2xl border border-ink-100 bg-white shadow-[0_1px_2px_rgba(15,6,22,0.04),0_10px_30px_-20px_rgba(15,6,22,0.18)]',
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-tight text-ink-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Form fields                                                              */
/* ------------------------------------------------------------------------- */

const CONTROL_BASE =
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-800 ' +
  'placeholder:text-ink-400 transition-colors ' +
  'focus:border-ink-400 focus:outline-2 focus:outline-offset-1 focus:outline-ink-900 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400';

/**
 * Labelled form field.
 *
 * The hint and error are given ids and then *wired to the control* via
 * `aria-describedby`. Rendering them with ids alone would look correct and read
 * as an unlabelled input to a screen reader, so the control element is cloned to
 * attach the association (and `aria-invalid` when there is an error).
 */
export function Field({
  label,
  hint,
  hintPosition = 'above',
  optional,
  htmlFor,
  children,
  className,
  error,
}: {
  label: string;
  hint?: string;
  hintPosition?: 'above' | 'below';
  optional?: boolean;
  htmlFor: string;
  children: ReactNode;
  className?: string;
  error?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control =
    describedBy && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby':
            [
              (children.props as Record<string, unknown>)['aria-describedby'],
              describedBy,
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : children;

  return (
    <div className={cn('min-w-0', className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline gap-2 text-[13px] font-semibold text-ink-700"
      >
        {label}
        {optional ? (
          <span className="text-[11px] font-medium text-ink-400">optional</span>
        ) : null}
      </label>
      {hint && hintPosition === 'above' ? (
        <p id={hintId} className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{control}</div>
      {hint && hintPosition === 'below' ? (
        <p id={hintId} className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[11.5px] font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL_BASE, 'h-11', className)} />;
}

export function TextArea({
  className,
  rows = 4,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={cn(CONTROL_BASE, 'resize-y py-2.5 leading-relaxed', className)}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cn(
          CONTROL_BASE,
          'h-11 cursor-pointer appearance-none pr-10',
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        fill="none"
      >
        <path
          d="M6 8l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Feedback                                                                 */
/* ------------------------------------------------------------------------- */

type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-teal-200 bg-teal-50 text-teal-900',
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-4 py-3 text-[13px] leading-relaxed',
        NOTICE_TONES[tone],
        className,
      )}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  className,
  style,
  title,
}: {
  children: ReactNode;
  className?: string;
  /** For department accents, which come from data rather than a class. */
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span
      style={style}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-300">{icon}</div> : null}
      <p className="text-[15px] font-bold text-ink-800">{title}</p>
      {children ? (
        <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-400">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Label above a group of controls or a bento tile. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[10.5px] font-bold uppercase leading-none tracking-[0.15em] text-ink-400',
        className,
      )}
    >
      {children}
    </p>
  );
}
