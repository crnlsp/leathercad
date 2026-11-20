import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { wrapLines } from './wrapLines.js';

/** A monospaced measure: one unit a character, spaces included. */
const mono = (text: string): number => text.length;

const words = fc.array(fc.stringMatching(/^[A-Za-z0-9°·–,]{1,12}$/), {
  minLength: 1,
  maxLength: 12,
});
const widths = fc.integer({ min: 0, max: 60 });

describe('wrapLines', () => {
  it('keeps every word, in order: the lines joined by spaces are the text', () => {
    fc.assert(
      fc.property(words, widths, (list, width) => {
        const text = list.join(' ');
        expect(wrapLines(text, width, mono).join(' ')).toBe(text);
      }),
    );
  });

  it('fits every line in the width, unless it is one word wider than it', () => {
    fc.assert(
      fc.property(words, widths, (list, width) => {
        for (const line of wrapLines(list.join(' '), width, mono)) {
          expect(mono(line) <= width || !line.includes(' ')).toBe(true);
        }
      }),
    );
  });

  it('breaks only where it must: the next line’s first word would not fit on the line before', () => {
    fc.assert(
      fc.property(words, widths, (list, width) => {
        const lines = wrapLines(list.join(' '), width, mono);
        for (let i = 1; i < lines.length; i++) {
          const first = lines[i]!.split(' ')[0]!;
          expect(mono(`${lines[i - 1]!} ${first}`)).toBeGreaterThan(width);
        }
      }),
    );
  });

  it('is one line when the text fits, and for an empty text', () => {
    expect(wrapLines('Pocket, turned 90°', 100, mono)).toEqual(['Pocket, turned 90°']);
    expect(wrapLines('', 0, mono)).toEqual(['']);
  });

  it('wraps a caption wider than its sheet at its spaces', () => {
    expect(wrapLines('Outer panel, Pocket, turned 90°', 14, mono)).toEqual([
      'Outer panel,',
      'Pocket, turned',
      '90°',
    ]);
  });
});
