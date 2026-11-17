import { diagnose, evaluate } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import type { SvgElement } from '@leathercad/import';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { historyText } from './historyText.js';
import { contentsText, densityOf, leftOutLines, readSvg, svgName } from './svgImport.js';

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
    expect(leftOutLines(reading, english)).toEqual(['1 “text” element']);
    expect(diagnose(reading.project)).toEqual([]);
    const outline = evaluate(reading.project).parts[0]?.features[0];
    const box = outline?.ok ? PathOps.bbox(outline.path) : null;
    expect(box && [box.maxX - box.minX, box.maxY - box.minY]).toEqual([
      expect.closeTo(100, 9),
      expect.closeTo(60, 9),
    ]);
  });

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
  });

  it('says the import for Undo', () => {
    expect(historyText({ action: 'import', count: 2 }, english.t)).toBe('Import 2 pieces');
  });
});
