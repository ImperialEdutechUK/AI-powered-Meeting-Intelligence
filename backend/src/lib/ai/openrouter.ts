import { serverEnv } from '@/lib/env';

/**
 * Minimal OpenRouter chat-completions client.
 *
 * Deliberately hand-rolled rather than pulling in an SDK: we need precise control
 * over timeouts, retry classification and the `response_format` fallback, and the
 * surface area we use is one endpoint.
 */

export type ModelTier = 'fast' | 'deep';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage: Usage;
  /** Provider-reported finish reason, when present. */
  finishReason: string | null;
  /** Number of HTTP attempts made, including the successful one. */
  attempts: number;
}

export class OpenRouterError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly code:
    | 'AUTH'
    | 'RATE_LIMIT'
    | 'CREDIT'
    | 'TIMEOUT'
    | 'BAD_REQUEST'
    | 'SERVER'
    | 'NETWORK'
    | 'EMPTY'
    | 'CONTEXT';

  constructor(
    code: OpenRouterError['code'],
    message: string,
    status: number | null,
    retryable: boolean,
  ) {
    super(message);
    this.name = 'OpenRouterError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** Prices per million tokens, verified on openrouter.ai on 2026-07-30. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek/deepseek-v4-flash': { input: 0.09, output: 0.18 },
  'deepseek/deepseek-v4-pro': { input: 0.435, output: 0.87 },
};

export function modelForTier(tier: ModelTier): string {
  const env = serverEnv();
  return tier === 'deep' ? env.OPENROUTER_MODEL_DEEP : env.OPENROUTER_MODEL_FAST;
}

/**
 * Estimated USD cost of a call. Returns null for a model we have no published
 * price for, rather than guessing — the UI shows "—" in that case.
 */
export function estimateCostUsd(model: string, usage: Usage): number | null {
  const price = MODEL_PRICING[model];
  if (!price) return null;
  const cost =
    (usage.promptTokens / 1_000_000) * price.input +
    (usage.completionTokens / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

interface OpenRouterChoice {
  message?: { content?: unknown };
  finish_reason?: unknown;
  native_finish_reason?: unknown;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  model?: unknown;
  error?: { message?: unknown; code?: unknown };
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function classify(status: number, body: string): OpenRouterError {
  const snippet = body.slice(0, 400);
  if (status === 401 || status === 403) {
    return new OpenRouterError(
      'AUTH',
      'OpenRouter rejected the API key. Check OPENROUTER_API_KEY.',
      status,
      false,
    );
  }
  if (status === 402) {
    return new OpenRouterError(
      'CREDIT',
      'The OpenRouter account is out of credit. Top it up and try again.',
      status,
      false,
    );
  }
  if (status === 429) {
    return new OpenRouterError(
      'RATE_LIMIT',
      'OpenRouter is rate limiting this key. Retrying shortly.',
      status,
      true,
    );
  }
  if (status === 400 || status === 422) {
    const isContext = /context|token|too long|maximum/i.test(snippet);
    return new OpenRouterError(
      isContext ? 'CONTEXT' : 'BAD_REQUEST',
      isContext
        ? 'The transcript exceeded the model context window even after chunking.'
        : `OpenRouter rejected the request: ${snippet}`,
      status,
      false,
    );
  }
  if (status >= 500) {
    return new OpenRouterError(
      'SERVER',
      `OpenRouter returned ${status}. Retrying.`,
      status,
      true,
    );
  }
  return new OpenRouterError('SERVER', `Unexpected status ${status}: ${snippet}`, status, false);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CompletionOptions {
  messages: ChatMessage[];
  model: string;
  /** 0 for extraction work. */
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider to constrain output to a JSON object. */
  json?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

/**
 * One chat completion, with retry on transient failures.
 *
 * `json: true` sets `response_format`. Not every provider route honours it, so a
 * 400 mentioning response_format falls back to a plain request once — the prompt
 * already demands bare JSON, and the parser tolerates fences either way.
 */
export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const env = serverEnv();
  const {
    messages,
    model,
    temperature = 0.15,
    maxTokens = 16_000,
    json = true,
    timeoutMs = 300_000,
    maxAttempts = 4,
    signal,
  } = options;

  const url = `${env.OPENROUTER_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Title': env.OPENROUTER_SITE_NAME,
  };
  if (env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = env.OPENROUTER_SITE_URL;

  let useJsonFormat = json;
  let lastError: OpenRouterError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        // OpenRouter returns token accounting in the response when asked.
        usage: { include: true },
      };
      if (useJsonFormat) body.response_format = { type: 'json_object' };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        // One-shot fallback when the route does not support response_format.
        if (
          useJsonFormat &&
          (response.status === 400 || response.status === 422) &&
          /response_format|json_object|json_schema/i.test(errorBody)
        ) {
          useJsonFormat = false;
          continue;
        }
        const error = classify(response.status, errorBody);
        lastError = error;
        if (!error.retryable || attempt === maxAttempts) throw error;
        // Honour Retry-After when the provider sends it.
        const retryAfter = Number(response.headers.get('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 20_000)
          : Math.min(1_200 * 2 ** (attempt - 1), 12_000) + Math.random() * 400;
        await sleep(backoff);
        continue;
      }

      const payload = (await response.json()) as OpenRouterResponse;

      if (payload.error) {
        const message =
          typeof payload.error.message === 'string' ? payload.error.message : 'Unknown error';
        throw new OpenRouterError('SERVER', `OpenRouter error: ${message}`, 200, false);
      }

      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      const textOut = typeof content === 'string' ? content : '';

      if (textOut.trim() === '') {
        const error = new OpenRouterError(
          'EMPTY',
          'The model returned an empty response.',
          200,
          true,
        );
        lastError = error;
        if (attempt === maxAttempts) throw error;
        await sleep(Math.min(1_000 * 2 ** (attempt - 1), 8_000));
        continue;
      }

      const finish =
        typeof choice?.finish_reason === 'string'
          ? choice.finish_reason
          : typeof choice?.native_finish_reason === 'string'
            ? choice.native_finish_reason
            : null;

      return {
        text: textOut,
        model: typeof payload.model === 'string' ? payload.model : model,
        usage: {
          promptTokens: num(payload.usage?.prompt_tokens),
          completionTokens: num(payload.usage?.completion_tokens),
          totalTokens: num(payload.usage?.total_tokens),
        },
        finishReason: finish,
        attempts: attempt,
      };
    } catch (cause) {
      if (cause instanceof OpenRouterError) {
        if (!cause.retryable || attempt === maxAttempts) throw cause;
        lastError = cause;
        await sleep(Math.min(1_200 * 2 ** (attempt - 1), 12_000));
        continue;
      }

      const aborted =
        (cause instanceof Error && cause.name === 'AbortError') || controller.signal.aborted;

      // A caller-initiated cancellation must not be retried.
      if (aborted && signal?.aborted) {
        throw new OpenRouterError('TIMEOUT', 'The request was cancelled.', null, false);
      }

      const error = aborted
        ? new OpenRouterError(
            'TIMEOUT',
            `The model did not respond within ${Math.round(timeoutMs / 1000)}s.`,
            null,
            true,
          )
        : new OpenRouterError(
            'NETWORK',
            `Could not reach OpenRouter: ${cause instanceof Error ? cause.message : String(cause)}`,
            null,
            true,
          );

      lastError = error;
      if (attempt === maxAttempts) throw error;
      await sleep(Math.min(1_200 * 2 ** (attempt - 1), 12_000));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  throw (
    lastError ??
    new OpenRouterError('SERVER', 'Exhausted all attempts against OpenRouter.', null, false)
  );
}
