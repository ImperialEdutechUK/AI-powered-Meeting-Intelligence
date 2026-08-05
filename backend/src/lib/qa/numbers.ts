/**
 * English number-word to digit conversion.
 *
 * The transcriber writes "one thousand nine hundred"; the brief writes "1,900".
 * To verify the brief's figures against the transcript we convert the words in
 * the transcript to digits and compare canonical forms.
 *
 * Scope is deliberately bounded to what meeting dialogue actually contains:
 * cardinals and ordinals up to the billions, plus "a hundred"/"a thousand".
 */

const UNITS: Record<string, number> = {
  zero: 0,
  nought: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const ORDINAL_UNITS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  sixtieth: 60,
  seventieth: 70,
  eightieth: 80,
  ninetieth: 90,
  hundredth: 100,
  thousandth: 1000,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40, // common transcriber misspelling
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  k: 1_000,
};

const JOINERS = new Set(['and', '-', 'a', 'an']);

/**
 * Maximum number words considered as one quantity. Bounds the shrink-and-retry
 * search so `spelledNumbers` stays linear in the document length — see the note
 * at its call site.
 */
const MAX_RUN_WORDS = 14;

function isNumberWord(word: string): boolean {
  return (
    word in UNITS ||
    word in TENS ||
    word in SCALES ||
    word in ORDINAL_UNITS ||
    JOINERS.has(word)
  );
}

/**
 * What the previous meaningful token contributed. Tracking this is what lets us
 * accept "thirty four" (ten then unit = 34) while rejecting "nine five" (two
 * adjacent units, which is two separate numbers).
 */
type LastKind = 'none' | 'unit' | 'ten' | 'scale';

/**
 * Evaluate a run of number words. Returns null when the run does not resolve to
 * a single value — a stray "and", a bare "a", a bare "hundred", or two units in
 * a row.
 */
function evaluateRun(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let sawValue = false;
  let pendingImplicitOne = false;
  let last: LastKind = 'none';

  for (const word of words) {
    if (word === 'and' || word === '-') continue;

    if (word === 'a' || word === 'an') {
      // Only meaningful directly before a scale word: "a hundred" is 100.
      if (sawValue) return null;
      pendingImplicitOne = true;
      continue;
    }

    const scale = SCALES[word];
    if (scale !== undefined) {
      if (current === 0) {
        if (!pendingImplicitOne && !sawValue) return null; // bare "hundred"
        current = 1;
      }
      if (scale === 100) {
        current *= 100;
      } else {
        total += current * scale;
        current = 0;
      }
      sawValue = true;
      pendingImplicitOne = false;
      last = 'scale';
      continue;
    }

    const ten = TENS[word];
    if (ten !== undefined) {
      // "five twenty" / "twenty thirty" are not one number.
      if (last === 'unit' || last === 'ten') return null;
      current += ten;
      sawValue = true;
      pendingImplicitOne = false;
      last = 'ten';
      continue;
    }

    const unit = UNITS[word] ?? ORDINAL_UNITS[word];
    if (unit !== undefined) {
      // A unit may follow nothing, a tens word, or a scale — never another unit.
      if (last === 'unit') return null;
      // "twenty fifteen" is a year read aloud, not 35.
      if (last === 'ten' && unit >= 10) return null;
      current += unit;
      sawValue = true;
      pendingImplicitOne = false;
      last = 'unit';
      continue;
    }

    return null;
  }

  // A trailing "a" with nothing after it is not a number.
  if (!sawValue || pendingImplicitOne) return null;
  const value = total + current;
  return Number.isFinite(value) ? value : null;
}

/**
 * Find every spelled-out number in a text and return the numeric values.
 * Runs of number words are evaluated greedily, then progressively shortened if
 * the whole run does not resolve — so "nine five" yields 9 and 5.
 */
export function spelledNumbers(text: string): number[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s]+/)
    .filter(Boolean);

  const found: number[] = [];
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    if (word === undefined || !isNumberWord(word)) {
      i += 1;
      continue;
    }
    // A run may only *begin* on a joiner when it is "a"/"an" before a scale
    // word, as in "a hundred". Otherwise skip the joiner.
    if (JOINERS.has(word)) {
      const isImplicitOne =
        (word === 'a' || word === 'an') && (words[i + 1] ?? '') in SCALES;
      if (!isImplicitOne) {
        i += 1;
        continue;
      }
    }

    /*
     * The run window is capped. Without a cap, a transcript made of adjacent
     * number words ("one one one one …") gives a run as long as the document,
     * and the shrink-and-retry loop below becomes cubic in the document length —
     * enough to hang the request. The longest number anyone says aloud is around
     * eleven words ("two hundred and thirty four thousand five hundred and sixty
     * seven"), so 14 loses nothing real and makes the whole function linear.
     */
    const windowEnd = Math.min(words.length, i + MAX_RUN_WORDS);
    let end = i;
    while (end < windowEnd && isNumberWord(words[end] ?? '')) end += 1;

    // Trim trailing joiners from the run.
    while (end > i && JOINERS.has(words[end - 1] ?? '')) end -= 1;

    let resolvedTo = -1;
    for (let stop = end; stop > i; stop -= 1) {
      const value = evaluateRun(words.slice(i, stop));
      if (value !== null) {
        found.push(value);
        resolvedTo = stop;
        break;
      }
    }

    i = resolvedTo > i ? resolvedTo : i + 1;
  }

  return found;
}

/**
 * Canonical form for comparing two numeric strings.
 * "1,900" / "1900" / "1 900" all become "1900"; "12.50" stays "12.5".
 */
export function canonicalNumber(raw: string): string | null {
  const cleaned = raw
    .replace(/[\s, ]/g, '')
    .replace(/^[£$€+~<>]+/, '')
    .replace(/[+%]+$/, '');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // Normalise 12.0 -> 12, 12.50 -> 12.5
  return String(value);
}

/** Every numeric literal in a string, as canonical forms. */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  // Digits with optional thousands separators and decimals.
  const re = /\d+(?:[.,  ]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?/g;
  for (const match of text.matchAll(re)) {
    const canonical = canonicalNumber(match[0]);
    if (canonical !== null) out.push(canonical);
  }
  return out;
}

/**
 * A set of canonical numbers considered "attested" by the given source text:
 * every digit literal, plus every spelled-out number converted to digits, plus
 * a few derived forms (percent halves, ordinal suffixes) that mean the same
 * quantity.
 */
export function buildNumberIndex(sources: string[]): Set<string> {
  const index = new Set<string>();
  for (const source of sources) {
    for (const canonical of extractNumbers(source)) index.add(canonical);
    for (const value of spelledNumbers(source)) index.add(String(value));
  }
  return index;
}

/**
 * Numbers that never need attestation: small integers used as counts of things
 * the brief itself enumerates, years, and single digits that appear as list
 * markers or ordinals.
 */
export function isTriviallyAttested(canonical: string): boolean {
  const value = Number(canonical);
  if (!Number.isFinite(value)) return true;
  // Single digits are almost always structural ("phase 1", "2-3 sentences").
  if (Number.isInteger(value) && value >= 0 && value <= 9) return true;
  // Plausible calendar years.
  if (Number.isInteger(value) && value >= 1990 && value <= 2100) return true;
  return false;
}
