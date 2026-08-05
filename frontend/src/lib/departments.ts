/**
 * Department registry.
 *
 * Every department gets its own accent hue so a brief is recognisable at a
 * glance, plus a short code used in the document footer and owner badges.
 *
 * `hue` values must be one of the keys in `src/lib/theme.ts#HUES` — the theme
 * module owns the actual Tailwind class strings so that Tailwind's scanner can
 * see them as literals.
 */

export const DEPARTMENT_IDS = [
  'finance',
  'marketing',
  'sales',
  'hr',
  'management',
  'operations',
  'academic',
  'course-development',
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export type Hue =
  | 'teal'
  | 'coral'
  | 'violet'
  | 'amber'
  | 'pink'
  | 'blue'
  | 'emerald'
  | 'indigo';

export interface Department {
  id: DepartmentId;
  /** Full display name. */
  name: string;
  /** Short code used in document footers and tags, e.g. "CDD". */
  code: string;
  /** Accent hue driving the document theme. */
  hue: Hue;
  /** One-line description shown in the picker. */
  blurb: string;
  /**
   * Default "track" names the model is nudged towards. Tracks are the grouped
   * workstream sections in the document. The model may override these when the
   * transcript clearly calls for different groupings.
   */
  suggestedTracks: string[];
  /** Vocabulary hints that improve extraction quality for this department. */
  lexicon: string[];
}

export const DEPARTMENTS: Record<DepartmentId, Department> = {
  finance: {
    id: 'finance',
    name: 'Finance',
    code: 'FIN',
    hue: 'emerald',
    blurb: 'Budgets, forecasts, reconciliation, payroll and audit.',
    suggestedTracks: ['Reporting & Close', 'Budget & Forecast', 'Controls & Compliance'],
    lexicon: [
      'invoice',
      'reconciliation',
      'accruals',
      'variance',
      'forecast',
      'cash flow',
      'payroll',
      'purchase order',
      'audit',
      'VAT',
      'P&L',
      'headcount cost',
    ],
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing',
    code: 'MKT',
    hue: 'pink',
    blurb: 'Campaigns, brand, content, paid media and analytics.',
    suggestedTracks: ['Campaigns & Content', 'Brand & Creative', 'Performance & Analytics'],
    lexicon: [
      'campaign',
      'creative',
      'landing page',
      'CTR',
      'CPL',
      'impressions',
      'organic',
      'paid social',
      'SEO',
      'funnel',
      'brand guidelines',
      'collateral',
    ],
  },
  sales: {
    id: 'sales',
    name: 'Sales',
    code: 'SLS',
    hue: 'coral',
    blurb: 'Pipeline, enrolments, targets, partners and renewals.',
    suggestedTracks: ['Pipeline & Enrolments', 'Partners & Channels', 'Targets & Forecast'],
    lexicon: [
      'pipeline',
      'lead',
      'conversion',
      'enrolment',
      'quota',
      'proposal',
      'renewal',
      'churn',
      'discount',
      'close rate',
      'agent',
      'intake',
    ],
  },
  hr: {
    id: 'hr',
    name: 'Human Resources',
    code: 'HR',
    hue: 'violet',
    blurb: 'Hiring, onboarding, policy, wellbeing and performance.',
    suggestedTracks: ['Hiring & Onboarding', 'Policy & Compliance', 'People & Culture'],
    lexicon: [
      'requisition',
      'onboarding',
      'probation',
      'appraisal',
      'grievance',
      'leave',
      'attrition',
      'policy',
      'training',
      'contract',
      'right to work',
    ],
  },
  management: {
    id: 'management',
    name: 'Upper Management',
    code: 'EXE',
    hue: 'indigo',
    blurb: 'Strategy, cross-department decisions and escalations.',
    suggestedTracks: ['Strategy & Direction', 'Performance Review', 'Risks & Escalations'],
    lexicon: [
      'strategy',
      'roadmap',
      'escalation',
      'approval',
      'budget sign-off',
      'KPI',
      'board',
      'quarterly',
      'mandate',
      'restructure',
    ],
  },
  operations: {
    id: 'operations',
    name: 'Operations',
    code: 'OPS',
    hue: 'blue',
    blurb: 'Process, facilities, vendors, IT and service delivery.',
    suggestedTracks: ['Service Delivery', 'Systems & Access', 'Vendors & Facilities'],
    lexicon: [
      'SLA',
      'ticket',
      'vendor',
      'procurement',
      'downtime',
      'access',
      'licence',
      'subscription',
      'workflow',
      'handover',
      'rota',
      'incident',
    ],
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    code: 'ACA',
    hue: 'amber',
    blurb: 'Teaching, assessment, quality assurance and learners.',
    suggestedTracks: ['Delivery & Timetable', 'Assessment & QA', 'Learner Outcomes'],
    lexicon: [
      'cohort',
      'syllabus',
      'assessment',
      'moderation',
      'awarding body',
      'attendance',
      'grade',
      'IQA',
      'EQA',
      'learner',
      'unit',
      'submission',
    ],
  },
  'course-development': {
    id: 'course-development',
    name: 'Course Development',
    code: 'CDD',
    hue: 'teal',
    blurb: 'Content, e-books, video production and learning systems.',
    suggestedTracks: [
      'Design, Content & E-books',
      'Video Production & Uploads',
      'Learning Systems',
    ],
    lexicon: [
      'e-book',
      'prospectus',
      'chapter upload',
      'storyboard',
      'After Effects',
      'voiceover',
      'LMS',
      'thumbnail',
      'QA review',
      'render',
      'subtitle',
      'module',
    ],
  },
};

export const DEPARTMENT_LIST: Department[] = DEPARTMENT_IDS.map((id) => DEPARTMENTS[id]);

export function isDepartmentId(value: unknown): value is DepartmentId {
  return typeof value === 'string' && (DEPARTMENT_IDS as readonly string[]).includes(value);
}

export function getDepartment(id: string): Department {
  return isDepartmentId(id) ? DEPARTMENTS[id] : DEPARTMENTS['course-development'];
}

/** Meeting shapes change the tone and the section mix of the brief. */
export const MEETING_TYPES = [
  {
    id: 'one-to-one',
    name: 'One-to-one',
    blurb: 'Two people. Personal, direct, action-led.',
  },
  {
    id: 'team',
    name: 'Team / department meeting',
    blurb: 'A single department syncing on workstreams.',
  },
  {
    id: 'cross-department',
    name: 'Cross-department',
    blurb: 'Two or more departments coordinating.',
  },
  {
    id: 'company',
    name: 'Company-wide',
    blurb: 'All-hands. Emphasis on direction and announcements.',
  },
  {
    id: 'client',
    name: 'Client / external',
    blurb: 'External attendees. Emphasis on commitments made.',
  },
  {
    id: 'project',
    name: 'Project / stand-up',
    blurb: 'Delivery focused. Emphasis on blockers and dates.',
  },
] as const;

export type MeetingTypeId = (typeof MEETING_TYPES)[number]['id'];

export const MEETING_TYPE_IDS = MEETING_TYPES.map((m) => m.id) as MeetingTypeId[];

export function isMeetingTypeId(value: unknown): value is MeetingTypeId {
  return typeof value === 'string' && (MEETING_TYPE_IDS as string[]).includes(value);
}

export const CONFIDENTIALITY_LEVELS = [
  { id: 'internal', name: 'Internal', blurb: 'Shareable across the company.' },
  { id: 'restricted', name: 'Restricted', blurb: 'Named attendees and their line managers.' },
  { id: 'confidential', name: 'Confidential', blurb: 'Named attendees only.' },
] as const;

export type ConfidentialityId = (typeof CONFIDENTIALITY_LEVELS)[number]['id'];

export function isConfidentialityId(value: unknown): value is ConfidentialityId {
  return (
    typeof value === 'string' &&
    CONFIDENTIALITY_LEVELS.some((c) => c.id === value)
  );
}
