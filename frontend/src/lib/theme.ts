import type { Hue } from './departments';

/**
 * Accent system.
 *
 * Every class string here is a literal so Tailwind's source scanner can see it.
 * Never build a class name by interpolation — look it up from these maps.
 *
 * `hex` values duplicate the Tailwind palette because the DOCX exporter and the
 * inline SVG charts need raw colour values, not classes.
 */

export interface HueTokens {
  /** Accent text, e.g. the big "01" item numbers. */
  text: string;
  /** Strong accent text for small caps eyebrows. */
  textStrong: string;
  /** Solid accent fill, e.g. the TRACK pill. */
  solid: string;
  /** Text colour that is legible on `solid`. */
  onSolid: string;
  /** Very light tint for card backgrounds. */
  tint: string;
  /** Mid tint for chips. */
  chip: string;
  /** Chip text. */
  chipText: string;
  /** Chip border. */
  chipBorder: string;
  /** 3px left rail on item cards. */
  rail: string;
  /** Top rail on bento stat cards. */
  topRail: string;
  /** Focus ring. */
  ring: string;
  /** Raw hex values for SVG + DOCX. */
  hex: {
    /** 600 */
    base: string;
    /** 500 */
    mid: string;
    /** 700 */
    deep: string;
    /** 200 */
    soft: string;
    /** 50 */
    tint: string;
  };
}

export const HUES: Record<Hue, HueTokens> = {
  teal: {
    text: 'text-teal-600',
    textStrong: 'text-teal-700',
    solid: 'bg-teal-600',
    onSolid: 'text-white',
    tint: 'bg-teal-50',
    chip: 'bg-teal-50',
    chipText: 'text-teal-700',
    chipBorder: 'border-teal-200',
    rail: 'bg-teal-500',
    topRail: 'bg-teal-500',
    ring: 'focus-visible:ring-teal-500',
    hex: {
      base: '#0D9488',
      mid: '#14B8A6',
      deep: '#0F766E',
      soft: '#99F6E4',
      tint: '#F0FDFA',
    },
  },
  coral: {
    text: 'text-orange-600',
    textStrong: 'text-orange-700',
    solid: 'bg-orange-500',
    onSolid: 'text-white',
    tint: 'bg-orange-50',
    chip: 'bg-orange-50',
    chipText: 'text-orange-700',
    chipBorder: 'border-orange-200',
    rail: 'bg-orange-500',
    topRail: 'bg-orange-500',
    ring: 'focus-visible:ring-orange-500',
    hex: {
      base: '#EA580C',
      mid: '#F97316',
      deep: '#C2410C',
      soft: '#FED7AA',
      tint: '#FFF7ED',
    },
  },
  violet: {
    text: 'text-violet-600',
    textStrong: 'text-violet-700',
    solid: 'bg-violet-600',
    onSolid: 'text-white',
    tint: 'bg-violet-50',
    chip: 'bg-violet-50',
    chipText: 'text-violet-700',
    chipBorder: 'border-violet-200',
    rail: 'bg-violet-500',
    topRail: 'bg-violet-500',
    ring: 'focus-visible:ring-violet-500',
    hex: {
      base: '#7C3AED',
      mid: '#8B5CF6',
      deep: '#6D28D9',
      soft: '#DDD6FE',
      tint: '#F5F3FF',
    },
  },
  amber: {
    text: 'text-amber-600',
    textStrong: 'text-amber-700',
    solid: 'bg-amber-500',
    onSolid: 'text-white',
    tint: 'bg-amber-50',
    chip: 'bg-amber-50',
    chipText: 'text-amber-700',
    chipBorder: 'border-amber-200',
    rail: 'bg-amber-500',
    topRail: 'bg-amber-500',
    ring: 'focus-visible:ring-amber-500',
    hex: {
      base: '#D97706',
      mid: '#F59E0B',
      deep: '#B45309',
      soft: '#FDE68A',
      tint: '#FFFBEB',
    },
  },
  pink: {
    text: 'text-pink-600',
    textStrong: 'text-pink-700',
    solid: 'bg-pink-600',
    onSolid: 'text-white',
    tint: 'bg-pink-50',
    chip: 'bg-pink-50',
    chipText: 'text-pink-700',
    chipBorder: 'border-pink-200',
    rail: 'bg-pink-500',
    topRail: 'bg-pink-500',
    ring: 'focus-visible:ring-pink-500',
    hex: {
      base: '#DB2777',
      mid: '#EC4899',
      deep: '#BE185D',
      soft: '#FBCFE8',
      tint: '#FDF2F8',
    },
  },
  blue: {
    text: 'text-blue-600',
    textStrong: 'text-blue-700',
    solid: 'bg-blue-600',
    onSolid: 'text-white',
    tint: 'bg-blue-50',
    chip: 'bg-blue-50',
    chipText: 'text-blue-700',
    chipBorder: 'border-blue-200',
    rail: 'bg-blue-500',
    topRail: 'bg-blue-500',
    ring: 'focus-visible:ring-blue-500',
    hex: {
      base: '#2563EB',
      mid: '#3B82F6',
      deep: '#1D4ED8',
      soft: '#BFDBFE',
      tint: '#EFF6FF',
    },
  },
  emerald: {
    text: 'text-emerald-600',
    textStrong: 'text-emerald-700',
    solid: 'bg-emerald-600',
    onSolid: 'text-white',
    tint: 'bg-emerald-50',
    chip: 'bg-emerald-50',
    chipText: 'text-emerald-700',
    chipBorder: 'border-emerald-200',
    rail: 'bg-emerald-500',
    topRail: 'bg-emerald-500',
    ring: 'focus-visible:ring-emerald-500',
    hex: {
      base: '#059669',
      mid: '#10B981',
      deep: '#047857',
      soft: '#A7F3D0',
      tint: '#ECFDF5',
    },
  },
  indigo: {
    text: 'text-indigo-600',
    textStrong: 'text-indigo-700',
    solid: 'bg-indigo-600',
    onSolid: 'text-white',
    tint: 'bg-indigo-50',
    chip: 'bg-indigo-50',
    chipText: 'text-indigo-700',
    chipBorder: 'border-indigo-200',
    rail: 'bg-indigo-500',
    topRail: 'bg-indigo-500',
    ring: 'focus-visible:ring-indigo-500',
    hex: {
      base: '#4F46E5',
      mid: '#6366F1',
      deep: '#4338CA',
      soft: '#C7D2FE',
      tint: '#EEF2FF',
    },
  },
};

/** Ordered rotation used when a document needs N distinct accents. */
export const HUE_ROTATION: Hue[] = [
  'teal',
  'coral',
  'violet',
  'amber',
  'pink',
  'blue',
  'emerald',
  'indigo',
];

/** Deterministic accent for the nth track / stat card, offset by the department. */
export function rotateHue(index: number, seed: Hue): Hue {
  const start = HUE_ROTATION.indexOf(seed);
  const base = start < 0 ? 0 : start;
  const key = HUE_ROTATION[(base + index) % HUE_ROTATION.length];
  return key ?? 'teal';
}

export function hue(h: Hue): HueTokens {
  return HUES[h] ?? HUES.teal;
}

/* ------------------------------------------------------------------------- */
/* Status chips                                                              */
/* ------------------------------------------------------------------------- */

export const CHIP_KINDS = [
  'blocked',
  'done',
  'progress',
  'action',
  'decision',
  'date',
  'note',
  'risk',
] as const;

export type ChipKind = (typeof CHIP_KINDS)[number];

export interface ChipTokens {
  /**
   * Leading glyph. Restricted to Basic Latin and the Geometric Shapes characters
   * that Inter ships, so the container never needs an emoji font installed and
   * the PDF can never render a tofu box.
   */
  glyph: string;
  wrap: string;
  hex: { text: string; fill: string; border: string };
  /** Human label used in the DOCX legend. */
  label: string;
}

export const CHIPS: Record<ChipKind, ChipTokens> = {
  blocked: {
    glyph: '×',
    wrap: 'bg-red-50 text-red-700 border-red-200',
    hex: { text: '991B1B', fill: 'FEF2F2', border: 'FECACA' },
    label: 'Blocked',
  },
  done: {
    glyph: '✓',
    wrap: 'bg-teal-50 text-teal-700 border-teal-200',
    hex: { text: '0F766E', fill: 'F0FDFA', border: '99F6E4' },
    label: 'Complete',
  },
  progress: {
    glyph: '○',
    wrap: 'bg-amber-50 text-amber-700 border-amber-200',
    hex: { text: 'B45309', fill: 'FFFBEB', border: 'FDE68A' },
    label: 'In progress',
  },
  action: {
    glyph: '!',
    wrap: 'bg-orange-50 text-orange-700 border-orange-200',
    hex: { text: 'C2410C', fill: 'FFF7ED', border: 'FED7AA' },
    label: 'Action required',
  },
  decision: {
    glyph: '◆',
    wrap: 'bg-violet-50 text-violet-700 border-violet-200',
    hex: { text: '6D28D9', fill: 'F5F3FF', border: 'DDD6FE' },
    label: 'Decision',
  },
  date: {
    glyph: '●',
    wrap: 'bg-blue-50 text-blue-700 border-blue-200',
    hex: { text: '1D4ED8', fill: 'EFF6FF', border: 'BFDBFE' },
    label: 'Date',
  },
  note: {
    glyph: '·',
    wrap: 'bg-slate-100 text-slate-700 border-slate-300',
    hex: { text: '334155', fill: 'F1F5F9', border: 'CBD5E1' },
    label: 'Note',
  },
  risk: {
    glyph: '▲',
    wrap: 'bg-rose-50 text-rose-700 border-rose-200',
    hex: { text: 'BE123C', fill: 'FFF1F2', border: 'FECDD3' },
    label: 'Risk',
  },
};

export function chip(kind: ChipKind): ChipTokens {
  return CHIPS[kind] ?? CHIPS.note;
}

/* ------------------------------------------------------------------------- */
/* Callouts                                                                  */
/* ------------------------------------------------------------------------- */

export const CALLOUT_TONES = ['critical', 'warning', 'positive', 'info'] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export interface CalloutTokens {
  rail: string;
  surface: string;
  iconWrap: string;
  title: string;
  body: string;
  hex: { rail: string; fill: string; title: string };
  label: string;
}

export const CALLOUTS: Record<CalloutTone, CalloutTokens> = {
  critical: {
    rail: 'bg-red-500',
    surface: 'bg-red-50/70',
    iconWrap: 'bg-red-500 text-white',
    title: 'text-red-900',
    body: 'text-red-950/80',
    hex: { rail: 'EF4444', fill: 'FEF2F2', title: '7F1D1D' },
    label: 'Critical',
  },
  warning: {
    rail: 'bg-amber-500',
    surface: 'bg-amber-50/70',
    iconWrap: 'bg-amber-500 text-white',
    title: 'text-amber-900',
    body: 'text-amber-950/80',
    hex: { rail: 'F59E0B', fill: 'FFFBEB', title: '78350F' },
    label: 'Watch',
  },
  positive: {
    rail: 'bg-teal-500',
    surface: 'bg-teal-50/70',
    iconWrap: 'bg-teal-600 text-white',
    title: 'text-teal-900',
    body: 'text-teal-950/80',
    hex: { rail: '14B8A6', fill: 'F0FDFA', title: '134E4A' },
    label: 'Win',
  },
  info: {
    rail: 'bg-blue-500',
    surface: 'bg-blue-50/70',
    iconWrap: 'bg-blue-600 text-white',
    title: 'text-blue-900',
    body: 'text-blue-950/80',
    hex: { rail: '3B82F6', fill: 'EFF6FF', title: '1E3A8A' },
    label: 'Note',
  },
};

export function callout(tone: CalloutTone): CalloutTokens {
  return CALLOUTS[tone] ?? CALLOUTS.info;
}

/* ------------------------------------------------------------------------- */
/* Owner role badges                                                         */
/* ------------------------------------------------------------------------- */

/**
 * Badge palette for the "Who's owning what" grid. Indexed deterministically off
 * the owner's position so a person keeps the same colour within one document.
 */
export const BADGE_STYLES: string[] = [
  'bg-orange-500 text-white',
  'bg-pink-500 text-white',
  'bg-amber-500 text-white',
  'bg-violet-600 text-white',
  'bg-rose-400 text-white',
  'bg-pink-600 text-white',
  'bg-blue-600 text-white',
  'bg-indigo-500 text-white',
  'bg-teal-600 text-white',
  'bg-emerald-600 text-white',
  'bg-cyan-600 text-white',
  'bg-fuchsia-600 text-white',
];

export const BADGE_HEX: string[] = [
  'F97316',
  'EC4899',
  'F59E0B',
  '7C3AED',
  'FB7185',
  'DB2777',
  '2563EB',
  '6366F1',
  '0D9488',
  '059669',
  '0891B2',
  'C026D3',
];

export function badgeStyle(index: number): string {
  return BADGE_STYLES[index % BADGE_STYLES.length] ?? 'bg-slate-600 text-white';
}

export function badgeHex(index: number): string {
  return BADGE_HEX[index % BADGE_HEX.length] ?? '475569';
}

/** Timeline dot colours, left to right. */
export const TIMELINE_DOTS: string[] = [
  'border-orange-500',
  'border-amber-500',
  'border-teal-500',
  'border-violet-600',
  'border-pink-500',
  'border-blue-600',
];

export function timelineDot(index: number): string {
  return TIMELINE_DOTS[index % TIMELINE_DOTS.length] ?? 'border-slate-500';
}

export const TIMELINE_HEX: string[] = [
  'F97316',
  'F59E0B',
  '14B8A6',
  '7C3AED',
  'EC4899',
  '2563EB',
];

export function timelineHex(index: number): string {
  return TIMELINE_HEX[index % TIMELINE_HEX.length] ?? '64748B';
}
