import { COORDINATE_LIMIT_MM, ResourceLimitError } from '@leathercad/core';
import { diagnose, evaluate } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { SvgImportError, type SvgElement } from '@leathercad/import';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { historyText } from './historyText.js';
import {
  contentsText,
  densityOf,
  leftOutLines,
  readSvg,
  refusalText,
  svgName,
} from './svgImport.js';

const english = createI18n('en');
const SVG = 'http://www.w3.org/2000/svg';
const el = (
  localName: string,
  attributes: Record<string, string> = {},
  children: SvgElement[] = [],
  namespace = SVG,
): SvgElement => ({
  namespace,
  localName,
  attributes: Object.entries(attributes).map(([name, value]) => ({
    namespace: '',
    localName: name,
    value,
  })),
  children,
});

/** The slice's own drawing: an outline, a window, a fold, a row of holes and some text. */
const cardHolder = (root: Record<string, string>) =>
  el('svg', root, [
    el('rect', { width: '100', height: '60' }),
    el('rect', { x: '15', y: '20', width: '20', height: '20' }),
    el('path', { d: 'M50 0V60' }),
    ...Array.from({ length: 12 }, (_, i) =>
      el('circle', { cx: String(5 + 3.85 * i), cy: '5', r: '0.6' }),
    ),
    el('text'),
  ]);

describe('reading an SVG for the import preview (9.20b)', () => {
  it('one piece with its cut-out and a fold marking, the hole row reported, at true size', () => {
    const reading = readSvg(
      cardHolder({ width: '100mm', height: '60mm', viewBox: '0 0 100 60' }),
      'card',
      null,
    );
    if (reading.kind !== 'read') throw new Error(reading.kind);
    expect(reading.scale).toBe('file');
    expect(reading.pieces.map((p) => p.name)).toEqual(['card']);
    expect(contentsText(reading.pieces, english)).toBe('1 cut-out and 1 marking');
    expect(reading.pattern.likelyHoles).toEqual([
      { count: 12, diameterMm: expect.closeTo(1.2, 9) },
    ]);
    expect(leftOutLines(reading, english)).toEqual(['1 piece of text']);
    expect(diagnose(reading.project)).toEqual([]);
    const outline = evaluate(reading.project).parts[0]?.features[0];
    const box = outline?.ok ? PathOps.bbox(outline.path) : null;
    expect(box && [box.maxX - box.minX, box.maxY - box.minY]).toEqual([
      expect.closeTo(100, 9),
      expect.closeTo(60, 9),
    ]);
  });

  it('regression: a polygon with a repeated point imports with nothing to fix (QA4 F4)', () => {
    // Was "1 error": the repeat read as the outline crossing itself.
    const reading = readSvg(
      el('svg', { width: '60mm', height: '40mm', viewBox: '0 0 60 40' }, [
        el('polygon', { points: '0,0 60,0 60,0 60,40 0,40' }),
      ]),
      'card',
      null,
    );
    if (reading.kind !== 'read') throw new Error(reading.kind);
    expect(diagnose(reading.project)).toEqual([]);
  });

  it.each(['scale(0)', 'matrix(0 0 0 0 0 0)', 'matrix(1 0 0 0 0 0)'])(
    'regression: a piece under %s is reported as enclosing nothing (QA4 F5)',
    (transform) => {
      // Imported as 0.0 × 0.0 mm with nothing to fix.
      const reading = readSvg(
        el('svg', { width: '60mm', height: '40mm', viewBox: '0 0 60 40' }, [
          el('g', { transform }, [el('rect', { width: '10', height: '10' })]),
        ]),
        'card',
        null,
      );
      if (reading.kind !== 'read') throw new Error(reading.kind);
      expect(diagnose(reading.project).map((d) => d.problem.code)).toEqual(['CONTOUR_HAS_NO_AREA']);
    },
  );

  it('asks for a density when the file gives no unit, and reads at the one chosen', () => {
    const tree = cardHolder({ width: '100', height: '60', viewBox: '0 0 100 60' });
    expect(readSvg(tree, 'card', null)).toEqual({ kind: 'needs-density' });
    const at72 = readSvg(tree, 'card', 72);
    if (at72.kind !== 'read') throw new Error(at72.kind);
    expect(at72.scale).toBe(72);
    const outline = evaluate(at72.project).parts[0]?.features[0];
    expect(outline?.ok && PathOps.bbox(outline.path)?.maxX).toBeCloseTo((100 * 25.4) / 72, 9);
  });

  it('names an Inkscape file’s density, and no other', () => {
    const inkscape: SvgElement = {
      ...el('svg'),
      attributes: [
        {
          namespace: 'http://www.inkscape.org/namespaces/inkscape',
          localName: 'version',
          value: '1.3',
        },
      ],
    };
    expect(densityOf(inkscape)).toBe(96);
    expect(densityOf(el('svg'))).toBeNull();
  });

  it('refuses a file it cannot read, as a fact to word', () => {
    const reading = readSvg(
      el('svg', { width: '10mm', height: '10mm' }, [el('path', { d: 'Q' })]),
      'x',
      null,
    );
    expect(reading.kind === 'refused' && reading.error.message).toBe('INVALID_SVG');
  });

  it('numbers the pieces of a file with several', () => {
    const reading = readSvg(
      el('svg', { width: '100mm', height: '100mm', viewBox: '0 0 100 100' }, [
        el('rect', { width: '10', height: '10' }),
        el('rect', { x: '50', width: '10', height: '10' }),
      ]),
      'wallet',
      null,
    );
    expect(reading.kind === 'read' && reading.pieces.map((p) => p.name)).toEqual([
      'wallet 1',
      'wallet 2',
    ]);
  });

  it('names a file by its name alone, on any platform', () => {
    expect(svgName('/home/maker/Card Holder.SVG')).toBe('Card Holder');
    expect(svgName('C:\\patterns\\wallet.svg')).toBe('wallet');
    // A file may be named anything; a piece is not (QA F9).
    expect(svgName('/tmp/Belt\u202egvs.svg')).toBe('Beltgvs');
  });

  it('says the import for Undo', () => {
    expect(historyText({ action: 'import', count: 2 }, english.t)).toBe('Import 2 pieces');
  });
});

describe('an untrusted file, in the maker’s words (9.20c)', () => {
  it('what a pattern never needs is listed by kind, with what became of it', () => {
    const reading = readSvg(
      el('svg', { width: '100mm', height: '100mm', viewBox: '0 0 100 100' }, [
        el('rect', { width: '50', height: '50' }),
        el('script'),
        el('script'),
        el('image', { href: 'https://example.com/a.png' }),
        el('defs', {}, [el('clipPath')]),
      ]),
      'x',
      null,
    );
    if (reading.kind !== 'read') throw new Error(reading.kind);
    expect(leftOutLines(reading, english)).toEqual([
      '2 scripts, not run',
      '1 image, not loaded',
      '1 “defs” element',
      '1 clip, not applied: what it hid arrives whole',
    ]);
  });

  it('each refusal says what was refused, by its cause', () => {
    const said = (error: SvgImportError | ResourceLimitError) => refusalText(error, english);
    expect(said(new SvgImportError('UNSAFE_SVG'))).toContain('could reach other files');
    expect(said(new ResourceLimitError('svgBytes', 1))).toBe(
      'This file is larger than 32 MB, the most LeatherCAD imports.',
    );
    expect(said(new ResourceLimitError('svgExpandedBytes', 1))).toContain('past 32 MB');
    expect(said(new ResourceLimitError('segments', 1))).toContain(
      'more than 250,000 path segments',
    );
    expect(said(new ResourceLimitError('svgShapeTests', 1))).toBe(
      'This drawing has too many shapes to sort into pieces.',
    );
    expect(said(new ResourceLimitError('nodes', 1))).toContain('500,000 elements');
  });
});

describe('what a project cannot hold is refused in the preview, before it is drawn (QA3)', () => {
  const drawing = (...children: SvgElement[]) =>
    el('svg', { width: '1000mm', height: '1000mm', viewBox: '0 0 1000 1000' }, children);
  const refusal = (reading: ReturnType<typeof readSvg>): string => {
    if (reading.kind !== 'refused') throw new Error(reading.kind);
    return refusalText(reading.error, english);
  };

  it('a thousand small pieces, whose names pass the characters a project holds (F3)', () => {
    const shapes = Array.from({ length: 1000 }, (_, i) =>
      el('rect', {
        x: String((i % 40) * 4),
        y: String(Math.floor(i / 40) * 4),
        width: '2',
        height: '2',
      }),
    );
    const reading = readSvg(drawing(...shapes), 'small shapes', null);
    expect(reading).toMatchObject({ kind: 'refused', error: { resource: 'characters' } });
    expect(refusal(reading)).toBe(
      'This drawing is too large to import: its pieces and their names come to more than 20,000 characters.',
    );
  });

  it('a piece past the coordinate limit, by its size, its place or a transform, names the limit (F2, F7)', () => {
    for (const shape of [
      el('rect', { width: '150000', height: '10' }),
      el('rect', { width: '1e300', height: '10' }),
      el('rect', { width: '10', height: '10', transform: 'scale(1e300)' }),
    ]) {
      const reading = readSvg(drawing(shape), 'big', null);
      expect(reading).toMatchObject({ kind: 'refused', error: { code: 'BEYOND_LIMIT' } });
      expect(refusal(reading)).toBe(
        `This drawing is too large to import: it reaches more than ${new Intl.NumberFormat('en').format(COORDINATE_LIMIT_MM)} mm from its origin, farther than a project holds.`,
      );
    }
  });

  it('a piece within the limit that no paper could print, as the import would be refused (F7)', () => {
    const reading = readSvg(drawing(el('rect', { width: '50000', height: '50000' })), 'big', null);
    expect(reading).toMatchObject({ kind: 'refused', error: { resource: 'pages' } });
    expect(refusal(reading)).toBe(
      'This drawing is too large to import: printed at 1:1 it would take more than 1,000 sheets.',
    );
  });
});
