export class SvgImportError extends Error {
  constructor(readonly code: 'INVALID_SVG' | 'SCALE_REQUIRED' | 'UNSUPPORTED_SVG') {
    super(code);
  }
}

const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
/** SVG's number grammar, including adjacent signed numbers and exponents. */
export class Numbers {
  private rest: string;
  constructor(text: string) {
    this.rest = text.trim();
  }
  get done(): boolean {
    return this.rest.length === 0;
  }
  get command(): boolean {
    return /^[a-z]/i.test(this.rest);
  }
  letter(): string {
    const c = this.rest[0];
    if (!c) throw new SvgImportError('INVALID_SVG');
    this.rest = this.rest.slice(1).trimStart();
    return c;
  }
  number(flag = false): number {
    const match = flag ? /^[01]/.exec(this.rest) : numberPattern.exec(this.rest);
    if (!match) throw new SvgImportError('INVALID_SVG');
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new SvgImportError('INVALID_SVG');
    this.rest = this.rest.slice(match[0].length).trimStart();
    if (this.rest.startsWith(',')) {
      this.rest = this.rest.slice(1).trimStart();
      if (this.done || this.command) throw new SvgImportError('INVALID_SVG');
    }
    return value;
  }
}
export function numbers(text: string): number[] {
  const reader = new Numbers(text);
  const result: number[] = [];
  while (!reader.done) result.push(reader.number());
  return result;
}
