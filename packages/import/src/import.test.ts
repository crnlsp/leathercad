import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EPS_POINT } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  EXPORT_TOLERANCE_MM,
  apply,
  compose,
  MatOps,
} from '@leathercad/geometry';
import { importSvg, type SvgElement } from './index.js';
import { readPath } from './path.js';
import { readTransform } from './transform.js';
const element = (
  localName: string,
  attributes: Record<string, string> = {},
  children: SvgElement[] = [],
): SvgElement => ({
  namespace: 'http://www.w3.org/2000/svg',
  localName,
  attributes: Object.entries(attributes).map(([localName, value]) => ({
    namespace: '',
    localName,
    value,
  })),
  children,
});
const root = (
  attributes: Record<string, string>,
  child = element('rect', { width: '100', height: '100' }),
) => element('svg', attributes, [child]);
describe('SVG units and paths (9.20a)', () => {
  it.each([
    ['100mm', 100, undefined],
    ['10cm', 100, undefined],
    ['3.937007874015748in', 100, undefined],
    ['283.46456692913387pt', 100, undefined],
    ['23.62204724409449pc', 100, undefined],
    ['377.9527559055118px', 100, 96],
    ['283.46456692913387px', 100, 72],
  ])('reads a 100 mm square from %s', (width, size, dpi) => {
    const result = importSvg(
      root({ width, height: width, viewBox: `0 0 ${size} ${size}` }),
      dpi ? { pixelsPerInch: dpi } : {},
    );
    const p = result.shapes[0]?.paths[0];
    expect(p).toBeDefined();
    if (!p) return;
    const box = PathOps.bbox(p);
    expect(box?.maxX).toBeCloseTo(100, 8);
    expect(box?.minY).toBeCloseTo(-100, 8);
  });
  it('requires a confirmed scale for a unitless file', () => {
    expect(() => importSvg(root({}))).toThrow('SCALE_REQUIRED');
    expect(() =>
      importSvg(root({ width: '100px', height: '100px', viewBox: '0 0 100 100' })),
    ).toThrow('SCALE_REQUIRED');
  });
  it('preserves physical size under arbitrary viewBox coordinates', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1000, noNaN: true }), (size) => {
        const p = importSvg(
          root(
            { width: '100mm', height: '100mm', viewBox: `0 0 ${size} ${size}` },
            element('rect', { width: String(size), height: String(size) }),
          ),
        ).shapes[0]?.paths[0];
        if (!p) throw new Error('missing path');
        expect(Math.abs((PathOps.bbox(p)?.maxX ?? 0) - 100)).toBeLessThan(EPS_POINT);
      }),
    );
  });
  it('composes SVG transforms in matrix order', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 100 }), fc.integer({ min: 1, max: 10 }), (x, s) => {
        expect(apply(readTransform(`translate(${x},3) scale(${s})`), { x: 2, y: 4 })).toEqual(
          apply(compose(MatOps.fromScale(s), MatOps.fromTranslation({ x, y: 3 })), { x: 2, y: 4 }),
        );
      }),
    );
  });
  it.each([
    'M0 0 L10 0 H20 V20 l-10 0 h-10 v-10 z',
    'm0 0 10 0 0 10z',
    'M0 0 C1 2 3 4 5 6 S8 9 10 10 Q11 12 13 14 T15 16',
    'M0 0 c1 2 3 4 5 6 s8 9 10 10 q11 12 13 14 t15 16',
    'M0 0 A10 10 0 01 20 0 a10 5 30 1 0 20 0',
    'M.1.2L1e1-2M20 20L30 30',
  ])('reads commands and joined subpaths: %s', (d) => {
    for (const p of readPath(d)) expect(PathOps.validate(p)).toEqual([]);
  });
  it('keeps circular arcs exact and flips their sweep once', () => {
    const p = importSvg(
      root(
        { viewBox: '0 0 100 100', width: '100mm', height: '100mm' },
        element('path', { d: 'M0 0A10 10 0 0 1 20 0' }),
      ),
    ).shapes[0]?.paths[0];
    expect(p?.segments[0]?.kind).toBe('arc');
    if (p?.segments[0]?.kind === 'arc') expect(p.segments[0].sweepAngle).toBeLessThan(0);
  });
  it.each(['M', 'M0', 'M0 0L', 'L0 0', 'M0 0A1 2 0 2 0 5 6', 'M0 0L1e999 2', 'M0 0X1 2'])(
    'refuses malformed path %s',
    (d) => expect(() => readPath(d)).toThrow(),
  );
  it('converts every primitive and omits unsupported subtrees', () => {
    const children = [
      element('rect', { width: '10', height: '20', rx: '2', ry: '3' }),
      element('circle', { r: '5' }),
      element('ellipse', { rx: '5', ry: '2' }),
      element('line', { x2: '10' }),
      element('polyline', { points: '0,0 10,0 10,10' }),
      element('polygon', { points: '0,0 10,0 10,10' }),
      element('script', {}, [element('circle', { r: '99' })]),
    ];
    const result = importSvg(
      element('svg', { width: '100mm', height: '100mm', viewBox: '0 0 100 100' }, [
        element('g', { transform: 'translate(10 20)' }, children),
      ]),
    );
    expect(result.shapes).toHaveLength(6);
    expect(result.omitted).toEqual({ script: 1 });
    for (const s of result.shapes) for (const p of s.paths) expect(PathOps.validate(p)).toEqual([]);
  });
  it('repeated smooth commands reflect only matching preceding controls', () => {
    const p = readPath('M0 0Q10 20 20 0T40 0L50 0T60 0')[0];
    expect(p?.segments[1] && SegmentOps.end(p.segments[1])).toEqual({ x: 40, y: 0 });
    expect(p && PathOps.validate(p)).toEqual([]);
  });
});

describe('SVG conversion boundary cases', () => {
  it('keeps elliptical arc endpoints under rotations and radius correction', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: -180, max: 180 }),
        (rx, ry, angle) => {
          const p = readPath(`M0 0A${rx} ${ry} ${angle} 1 0 30 40L50 60`)[0];
          if (!p) throw new Error('missing path');
          expect(PathOps.validate(p)).toEqual([]);
          const first = p.segments[0];
          if (!first) throw new Error('missing segment');
          const start = SegmentOps.start(first);
          expect(Math.hypot(start.x, start.y)).toBeLessThan(EPS_POINT);
        },
      ),
    );
  });
  it('reads physical primitive lengths as CSS user units inside a viewBox', () => {
    const p = importSvg(
      root(
        { width: '100mm', height: '100mm', viewBox: '0 0 100 100' },
        element('rect', { width: '10mm', height: '10mm' }),
      ),
    ).shapes[0]?.paths[0];
    expect(p && PathOps.bbox(p)?.maxX).toBeCloseTo((10 * 96) / 25.4, 8);
  });
  it('resolves physical dimensions without a viewBox', () => {
    const p = importSvg(
      root(
        { width: '100mm', height: '100mm' },
        element('rect', { width: '100mm', height: '100mm' }),
      ),
    ).shapes[0]?.paths[0];
    expect(p && PathOps.bbox(p)?.maxX).toBeCloseTo(100, 8);
  });
  it('aligns a nonzero viewBox and supports nonuniform scaling', () => {
    const child = element('rect', { x: '10', y: '20', width: '100', height: '100' });
    const p = importSvg(root({ width: '200mm', height: '100mm', viewBox: '10 20 100 100' }, child))
      .shapes[0]?.paths[0];
    expect(p && PathOps.bbox(p)).toEqual({ minX: 50, maxX: 150, minY: -100, maxY: 0 });
    const q = importSvg(
      root(
        { width: '200mm', height: '100mm', viewBox: '10 20 100 100', preserveAspectRatio: 'none' },
        child,
      ),
    ).shapes[0]?.paths[0];
    expect(q && PathOps.bbox(q)).toEqual({ minX: 0, maxX: 200, minY: -100, maxY: 0 });
  });
  it('maps zero radius arcs to lines and coincident arcs to nothing', () => {
    expect(readPath('M0 0A0 10 0 0 1 10 0')[0]?.segments[0]?.kind).toBe('line');
    expect(readPath('M0 0A10 10 0 0 1 0 0')).toEqual([]);
  });
  it.each([{ width: '1 2' }, { width: '-1' }, { points: '0 0 1' }])(
    'refuses invalid primitive attributes %j',
    (attrs) => {
      const tag = 'points' in attrs ? 'polygon' : 'rect';
      expect(() =>
        importSvg(
          root(
            { width: '100mm', height: '100mm', viewBox: '0 0 100 100' },
            element(tag, { height: '10', ...attrs }),
          ),
        ),
      ).toThrow();
    },
  );
  it.each([
    'translate()',
    'matrix(1 2)',
    'scale(1 2 3)',
    'rotate(1 2)',
    'skewX(1 2)',
    'unknown(1)',
  ])('refuses invalid transform %s', (value) => expect(() => readTransform(value)).toThrow());
  it('preserves its plain input tree', () => {
    const input = root({ width: '100mm', height: '100mm', viewBox: '0 0 100 100' }),
      before = JSON.stringify(input);
    importSvg(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

it('keeps a scaled ellipse within the export tolerance in millimetres', () => {
  const p = importSvg(
    root(
      { width: '1000mm', height: '1000mm', viewBox: '0 0 100 100' },
      element('ellipse', { rx: '50', ry: '25' }),
    ),
  ).shapes[0]?.paths[0];
  if (!p) throw new Error('missing ellipse');
  for (const segment of p.segments)
    for (let i = 0; i <= 100; i++) {
      const point = SegmentOps.pointAt(segment, i / 100),
        angle = Math.atan2(point.y / 250, point.x / 500);
      expect(
        Math.hypot(point.x - 500 * Math.cos(angle), point.y - 250 * Math.sin(angle)),
      ).toBeLessThan(EXPORT_TOLERANCE_MM);
    }
});
it('refuses curves whose subdivision would exceed the node resource ceiling', () => {
  expect(() => readPath('M0 0A1e100 2e100 0 1 0 1e100 1e100')).toThrow();
});

it('copies a missing rounded rectangle radius before clamping each axis', () => {
  const p = importSvg(
    root(
      { width: '100mm', height: '100mm', viewBox: '0 0 100 100' },
      element('rect', { width: '10', height: '100', rx: '100' }),
    ),
  ).shapes[0]?.paths[0];
  const vertical = p?.segments.filter((s) => s.kind === 'line')[1];
  expect(vertical && SegmentOps.start(vertical).y).toBeCloseTo(-50, 8);
});

it.each(['.0', '1', '1.', '1e2'])(
  'refuses a whitespace-heavy malformed SVG length after %s',
  (prefix) => {
    const width = `${prefix}${' '.repeat(100_000)}!`;
    expect(() => importSvg(root({ width, height: '100mm', viewBox: '0 0 100 100' }))).toThrow(
      'UNSUPPORTED_SVG',
    );
  },
);
it.each([' 100 mm ', '\t1e2\nmm\r', '+100.mm'])('preserves SVG length grammar with %j', (width) => {
  const p = importSvg(root({ width, height: '100mm', viewBox: '0 0 100 100' })).shapes[0]?.paths[0];
  expect(p && PathOps.bbox(p)?.maxX).toBeCloseTo(100, 8);
});

describe('layer names (9.20b)', () => {
  const INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';
  const group = (
    attributes: { namespace: string; localName: string; value: string }[],
    children: SvgElement[],
  ): SvgElement => ({ ...element('g', {}, children), attributes });
  const layerOf = (tree: SvgElement): (string | undefined)[] =>
    importSvg(
      element('svg', { width: '10mm', height: '10mm', viewBox: '0 0 10 10' }, [tree]),
    ).shapes.map((s) => s.layer);
  const rect = () => element('rect', { width: '1', height: '1' });

  it.each([
    ['an Inkscape label', [{ namespace: INKSCAPE, localName: 'label', value: ' Stitch ' }]],
    ['an Illustrator data-name', [{ namespace: '', localName: 'data-name', value: 'STITCH' }]],
    ['an Illustrator id', [{ namespace: '', localName: 'id', value: 'stitch' }]],
  ])('reads %s, in any case', (_, attributes) => {
    expect(layerOf(group(attributes, [rect()]))).toEqual(['stitch']);
  });

  it('the nearest named layer wins; another name neither sets nor clears one', () => {
    const named = (value: string, children: SvgElement[]) =>
      group([{ namespace: INKSCAPE, localName: 'label', value }], children);
    expect(
      layerOf(
        named('cut', [
          rect(),
          named('fold', [named('details', [rect()])]),
          named('Layer 2', [rect()]),
        ]),
      ),
    ).toEqual(['cut', 'fold', 'cut']);
  });

  it('a shape in no named layer has none', () => {
    expect(
      layerOf(group([{ namespace: '', localName: 'id', value: 'cutting' }], [rect()])),
    ).toEqual([undefined]);
  });
});
