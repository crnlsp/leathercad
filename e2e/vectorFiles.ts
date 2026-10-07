import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';

/**
 * The print test, measured in an exported SVG (6.2) — the way a laser's
 * software would read it.
 *
 * Like `printTest.ts`, which measures the PDF by what poppler draws, nothing
 * here knows how the file was written: it is read by hand, with no SVG library,
 * and what it measures is the print test's own dimensions — a panel 100 mm
 * wide, 25 holes along its foot at 3.875 mm, a strap 275 mm long. Nothing is
 * taken from the project's coordinates.
 *
 * Every shape is reduced to **primitives in the board's own Y-up millimetres**,
 * so what is measured does not depend on how a format draws. For an SVG that
 * reduction is the page's own rule — y grows downward from the page's top — read
 * here from the file's `height`, which makes a flip written the wrong way a
 * panel hanging below its dimension.
 */

/** A straight run, an arc between two points, or a whole circle, on a layer. */
export type Primitive =
  | { readonly layer: string; readonly kind: 'line'; readonly from: Point; readonly to: Point }
  | { readonly layer: string; readonly kind: 'arc' | 'curve'; readonly points: readonly Point[] }
  | {
      readonly layer: string;
      readonly kind: 'circle';
      readonly at: Point;
      readonly radius: number;
    };

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface VectorFileMeasurements {
  /** The outer panel's straight foot, which the dimension measures. */
  readonly panelEdgeMm: number;
  /** Hole markers on the straight run 3.5 mm in from it. */
  readonly holes: number;
  /** (last − first) / gaps, from the markers' centres. */
  readonly spacingMm: number;
  /** The largest difference between one gap and the spacing. */
  readonly worstGapErrorMm: number;
  /** How far the strap's straight edge runs, between its rounded ends. */
  readonly strapEdgeMm: number;
  /** All the cut lines, end to end: the strap, with its rounded ends. */
  readonly strapMm: number;
  /** How far under the panel's foot the annotations reach: its dimension. */
  readonly dimensionBelowFootMm: number;
}

// ── SVG ──────────────────────────────────────────────────────────────────────

export interface SvgFacts {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly viewBox: string;
  readonly groups: readonly string[];
  readonly hasTransform: boolean;
  readonly hasFont: boolean;
  readonly hasCarriageReturn: boolean;
}

/** What an SVG file says about itself, and every shape in it as primitives. */
export function readSvg(file: string): { facts: SvgFacts; primitives: Primitive[] } {
  const text = readFileSync(file, 'utf8');
  const root = /<svg\b([^>]*)>/.exec(text)?.[1] ?? '';
  const attr = (tag: string, name: string): string | undefined =>
    new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

  const widthMm = Number(attr(root, 'width')?.replace('mm', ''));
  const heightMm = Number(attr(root, 'height')?.replace('mm', ''));
  expect(attr(root, 'width'), 'width in millimetres').toMatch(/^[\d.]+mm$/);
  expect(attr(root, 'height'), 'height in millimetres').toMatch(/^[\d.]+mm$/);

  const primitives: Primitive[] = [];
  const groups: string[] = [];
  for (const group of text.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/g)) {
    const layer = attr(group[1]!, 'id')!;
    groups.push(layer);
    for (const element of group[2]!.matchAll(/<(path|circle)\b([^>]*)\/>/g)) {
      if (element[1] === 'circle') {
        primitives.push({
          layer,
          kind: 'circle',
          at: up(Number(attr(element[2]!, 'cx')), Number(attr(element[2]!, 'cy')), heightMm),
          radius: Number(attr(element[2]!, 'r')),
        });
      } else {
        primitives.push(...pathPrimitives(layer, attr(element[2]!, 'd')!, heightMm));
      }
    }
  }

  return {
    facts: {
      widthMm,
      heightMm,
      viewBox: attr(root, 'viewBox') ?? '',
      groups,
      hasTransform: /\btransform\s*=/.test(text),
      hasFont: /<text\b|font-family/.test(text),
      hasCarriageReturn: text.includes('\r'),
    },
    primitives,
  };
}

/** A point on the page, which grows downward, as the board has it, which grows up. */
const up = (x: number, y: number, pageHeight: number): Point => ({ x, y: pageHeight - y });

function pathPrimitives(layer: string, d: string, pageHeight: number): Primitive[] {
  const found: Primitive[] = [];
  let at: Point = { x: 0, y: 0 };
  let begin = at;
  for (const [, command, rest] of d.matchAll(/([MLCAZ])([^MLCAZ]*)/g)) {
    const n = rest!.trim() === '' ? [] : rest!.trim().split(/\s+/).map(Number);
    const to = command === 'Z' ? begin : up(n.at(-2)!, n.at(-1)!, pageHeight);
    if (command === 'M') begin = to;
    else if (command === 'L') found.push({ layer, kind: 'line', from: at, to });
    else if (command === 'A') found.push({ layer, kind: 'arc', points: [at, to] });
    else if (command === 'C') found.push({ layer, kind: 'curve', points: [at, to] });
    else if (Math.hypot(to.x - at.x, to.y - at.y) > 1e-6) {
      found.push({ layer, kind: 'line', from: at, to });
    }
    at = to;
  }
  return found;
}

// ── Measuring ────────────────────────────────────────────────────────────────

const pointsOf = (p: Primitive): readonly Point[] =>
  p.kind === 'line' ? [p.from, p.to] : p.kind === 'circle' ? [p.at] : p.points;

/**
 * The print test's three measurements, in primitives. The panel's foot is the
 * one straight cut line that is 100 mm long (the pocket's is 96, the strap's
 * 265, the panel's top 80 between its rounded corners); the holes are the
 * markers on a line 3.5 mm in from it, where the panel's stitch line runs; and
 * the strap is the width of everything that is cut, which no other piece
 * reaches.
 */
export function measureVectorFile(primitives: readonly Primitive[]): VectorFileMeasurements {
  const cut = primitives.filter((p) => p.layer === 'cut');
  const horizontal = (p: Primitive): p is Extract<Primitive, { kind: 'line' }> =>
    p.kind === 'line' && Math.abs(p.from.y - p.to.y) < 1e-6;
  const length = (p: Extract<Primitive, { kind: 'line' }>): number => Math.abs(p.to.x - p.from.x);

  const foot = cut.filter(horizontal).filter((p) => Math.abs(length(p) - 100) < 0.5);
  expect(foot, 'one straight 100 mm foot among the cut lines').toHaveLength(1);
  const edge = foot[0]!;
  const [left, right] = [Math.min(edge.from.x, edge.to.x), Math.max(edge.from.x, edge.to.x)];

  // 25 holes on the straight run along it: 24 gaps. The stitch line is 3.5 mm in.
  const run = primitives
    .filter((p) => p.layer === 'stitch-holes' && p.kind === 'circle')
    .flatMap((p) => pointsOf(p))
    .filter((p) => Math.abs(p.y - (edge.from.y + 3.5)) < 0.01 && p.x > left && p.x < right)
    .map((p) => p.x)
    .sort((a, b) => a - b);
  const gaps = run.slice(1).map((x, i) => x - run[i]!);
  const spacing = (run.at(-1)! - run[0]!) / gaps.length;

  const straps = cut.filter(horizontal).filter((p) => length(p) > 200);
  expect(straps, 'the strap’s straight edge, top and bottom').toHaveLength(2);
  const xs = cut.flatMap((p) => pointsOf(p).map((point) => point.x));

  const annotation = primitives
    .filter((p) => p.layer === 'annotation')
    .flatMap((p) => pointsOf(p).map((point) => point.y));

  return {
    panelEdgeMm: length(edge),
    holes: run.length,
    spacingMm: spacing,
    worstGapErrorMm: Math.max(...gaps.map((gap) => Math.abs(gap - spacing))),
    strapEdgeMm: length(straps[0]!),
    strapMm: Math.max(...xs) - Math.min(...xs),
    dimensionBelowFootMm: edge.from.y - Math.min(...annotation),
  };
}

/**
 * What a 6.2 or 6.5 export of the print test must measure: a tenth of a
 * micrometre in the numbers, so a thousandth of a millimetre here is every
 * digit the file writes and none it does not.
 */
export function expectPrintTestTrue(measured: VectorFileMeasurements): void {
  const close = (actual: number, expected: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual.toFixed(4)} mm`).toBeLessThan(0.001);

  close(measured.panelEdgeMm, 100, 'panel foot');
  expect(measured.holes, 'holes on the straight run').toBe(25);
  close(measured.spacingMm, 3.875, 'hole spacing');
  expect(measured.worstGapErrorMm, 'evenness of the gaps').toBeLessThan(0.001);
  close(measured.strapEdgeMm, 265, 'strap, between its rounded ends');
  close(measured.strapMm, 275, 'strap, end to end');
  // The dimension is set 8 mm below the foot, and its number below that: under
  // the panel on the board, so under it in the file too.
  expect(measured.dimensionBelowFootMm, 'dimension under the panel').toBeGreaterThan(7.99);
}
