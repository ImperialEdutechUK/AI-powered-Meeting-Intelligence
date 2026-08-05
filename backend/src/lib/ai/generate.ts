import { getDepartment } from '@/lib/departments';
import type { BriefInputs } from '@/lib/brief-inputs';
import { formatDateLabel, parseRoster, todayIso } from '@/lib/brief-inputs';
import type { Transcript } from '@/lib/transcript/types';
import { chunkCues, clampDialogue, needsChunking } from '@/lib/transcript/chunk';
import { recoverJson, JsonRecoveryError } from './json';
import {
  BriefSchema,
  LenientBriefSchema,
  briefIsUsable,
  normaliseBrief,
  type Brief,
} from './schema';
import {
  MAP_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildMapPrompt,
  buildReducePrompt,
  buildSinglePassPrompt,
  type PromptContext,
} from './prompt';
import {
  OpenRouterError,
  complete,
  estimateCostUsd,
  modelForTier,
  type Usage,
} from './openrouter';

/**
 * Orchestration: transcript in, validated `Brief` out.
 *
 * Strategy
 *   1. Single pass when the transcript fits comfortably (almost always, given a
 *      1M-token context).
 *   2. Map-reduce when it does not: per-segment extraction, then one merge call.
 *   3. On unusable output, one corrective retry that tells the model what was
 *      wrong. Repairable problems (long strings, odd enum spellings) are fixed
 *      locally by `normaliseBrief` and never cost a retry.
 */

export class GenerationError extends Error {
  readonly code: 'MODEL' | 'PARSE' | 'THIN';
  readonly detail: string;
  constructor(code: GenerationError['code'], message: string, detail = '') {
    super(message);
    this.name = 'GenerationError';
    this.code = code;
    this.detail = detail;
  }
}

export interface GenerationTelemetry {
  model: string;
  strategy: 'single-pass' | 'map-reduce';
  /** One entry per API call made. */
  calls: {
    label: string;
    promptTokens: number;
    completionTokens: number;
    attempts: number;
    finishReason: string | null;
  }[];
  usage: Usage;
  costUsd: number | null;
  /** True when a JSON repair was needed. */
  repaired: boolean;
  /** True when the model output was cut off by the token ceiling. */
  truncatedOutput: boolean;
  /** True when the transcript itself had to be truncated. */
  truncatedInput: boolean;
  retries: number;
  durationMs: number;
}

export interface GenerationResult {
  brief: Brief;
  telemetry: GenerationTelemetry;
}

function sumUsage(parts: Usage[]): Usage {
  return parts.reduce<Usage>(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

/** Build the shared prompt context. */
export function buildPromptContext(
  inputs: BriefInputs,
  transcript: Transcript,
  truncated: boolean,
): PromptContext {
  const department = getDepartment(inputs.department);
  const dateLabel =
    formatDateLabel(inputs.meetingDate) || formatDateLabel(todayIso()) || '';
  return {
    department,
    inputs,
    roster: parseRoster(inputs.roster),
    dateLabel,
    stats: transcript.stats,
    truncated,
  };
}

interface RawBriefAttempt {
  brief: Brief;
  repaired: boolean;
  truncatedOutput: boolean;
}

/** Parse, repair and normalise one model response. */
function toBrief(raw: string, ctx: PromptContext): RawBriefAttempt {
  let recovered;
  try {
    recovered = recoverJson(raw);
  } catch (cause) {
    if (cause instanceof JsonRecoveryError) {
      throw new GenerationError(
        'PARSE',
        'The model did not return usable JSON.',
        cause.message,
      );
    }
    throw cause;
  }

  const lenient = LenientBriefSchema.safeParse(recovered.value);
  if (!lenient.success) {
    throw new GenerationError(
      'PARSE',
      'The model returned JSON in an unexpected shape.',
      lenient.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    );
  }

  const normalised = normaliseBrief(lenient.data, {
    fallbackTitle: ctx.inputs.meetingTitle || `${ctx.department.name} Meeting`,
    fallbackDateLabel: ctx.dateLabel,
    departmentCode: ctx.department.code,
    rosterNames: ctx.roster.map((r) => r.name),
  });

  // The strict schema is a safety net: normaliseBrief should always satisfy it.
  const strict = BriefSchema.safeParse(normalised);
  if (!strict.success) {
    throw new GenerationError(
      'PARSE',
      'The brief failed final validation.',
      strict.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    );
  }

  return {
    brief: strict.data,
    repaired: recovered.repaired,
    truncatedOutput: recovered.truncated,
  };
}

export interface GenerateOptions {
  inputs: BriefInputs;
  transcript: Transcript;
  signal?: AbortSignal;
  /** Test seam: swap the completion function. */
  completionFn?: typeof complete;
}

export async function generateBrief(options: GenerateOptions): Promise<GenerationResult> {
  const { inputs, transcript, signal } = options;
  const call = options.completionFn ?? complete;
  const startedAt = Date.now();

  const model = modelForTier(inputs.depth);
  const calls: GenerationTelemetry['calls'] = [];
  const usageParts: Usage[] = [];
  let repaired = false;
  let truncatedOutput = false;
  let retries = 0;

  const useChunking = needsChunking(transcript.stats.approxTokens);
  const strategy: GenerationTelemetry['strategy'] = useChunking
    ? 'map-reduce'
    : 'single-pass';

  const clamped = clampDialogue(transcript.dialogue);
  const ctx = buildPromptContext(inputs, transcript, clamped.truncated);

  /** Run the model and turn its output into a Brief, or throw. */
  const attempt = async (
    label: string,
    userPrompt: string,
    systemPrompt: string,
    correction?: string,
  ): Promise<RawBriefAttempt> => {
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
    if (correction) {
      messages.push({
        role: 'user' as const,
        content: `Your previous response was rejected: ${correction}\n\nReturn the corrected complete JSON object. Follow the schema and composition rules exactly. No code fences, no commentary.`,
      });
    }

    const result = await call({
      messages,
      model,
      temperature: correction ? 0.05 : 0.15,
      maxTokens: 16_000,
      json: true,
      signal,
    });

    calls.push({
      label,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      attempts: result.attempts,
      finishReason: result.finishReason,
    });
    usageParts.push(result.usage);

    const parsed = toBrief(result.text, ctx);
    if (parsed.repaired) repaired = true;
    if (parsed.truncatedOutput || result.finishReason === 'length') truncatedOutput = true;
    return parsed;
  };

  let basePrompt: string;
  let baseSystem: string;

  if (useChunking) {
    const chunks = chunkCues(transcript.cues);
    const mapOutputs: string[] = [];

    // Sequential rather than parallel: keeps us inside per-key rate limits and
    // the wall-clock cost is acceptable for the rare very long transcript.
    for (const chunk of chunks) {
      const mapResult = await call({
        messages: [
          { role: 'system', content: MAP_SYSTEM_PROMPT },
          { role: 'user', content: buildMapPrompt(chunk.label, chunk.dialogue) },
        ],
        model,
        temperature: 0.1,
        maxTokens: 12_000,
        json: true,
        signal,
      });
      calls.push({
        label: `map ${chunk.index + 1}`,
        promptTokens: mapResult.usage.promptTokens,
        completionTokens: mapResult.usage.completionTokens,
        attempts: mapResult.attempts,
        finishReason: mapResult.finishReason,
      });
      usageParts.push(mapResult.usage);
      mapOutputs.push(mapResult.text.slice(0, 40_000));
    }

    basePrompt = buildReducePrompt(ctx, mapOutputs);
    baseSystem = SYSTEM_PROMPT;
  } else {
    basePrompt = buildSinglePassPrompt(ctx, clamped.text);
    baseSystem = SYSTEM_PROMPT;
  }

  let outcome: RawBriefAttempt;
  let firstFailure: string | null = null;

  try {
    outcome = await attempt(useChunking ? 'reduce' : 'single-pass', basePrompt, baseSystem);
    const usable = briefIsUsable(outcome.brief);
    if (!usable.ok) {
      firstFailure = `the brief was too thin (${usable.reason}). Extract more of the discussion: every topic that produced a commitment, a decision, a number or a blocker must appear as an item.`;
      throw new GenerationError('THIN', 'The first brief was too thin.', usable.reason ?? '');
    }
  } catch (cause) {
    if (cause instanceof OpenRouterError) throw cause;
    if (!(cause instanceof GenerationError)) throw cause;

    retries = 1;
    const correction = firstFailure ?? `${cause.message} ${cause.detail}`.trim();
    outcome = await attempt(
      useChunking ? 'reduce (retry)' : 'single-pass (retry)',
      basePrompt,
      baseSystem,
      correction,
    );

    const usable = briefIsUsable(outcome.brief);
    if (!usable.ok) {
      throw new GenerationError(
        'THIN',
        `The model could not produce a complete brief from this transcript (${usable.reason}). It may be too short, or mostly small talk.`,
        usable.reason ?? '',
      );
    }
  }

  const usage = sumUsage(usageParts);

  return {
    brief: outcome.brief,
    telemetry: {
      model,
      strategy,
      calls,
      usage,
      costUsd: estimateCostUsd(model, usage),
      repaired,
      truncatedOutput,
      truncatedInput: clamped.truncated,
      retries,
      durationMs: Date.now() - startedAt,
    },
  };
}
