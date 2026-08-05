/**
 * Recovering a JSON object from model output.
 *
 * Even with `response_format: json_object`, output arrives wrapped in code
 * fences, prefixed with "Here is the JSON:", or cut off mid-array when the
 * completion hits the token ceiling. Each of those is recoverable without a
 * second API call, which is the point of this module.
 */

export class JsonRecoveryError extends Error {
  readonly stage: 'no-object' | 'parse';
  constructor(stage: JsonRecoveryError['stage'], message: string) {
    super(message);
    this.name = 'JsonRecoveryError';
    this.stage = stage;
  }
}

/** Strip markdown code fences, keeping the largest fenced block if present. */
export function stripFences(input: string): string {
  const fence = /```(?:json|jsonc|javascript|js)?\s*\n?([\s\S]*?)```/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fence.exec(input)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  if (blocks.length > 0) {
    return blocks.reduce((a, b) => (b.length > a.length ? b : a)).trim();
  }
  // An unterminated opening fence, which happens on truncated output.
  const open = /```(?:json|jsonc)?\s*\n/i.exec(input);
  return open ? input.slice(open.index + open[0].length).trim() : input.trim();
}

/** Remove trailing commas before a closing brace or bracket. */
export function stripTrailingCommas(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? '';

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ',') {
      // Bounded lookahead: no real formatting puts more than a handful of
      // whitespace characters between a comma and the closer, and an unbounded
      // scan here would be quadratic on adversarial input.
      const limit = Math.min(input.length, i + 1 + 64);
      let j = i + 1;
      while (j < limit && /\s/.test(input[j] ?? '')) j += 1;
      const next = input[j];
      if (next === '}' || next === ']') continue; // drop this comma
    }

    out += ch;
  }

  return out;
}

/* ------------------------------------------------------------------------- */
/* Truncation repair                                                         */
/* ------------------------------------------------------------------------- */

type ContainerKind = '{' | '[';
/** What the container is waiting for next. */
type Expect = 'key' | 'colon' | 'value' | 'comma';

interface Frame {
  kind: ContainerKind;
  expect: Expect;
}

interface SafePoint {
  /** Exclusive end index: `input.slice(0, end)` is a closable JSON prefix. */
  end: number;
  /** The container stack open at that point, outermost first. */
  open: ContainerKind[];
}

const PRIMITIVE_START = /[-\d]|true|false|null/;

/**
 * Scan a JSON prefix and record the last position at which it can be validly
 * closed.
 *
 * A position is "safe" immediately after:
 *   - a container opener (an empty object/array is valid),
 *   - a complete value (string in value position, finished primitive, or a
 *     closed container).
 *
 * It is deliberately *not* safe after an object key or a colon, because closing
 * there would emit `{"key":}`.
 */
function scan(input: string): { safe: SafePoint | null; complete: boolean; endedInStringValue: boolean } {
  const start = input.indexOf('{');
  if (start === -1) return { safe: null, complete: false, endedInStringValue: false };

  const stack: Frame[] = [];
  let safe: SafePoint | null = null;
  let complete = false;
  let inString = false;
  let escaped = false;
  /** True when the string currently open sits in an object-key position. */
  let stringIsKey = false;

  const snapshot = (end: number): SafePoint => ({
    end,
    open: stack.map((f) => f.kind),
  });

  const markSafe = (end: number) => {
    safe = snapshot(end);
  };

  const top = (): Frame | undefined => stack[stack.length - 1];

  let i = start;
  while (i < input.length) {
    const ch = input[i] ?? '';

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        const frame = top();
        if (frame) {
          if (stringIsKey) {
            frame.expect = 'colon';
          } else {
            frame.expect = 'comma';
            markSafe(i + 1);
          }
        }
      }
      i += 1;
      continue;
    }

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '"') {
      const frame = top();
      stringIsKey = frame?.kind === '{' && frame.expect === 'key';
      inString = true;
      i += 1;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push({ kind: ch, expect: ch === '{' ? 'key' : 'value' });
      markSafe(i + 1);
      i += 1;
      continue;
    }

    if (ch === '}' || ch === ']') {
      stack.pop();
      const parent = top();
      if (parent) parent.expect = 'comma';
      markSafe(i + 1);
      if (stack.length === 0) {
        complete = true;
        // Everything after the outermost closer is trailing prose.
        return { safe: snapshot(i + 1), complete, endedInStringValue: false };
      }
      i += 1;
      continue;
    }

    if (ch === ':') {
      const frame = top();
      if (frame) frame.expect = 'value';
      i += 1;
      continue;
    }

    if (ch === ',') {
      const frame = top();
      if (frame) frame.expect = frame.kind === '{' ? 'key' : 'value';
      i += 1;
      continue;
    }

    if (PRIMITIVE_START.test(ch)) {
      // Consume the whole literal, then only accept it if a delimiter follows —
      // a literal running to end-of-input may be a truncated number.
      let j = i;
      while (j < input.length && /[^\s,}\]]/.test(input[j] ?? '')) j += 1;
      const literal = input.slice(i, j);
      const terminated = j < input.length;
      const valid =
        literal === 'true' ||
        literal === 'false' ||
        literal === 'null' ||
        /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(literal);
      if (terminated && valid) {
        const frame = top();
        if (frame) frame.expect = 'comma';
        markSafe(j);
      }
      i = j;
      continue;
    }

    // Anything else is junk; skip it.
    i += 1;
  }

  return {
    safe,
    complete,
    endedInStringValue: inString && !stringIsKey,
  };
}

/** Close an open container stack, innermost first. */
function closeStack(open: ContainerKind[]): string {
  let out = '';
  for (let i = open.length - 1; i >= 0; i -= 1) {
    out += open[i] === '{' ? '}' : ']';
  }
  return out;
}

export interface RecoveryResult {
  value: unknown;
  /** True when the payload had to be repaired to parse. */
  repaired: boolean;
  /** True when the object was truncated and closed synthetically. */
  truncated: boolean;
}

/**
 * Parse model output into a JSON value, repairing where safe.
 * Throws `JsonRecoveryError` only when nothing usable can be recovered.
 */
export function recoverJson(raw: string): RecoveryResult {
  const unfenced = stripFences(raw);

  // Fast path: already valid JSON.
  try {
    return { value: JSON.parse(unfenced), repaired: false, truncated: false };
  } catch {
    // fall through to repair
  }

  const start = unfenced.indexOf('{');
  if (start === -1) {
    throw new JsonRecoveryError('no-object', 'The model response contained no JSON object.');
  }

  const { safe, complete, endedInStringValue } = scan(unfenced);

  const candidates: { text: string; truncated: boolean }[] = [];

  // 1. The exact object span, when the scan found a balanced close.
  if (complete && safe) {
    candidates.push({ text: unfenced.slice(start, safe.end), truncated: false });
  }

  // 2. Truncated mid-string in a value position: close the string, then the stack.
  //    This keeps the partial sentence rather than discarding the whole field.
  if (!complete && endedInStringValue) {
    const reopened = scan(`${unfenced}"`);
    if (reopened.safe) {
      candidates.push({
        text: `${unfenced}"`.slice(start, reopened.safe.end) + closeStack(reopened.safe.open),
        truncated: true,
      });
    }
  }

  // 3. Cut back to the last closable point and balance the stack.
  if (safe) {
    candidates.push({
      text: unfenced.slice(start, safe.end) + closeStack(safe.open),
      truncated: !complete,
    });
  }

  for (const candidate of candidates) {
    for (const text of [candidate.text, stripTrailingCommas(candidate.text)]) {
      try {
        return {
          value: JSON.parse(text),
          repaired: true,
          truncated: candidate.truncated,
        };
      } catch {
        // try the next candidate
      }
    }
  }

  throw new JsonRecoveryError(
    'parse',
    'Could not recover a valid JSON object from the model response.',
  );
}
