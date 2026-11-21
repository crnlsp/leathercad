import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cleanName } from './name.js';

/** C0 controls, DEL, and the bidi embeddings, overrides and isolates. */
// eslint-disable-next-line no-control-regex -- the control characters are what it finds
const UNSAFE = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

describe('cleanName', () => {
  it('drops the controls and the right-to-left override the QA run stored (QA F9)', () => {
    expect(cleanName('Proj A\u0000B\u0007C\u001bD\u202eE')).toBe('Proj ABCDE');
  });

  it('turns a tab or a line break into a space, so two words stay two', () => {
    expect(cleanName('Wallet\tfront')).toBe('Wallet front');
    expect(cleanName('Wallet\r\nfront')).toBe('Wallet  front');
  });

  it('drops every bidi embedding, override and isolate', () => {
    expect(cleanName('a\u202ab\u202bc\u202cd\u202de\u2066f\u2067g\u2068h\u2069i')).toBe(
      'abcdefghi',
    );
  });

  it('keeps right-to-left words, accents, emoji and spaces as they are', () => {
    for (const name of ['محفظة', 'Portefeuille à cartes', 'Кошелёк', '👛 wallet ', '  '])
      expect(cleanName(name)).toBe(name);
  });

  it('leaves nothing unsafe, and is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const clean = cleanName(text);
        return !UNSAFE.test(clean) && cleanName(clean) === clean;
      }),
    );
  });

  it('changes nothing in a name that holds nothing unsafe', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        fc.pre(!UNSAFE.test(text));
        return cleanName(text) === text;
      }),
    );
  });
});
