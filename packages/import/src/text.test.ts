import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RESOURCE_LIMITS, ResourceLimitError } from '@leathercad/core';
import { SvgImportError } from './numbers.js';
import { expandedLength, svgText } from './text.js';

/**
 * ADR 0023 steps 2–4, the hostile-file corpus's pure half (9.20c): bytes
 * bounded before anything reads them, decoded strictly, and the entities
 * checked before the parser sees them. The parser's half is
 * `e2e/svg-untrusted.spec.ts`.
 */

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const svg = (doctype: string, body = '<svg xmlns="http://www.w3.org/2000/svg"/>'): string =>
  `<?xml version="1.0"?>\n${doctype}\n${body}`;
const refused = (bytes: Uint8Array): unknown => {
  try {
    svgText(bytes);
  } catch (error) {
    return error;
  }
  throw new Error('accepted');
};
const code = (bytes: Uint8Array): string => {
  const error = refused(bytes);
  if (!(error instanceof SvgImportError)) throw error;
  return error.code;
};
const resource = (bytes: Uint8Array): string => {
  const error = refused(bytes);
  if (!(error instanceof ResourceLimitError)) throw error;
  return error.resource;
};

describe('the bytes are bounded before anything reads them (ADR 0023 step 2)', () => {
  it('a file one byte over 32 MiB is refused by its length, not its content', () => {
    // Not UTF-8 either: the length decides first.
    const bytes = new Uint8Array(RESOURCE_LIMITS.svgBytes + 1).fill(0xff);
    expect(resource(bytes)).toBe('svgBytes');
  });

  it('a file at the ceiling is read', () => {
    const text = svg('', `<svg xmlns="http://www.w3.org/2000/svg"><!--`);
    const bytes = new Uint8Array(RESOURCE_LIMITS.svgBytes).fill(0x20);
    bytes.set(utf8(text));
    expect(svgText(bytes).length).toBe(RESOURCE_LIMITS.svgBytes);
  });
});

describe('the bytes are decoded strictly (ADR 0023 step 3)', () => {
  it('invalid UTF-8 is refused, not replaced', () => {
    expect(code(new Uint8Array([...utf8('<svg>'), 0xc3, 0x28]))).toBe('INVALID_SVG');
  });

  it('a byte-order mark names UTF-8 or UTF-16, either way round', () => {
    const text = svg('', '<svg xmlns="http://www.w3.org/2000/svg"><title>ŁÓDŹ</title></svg>');
    const le = new Uint8Array(2 + text.length * 2),
      be = new Uint8Array(2 + text.length * 2);
    le.set([0xff, 0xfe]);
    be.set([0xfe, 0xff]);
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      le.set([unit & 0xff, unit >> 8], 2 + 2 * i);
      be.set([unit >> 8, unit & 0xff], 2 + 2 * i);
    }
    expect(svgText(le)).toBe(text);
    expect(svgText(be)).toBe(text);
    expect(svgText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(text)]))).toBe(text);
  });

  it('the XML declaration names another encoding the platform knows', () => {
    const head = utf8('<?xml version="1.0" encoding="ISO-8859-2"?><svg id="');
    const tail = utf8('"/>');
    // 0xA3 is Ł in Latin-2 and an invalid lone byte in UTF-8.
    expect(svgText(new Uint8Array([...head, 0xa3, ...tail]))).toBe(
      '<?xml version="1.0" encoding="ISO-8859-2"?><svg id="Ł"/>',
    );
  });

  it('an encoding the platform does not know is refused as unsupported', () => {
    expect(code(utf8('<?xml version="1.0" encoding="x-no-such-thing"?><svg/>'))).toBe(
      'UNSUPPORTED_SVG',
    );
  });
});

describe('the entities are checked before the parser sees them (ADR 0023 step 4)', () => {
  it('older Illustrator files, which declare their namespaces as entities, still read', () => {
    const text = svg(
      `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
	<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
	<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
	<!ENTITY st0 'fill:none;stroke:#000000;'>
	<!-- <!ENTITY x SYSTEM "file:///etc/passwd"> in a comment declares nothing -->
	<?ai processing instruction ]> ?>
]>`,
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;"><path style="&st0;" d="M0 0L1 1"/></svg>',
    );
    expect(svgText(utf8(text))).toBe(text);
  });

  it('a document type whose external identifier holds brackets and angle brackets', () => {
    const text = svg('<!DOCTYPE svg SYSTEM "odd]>[name.dtd">');
    expect(svgText(utf8(text))).toBe(text);
  });

  it('an external entity, by SYSTEM, PUBLIC or NDATA, is refused', () => {
    for (const declaration of [
      '<!ENTITY x SYSTEM "file:///etc/passwd">',
      `<!ENTITY x PUBLIC "-//X//EN" 'http://example.com/x'>`,
      '<!ENTITY x SYSTEM "a.gif" NDATA gif>',
    ])
      expect(code(utf8(svg(`<!DOCTYPE svg [${declaration}]>`, '<svg>&x;</svg>')))).toBe(
        'UNSAFE_SVG',
      );
  });

  it('a parameter entity, which writes further declarations, is refused', () => {
    expect(
      code(utf8(svg(`<!DOCTYPE svg [<!ENTITY % p "<!ENTITY x 'y'>"> %p;]>`, '<svg>&x;</svg>'))),
    ).toBe('UNSAFE_SVG');
  });

  it('a long run of spaces after <!ENTITY is refused in one pass, not backtracked over', () => {
    // CodeQL js/polynomial-redos: `\s+` beside `\s*` made this quadratic in the run's length,
    // a frozen window long before the 32 MiB ceiling.
    const run = ' '.repeat(200_000);
    expect(code(utf8(svg(`<!DOCTYPE svg [<!ENTITY${run}`)))).toBe('INVALID_SVG');
    expect(code(utf8(svg(`<!DOCTYPE svg [<!ENTITY${run}%${run}`)))).toBe('INVALID_SVG');
  });

  it('an entity name and a parameter entity percent sign may sit in any whitespace', () => {
    const text = svg(`<!DOCTYPE svg [<!ENTITY\n\t x \r\n"y">]>`, '<svg>&x;</svg>');
    expect(svgText(utf8(text))).toBe(text);
    expect(code(utf8(svg(`<!DOCTYPE svg [<!ENTITY \n%\t p "y">]>`)))).toBe('UNSAFE_SVG');
  });

  it('an attribute default, which every element would carry, is refused', () => {
    expect(
      code(utf8(svg(`<!DOCTYPE svg [<!ENTITY a "aaaa"><!ATTLIST rect id CDATA "&a;">]>`))),
    ).toBe('UNSAFE_SVG');
  });

  it('an entity that refers to itself, directly or through others, is refused', () => {
    expect(code(utf8(svg(`<!DOCTYPE svg [<!ENTITY a "&a;">]>`, '<svg>&a;</svg>')))).toBe(
      'INVALID_SVG',
    );
    expect(
      code(
        utf8(
          svg(
            `<!DOCTYPE svg [<!ENTITY a "x&b;"><!ENTITY b "&c;"><!ENTITY c "&#38;a;">]>`,
            '<svg>&a;</svg>',
          ),
        ),
      ),
    ).toBe('INVALID_SVG');
  });

  it('billion laughs is refused by its expansion, without expanding it', () => {
    const levels = Array.from(
      { length: 9 },
      (_, i) => `<!ENTITY lol${String(i + 1)} "${`&lol${String(i)};`.repeat(10)}">`,
    );
    const text = svg(
      `<!DOCTYPE svg [<!ENTITY lol0 "lol">${levels.join('')}]>`,
      '<svg xmlns="http://www.w3.org/2000/svg"><title>&lol9;</title></svg>',
    );
    expect(resource(utf8(text))).toBe('svgExpandedBytes');
  });

  it('one 50 kB entity referenced 50,000 times — quadratic expansion — is refused at once', () => {
    const text = svg(
      `<!DOCTYPE svg [<!ENTITY big "${'x'.repeat(50_000)}">]>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><title>${'&big;'.repeat(50_000)}</title></svg>`,
    );
    const started = performance.now();
    expect(resource(utf8(text))).toBe('svgExpandedBytes');
    // The measured parser took 12.5 s; this check is a linear scan.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('a character reference that spells an entity reference is counted as one', () => {
    // `&#38;` is `&`, replaced when the entity is declared: `&b;` is a reference.
    const text = svg(
      `<!DOCTYPE svg [<!ENTITY b "${'x'.repeat(1000)}"><!ENTITY a "&#38;b;&#x26;b;">]>`,
      '<svg>&a;</svg>',
    );
    expect(expandedLength(text)).toBe(text.length - '&a;'.length + 2000);
  });

  it('the expansion is computed exactly: the length of the document as the parser expands it', () => {
    // Entities in a chain, each referring only to those declared before it,
    // so no cycle; expanded naively here, which only small inputs allow.
    const entity = (i: number) => `e${String(i)}`;
    const value = (count: number) =>
      fc.array(
        fc.oneof(
          fc.constantFrom('a', 'bc', ' ', '&amp;', '&#65;'),
          ...(count > 0 ? [fc.nat(count - 1).map((i) => `&${entity(i)};`)] : []),
        ),
        { maxLength: 4 },
      );
    const arbitrary = fc.nat(5).chain((count) =>
      fc.record({
        values: fc.tuple(...Array.from({ length: count }, (_, i) => value(i))),
        body: value(count),
      }),
    );
    fc.assert(
      fc.property(arbitrary, ({ values, body }) => {
        const declarations = values
          .map((parts, i) => `<!ENTITY ${entity(i)} "${parts.join('')}">`)
          .join('');
        const text = svg(`<!DOCTYPE svg [${declarations}]>`, `<svg>${body.join('')}</svg>`);
        const replacement = values.map((parts) =>
          parts.join('').replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))),
        );
        const expand = (s: string): string =>
          s.replace(/&e(\d+);/g, (_, i: string) => expand(replacement[Number(i)] ?? ''));
        const doctypeEnd = text.indexOf(']>') + 2;
        const expected = doctypeEnd + expand(text.slice(doctypeEnd)).length;
        expect(expandedLength(text)).toBe(expected);
      }),
    );
  });

  it('a document with no document type is its own length', () => {
    const text = svg('', '<svg>&amp;&lt;</svg>');
    expect(expandedLength(text)).toBe(text.length);
  });
});
