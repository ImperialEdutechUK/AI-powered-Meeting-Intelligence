import { z } from 'zod';
import { BriefSchema } from './ai/schema';
import {
  CONFIDENTIALITY_LEVELS,
  DEPARTMENT_IDS,
  MEETING_TYPES,
} from './departments';

/**
 * Everything needed to render, re-render and audit a brief.
 *
 * This is the JSON blob persisted in Postgres. It is validated on the way out of
 * the database as well as on the way in: a schema change must never render a
 * half-broken document from an older row.
 */

export const SpeakerStatSchema = z.object({
  name: z.string(),
  turns: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  spokenMs: z.number().nonnegative(),
  sharePct: z.number().min(0).max(100),
});

export const TranscriptFactsSchema = z.object({
  fileName: z.string(),
  format: z.string(),
  hasTimings: z.boolean(),
  durationMs: z.number().nonnegative().nullable(),
  totalWords: z.number().int().nonnegative(),
  totalCues: z.number().int().nonnegative(),
  speakers: z.array(SpeakerStatSchema),
  unattributedCues: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

export const FindingSchema = z.object({
  kind: z.enum(['unattested-number', 'unknown-person', 'partial-person', 'empty-section']),
  severity: z.enum(['high', 'medium', 'low']),
  value: z.string(),
  location: z.string(),
  message: z.string(),
});

export const GroundingReportSchema = z.object({
  findings: z.array(FindingSchema),
  checked: z.object({
    numbers: z.number().int().nonnegative(),
    people: z.number().int().nonnegative(),
  }),
  score: z.number().min(0).max(100),
  clean: z.boolean(),
});

export const TelemetrySchema = z.object({
  model: z.string(),
  strategy: z.enum(['single-pass', 'map-reduce']),
  calls: z.array(
    z.object({
      label: z.string(),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      attempts: z.number().int().nonnegative(),
      finishReason: z.string().nullable(),
    }),
  ),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  costUsd: z.number().nullable(),
  repaired: z.boolean(),
  truncatedOutput: z.boolean(),
  truncatedInput: z.boolean(),
  retries: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export const BriefBundleSchema = z.object({
  /** Bumped when the render contract changes. */
  version: z.literal(1),
  brief: BriefSchema,
  /** Primary department: theme, footer code and library filing. */
  department: z.enum(DEPARTMENT_IDS),
  /**
   * Every department selected at generation time, primary first. Optional so
   * briefs stored before multi-select existed still validate — they fall back
   * to `[department]` via `getBundleDepartments`.
   */
  departments: z.array(z.enum(DEPARTMENT_IDS)).min(1).optional(),
  meetingType: z.enum(MEETING_TYPES.map((m) => m.id) as [string, ...string[]]),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS.map((c) => c.id) as [string, ...string[]]),
  transcript: TranscriptFactsSchema,
  grounding: GroundingReportSchema,
  telemetry: TelemetrySchema,
  /** ISO timestamp. */
  generatedAt: z.string(),
});

export type BriefBundle = z.infer<typeof BriefBundleSchema>;
export type TranscriptFacts = z.infer<typeof TranscriptFactsSchema>;
export const BUNDLE_VERSION = 1 as const;
