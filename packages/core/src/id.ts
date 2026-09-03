/**
 * ULIDs for every entity in a document.
 *
 * Chosen over UUIDv4 because they sort lexicographically by creation time,
 * which makes document ordering stable and diffs readable without a separate
 * ordering field.
 *
 * Implemented here rather than taken as a dependency for one reason: the
 * entropy and clock must be injectable. Golden fixtures, byte-stable saves and
 * document round-trip tests all need reproducible ids, and libraries generally
 * reach for the global clock. See docs/testing.md §8.
 */

/**
 * Crockford base32: no I, L, O or U, so an id cannot be misread aloud or
 * mistyped into something else valid.
 */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
const BITS_PER_CHAR = 32;
const MAX_DIGIT = BITS_PER_CHAR - 1;

/** 48 bits of milliseconds — good until the year 10889. */
const MAX_TIME_MS = 2 ** 48 - 1;

export type Ulid = string;

/**
 * The clock and entropy a factory draws on. Tests supply a scripted one;
 * `systemIdSource` in @leathercad/platform supplies the real one.
 */
export interface IdSource {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  randomBytes(count: number): Uint8Array;
}

/**
 * Builds an id generator.
 *
 * The generator is monotonic: two ids made in the same millisecond, or after
 * the clock steps backwards, still sort in creation order. Without that, ids
 * from a single burst would sort by their random component — which is to say,
 * arbitrarily — and a document's entity order would depend on how fast the
 * machine was.
 */
export function createIdFactory(source: IdSource): () => Ulid {
  let lastMs = -1;
  let lastDigits: number[] = [];

  return function nextId(): Ulid {
    const now = source.now();
    if (!Number.isInteger(now) || now < 0 || now > MAX_TIME_MS) {
      throw new RangeError(
        `ULID timestamp must be an integer in [0, ${MAX_TIME_MS}], received ${String(now)}`,
      );
    }

    if (now > lastMs) {
      lastMs = now;
      lastDigits = randomDigits(source);
    } else if (!incrementDigits(lastDigits)) {
      // The random component wrapped. Roll the timestamp forward and draw
      // fresh randomness rather than failing: monotonicity is preserved
      // because the time went up, and nobody should lose work to an entropy
      // edge case. Self-correcting — the next call with a real clock reading
      // ahead of this resets it.
      lastMs += 1;
      if (lastMs > MAX_TIME_MS) {
        throw new RangeError('ULID timestamp overflowed 48 bits');
      }
      lastDigits = randomDigits(source);
    }
    // Otherwise: same millisecond, or the clock moved backwards (NTP steps and
    // suspend/resume both do that). The increment above keeps ids unique and
    // ordered without trusting the clock.

    return encodeTime(lastMs) + digitsToString(lastDigits);
  };
}

function randomDigits(source: IdSource): number[] {
  const bytes = source.randomBytes(RANDOM_CHARS);
  if (bytes.length < RANDOM_CHARS) {
    throw new Error(`IdSource.randomBytes returned ${bytes.length} bytes, need ${RANDOM_CHARS}`);
  }

  const digits: number[] = new Array<number>(RANDOM_CHARS);
  for (let i = 0; i < RANDOM_CHARS; i++) {
    // 256 is a whole multiple of 32, so masking the low five bits stays uniform.
    digits[i] = (bytes[i] ?? 0) & MAX_DIGIT;
  }
  return digits;
}

/** Increments in place. Returns false if every digit was already at its max. */
function incrementDigits(digits: number[]): boolean {
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits[i] ?? 0;
    if (digit < MAX_DIGIT) {
      digits[i] = digit + 1;
      return true;
    }
    digits[i] = 0;
  }
  return false;
}

function encodeTime(ms: number): string {
  let out = '';
  let remaining = ms;
  for (let i = 0; i < TIME_CHARS; i++) {
    out = (CROCKFORD_ALPHABET[remaining % BITS_PER_CHAR] ?? '0') + out;
    remaining = Math.floor(remaining / BITS_PER_CHAR);
  }
  return out;
}

function digitsToString(digits: readonly number[]): string {
  let out = '';
  for (const digit of digits) out += CROCKFORD_ALPHABET[digit] ?? '0';
  return out;
}
