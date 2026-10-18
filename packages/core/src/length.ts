import { MINUS } from './format.js';
import { err, ok, type Result } from './result.js';

/** An inch, by definition (1959): exactly 25.4 mm. */
export const MM_PER_INCH = 25.4;

/**
 * Why a typed size could not be read — facts, which the app words (ADR 0018).
 *
 * - `syntax`: not a sum this reads — a missing number, a stray symbol, an
 *   unclosed parenthesis.
 * - `unit`: a word that is not one of mm, cm, in or `"`; `unit` is the word.
 * - `mixed`: a sum where some numbers have a unit and some do not. `3-1/2"`
 *   is 3½ inches in American notation and 3 mm less half an inch as a sum;
 *   either guess would store a wrong size without a word, so neither is made.
 * - `notALength`: it reads, but comes to an area or a ratio — a unit on what
 *   already has one, a length times a length, a division by a length.
 * - `notFinite`: it comes to no number at all: a division by zero, or digits
 *   past what a number holds.
 */
export type LengthError =
  | { readonly kind: 'syntax' }
  | { readonly kind: 'unit'; readonly unit: string }
  | { readonly kind: 'mixed' }
  | { readonly kind: 'notALength' }
  | { readonly kind: 'notFinite' };

const UNITS: Readonly<Record<string, number>> = {
  mm: 1,
  cm: 10,
  in: MM_PER_INCH,
  '"': MM_PER_INCH,
};

/** Deeper than any sum a person types; a guard against the stack, not a rule. */
const MAX_DEPTH = 64;

/** A value as it is worked out: a length, or a plain number (a count, a ratio). */
interface Quantity {
  readonly mm: number;
  readonly length: boolean;
}

/** Thrown inside the parser only; `parseLength` turns it into a `Result`. */
class Refusal {
  constructor(readonly error: LengthError) {}
}

/**
 * A size as a maker types it, in millimetres (R-12, U.15): `95`, `95-2*3.5`,
 * `3.75in`, `9,5 cm`, `1/2"`.
 *
 * - `+ − * /` and parentheses, in the usual order; either minus, and a decimal
 *   comma as well as a point, as `parseNumber` reads them — so every number
 *   `parseNumber` reads, this reads the same.
 * - A unit — mm, cm, in or `"`, in any case — applies to everything multiplied
 *   or divided before it in its term, so `1/2in` is half an inch and `2*3.5mm`
 *   is 7 mm; what follows it scales the length (`10cm/2`).
 * - A number with no unit is millimetres — but a sum gives every number a
 *   unit or none (`mixed`), and a count or a scale multiplies or divides.
 *
 * Not quantised: the field that stores it does that (CLAUDE.md invariant 8).
 */
export function parseLength(text: string): Result<number, LengthError> {
  try {
    const parser = new Parser(text);
    const { mm } = parser.whole();
    return Number.isFinite(mm) ? ok(mm) : err({ kind: 'notFinite' });
  } catch (thrown) {
    if (thrown instanceof Refusal) return err(thrown.error);
    throw thrown;
  }
}

class Parser {
  private at = 0;
  private depth = 0;
  // Sticky, and the parser's own: a module-wide one would carry its
  // `lastIndex` from one call to the next.
  private readonly number = /\d+(?:[.,]\d*)?|[.,]\d+/y;
  private readonly unitWord = /[a-z]+|"/iy;

  constructor(private readonly text: string) {}

  whole(): Quantity {
    const value = this.sum();
    this.skipSpace();
    if (this.at < this.text.length) throw new Refusal({ kind: 'syntax' });
    return value;
  }

  /** term (('+' | '−') term)* — every term a length, or none. */
  private sum(): Quantity {
    let value = this.term();
    for (;;) {
      const op = this.peek();
      if (op !== '+' && op !== '-') return value;
      this.at += 1;
      const next = this.term();
      if (next.length !== value.length) throw new Refusal({ kind: 'mixed' });
      value = {
        mm: op === '+' ? value.mm + next.mm : value.mm - next.mm,
        length: value.length || next.length,
      };
    }
  }

  /** factor (('*' | '/') factor | unit)* — a unit takes what came before it. */
  private term(): Quantity {
    let value = this.factor();
    for (;;) {
      const op = this.peek();
      if (op === '*' || op === '/') {
        this.at += 1;
        const next = this.factor();
        if (op === '*') {
          if (value.length && next.length) throw new Refusal({ kind: 'notALength' });
          value = { mm: value.mm * next.mm, length: value.length || next.length };
        } else {
          if (next.length) throw new Refusal({ kind: 'notALength' });
          value = { mm: value.mm / next.mm, length: value.length };
        }
        continue;
      }
      const unit = this.word();
      if (unit === null) return value;
      const scale = UNITS[unit.toLowerCase()];
      if (scale === undefined) throw new Refusal({ kind: 'unit', unit });
      if (value.length) throw new Refusal({ kind: 'notALength' });
      value = { mm: value.mm * scale, length: true };
    }
  }

  /** ('+' | '−') factor | number | '(' sum ')' */
  private factor(): Quantity {
    const next = this.peek();
    if (next === '+' || next === '-') {
      this.at += 1;
      const value = this.factor();
      return next === '-' ? { mm: -value.mm, length: value.length } : value;
    }
    if (next === '(') {
      this.depth += 1;
      if (this.depth > MAX_DEPTH) throw new Refusal({ kind: 'syntax' });
      this.at += 1;
      const value = this.sum();
      if (this.peek() !== ')') throw new Refusal({ kind: 'syntax' });
      this.at += 1;
      this.depth -= 1;
      return value;
    }
    this.number.lastIndex = this.at;
    const match = this.number.exec(this.text);
    if (match === null) throw new Refusal({ kind: 'syntax' });
    this.at = this.number.lastIndex;
    return { mm: Number.parseFloat(match[0].replace(',', '.')), length: false };
  }

  /** The next symbol after any space, with either minus read as `-`. */
  private peek(): string | undefined {
    this.skipSpace();
    const char = this.text[this.at];
    return char === MINUS ? '-' : char;
  }

  /** A unit's word at this point, consumed, or `null`. */
  private word(): string | null {
    this.skipSpace();
    this.unitWord.lastIndex = this.at;
    const match = this.unitWord.exec(this.text);
    if (match === null) return null;
    this.at = this.unitWord.lastIndex;
    return match[0];
  }

  private skipSpace(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at] ?? '')) this.at += 1;
  }
}
