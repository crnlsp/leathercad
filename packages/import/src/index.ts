import { checkResourceLimit } from '@leathercad/core';
import {
  EXPORT_TOLERANCE_MM,
  maxArcStepForTolerance,
  compose,
  MatOps,
  PathOps,
  Shapes,
  polyline,
  type Mat2x3,
  type Path,
} from '@leathercad/geometry';
import { numbers, SvgImportError } from './numbers.js';
import { readPath } from './path.js';
import { readTransform } from './transform.js';
export { SvgImportError } from './numbers.js';

/** ADR 0023: data only; no DOM, text content, or executable objects. */
export interface SvgAttribute {
  readonly namespace: string;
  readonly localName: string;
  readonly value: string;
}
export interface SvgElement {
  readonly namespace: string;
  readonly localName: string;
  readonly attributes: readonly SvgAttribute[];
  readonly children: readonly SvgElement[];
}
export interface SvgOptions {
  readonly pixelsPerInch?: number;
}
export interface SvgShape {
  readonly element: SvgElement;
  readonly paths: readonly Path[];
}
export interface SvgGeometry {
  readonly shapes: readonly SvgShape[];
  readonly omitted: Readonly<Record<string, number>>;
}
const SVG = 'http://www.w3.org/2000/svg';
function attr(node: SvgElement, name: string): string | undefined {
  return node.attributes.find((a) => a.namespace === '' && a.localName === name)?.value;
}
const units: Readonly<Record<string, number>> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
};
function length(text: string, dpi: number | undefined): number {
  // Trim once so whitespace cannot be repartitioned across optional units.
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/.exec(
    text.trim(),
  );
  if (!match) throw new SvgImportError('UNSUPPORTED_SVG');
  const value = Number(match[1]),
    unit = match[2] ?? 'px';
  const factor = units[unit] ?? (dpi === undefined ? undefined : 25.4 / dpi);
  if (factor === undefined) throw new SvgImportError('SCALE_REQUIRED');
  if (!Number.isFinite(value * factor)) throw new SvgImportError('INVALID_SVG');
  return value * factor;
}
function viewport(root: SvgElement, dpi: number | undefined): { matrix: Mat2x3; userUnit: number } {
  const box = attr(root, 'viewBox'),
    width = attr(root, 'width'),
    height = attr(root, 'height');
  if (!box) {
    if (
      dpi === undefined &&
      ![width, height].some((v) => v !== undefined && /(?:mm|cm|in|pt|pc)\s*$/.test(v))
    )
      throw new SvgImportError('SCALE_REQUIRED');
    const scale = 25.4 / (dpi ?? 96);
    for (const dimension of [width, height])
      if (dimension !== undefined && length(dimension, dpi ?? 96) <= 0)
        throw new SvgImportError('INVALID_SVG');
    return { matrix: MatOps.fromScale(scale), userUnit: scale };
  }
  const values = numbers(box),
    [x = 0, y = 0, w = 0, h = 0] = values;
  if (values.length !== 4 || w <= 0 || h <= 0) throw new SvgImportError('INVALID_SVG');
  if (!width && !height) throw new SvgImportError('SCALE_REQUIRED');
  const wm = width ? length(width, dpi) : (length(height ?? '', dpi) * w) / h;
  const hm = height ? length(height, dpi) : (wm * h) / w;
  if (wm <= 0 || hm <= 0) throw new SvgImportError('INVALID_SVG');
  let sx = wm / w,
    sy = hm / h,
    tx = -x * sx,
    ty = -y * sy;
  const aspect = (attr(root, 'preserveAspectRatio') ?? 'xMidYMid meet').trim();
  if (aspect !== 'none') {
    const match = /^(xMin|xMid|xMax)(YMin|YMid|YMax)(?:\s+(meet|slice))?$/.exec(aspect);
    if (!match) throw new SvgImportError('UNSUPPORTED_SVG');
    sx = sy = match[3] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const ax = match[1] === 'xMin' ? 0 : match[1] === 'xMid' ? 0.5 : 1;
    const ay = match[2] === 'YMin' ? 0 : match[2] === 'YMid' ? 0.5 : 1;
    tx = -x * sx + (wm - w * sx) * ax;
    ty = -y * sy + (hm - h * sy) * ay;
  }
  return {
    matrix: { a: sx, b: 0, c: 0, d: sy, e: tx, f: ty },
    userUnit: 25.4 / (dpi ?? 96),
  };
}
function shape(
  node: SvgElement,
  dpi: number | undefined,
  userUnit: number,
  tolerance: number,
): Path[] | undefined {
  const value = (name: string, fallback = 0): number => {
    const text = attr(node, name);
    if (text === undefined) return fallback;
    // Unitless geometry is in viewBox coordinates; physical lengths are CSS user units.
    if (/^[\s+\-\d.eE]+$/.test(text)) {
      const values = numbers(text);
      if (values.length !== 1) throw new SvgImportError('INVALID_SVG');
      return values[0] ?? fallback;
    }
    return length(text, dpi ?? 96) / userUnit;
  };
  const positive = (name: string, fallback = 0): number => {
    const n = value(name, fallback);
    if (n < 0) throw new SvgImportError('INVALID_SVG');
    return n;
  };
  switch (node.localName) {
    case 'path':
      return readPath(attr(node, 'd') ?? '', tolerance);
    case 'rect': {
      const w = positive('width'),
        h = positive('height');
      if (!w || !h) return [];
      const x = value('x'),
        y = value('y');
      const requestedRx = positive('rx', value('ry'));
      const requestedRy = positive('ry', requestedRx);
      const rx = Math.min(requestedRx, w / 2),
        ry = Math.min(requestedRy, h / 2);
      if (!rx || !ry) return [Shapes.rect({ x, y }, w, h)];
      return readPath(
        `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`,
        tolerance,
      );
    }
    case 'circle': {
      const r = positive('r');
      return r ? [Shapes.circle({ x: value('cx'), y: value('cy') }, r)] : [];
    }
    case 'ellipse': {
      const rx = positive('rx'),
        ry = positive('ry');
      if (!rx || !ry) return [];
      const cx = value('cx'),
        cy = value('cy');
      return readPath(
        `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`,
        tolerance,
      );
    }
    case 'line':
      return [Shapes.line({ x: value('x1'), y: value('y1') }, { x: value('x2'), y: value('y2') })];
    case 'polyline':
    case 'polygon': {
      const coords = numbers(attr(node, 'points') ?? '');
      if (coords.length % 2) throw new SvgImportError('INVALID_SVG');
      const points = [];
      for (let i = 0; i < coords.length; i += 2)
        points.push({ x: coords[i] ?? 0, y: coords[i + 1] ?? 0 });
      return points.length >= 2 ? [polyline(points, node.localName === 'polygon')] : [];
    }
    default:
      return undefined;
  }
}
/** Converts an already parsed tree atomically. Unknown scale is a typed refusal, never a guess.
 * The caller supplies 96 for Inkscape or 72 for legacy Illustrator after identification/confirmation.
 * XML decoding and hostile-input preflight belong to the platform boundary (9.20c).
 */
function convertSvg(root: SvgElement, options: SvgOptions): SvgGeometry {
  if (root.namespace !== SVG || root.localName !== 'svg') throw new SvgImportError('INVALID_SVG');
  const dpi = options.pixelsPerInch;
  if (dpi !== undefined && (!Number.isFinite(dpi) || dpi <= 0))
    throw new SvgImportError('INVALID_SVG');
  const view = viewport(root, dpi),
    shapes: SvgShape[] = [],
    omitted = new Map<string, number>();
  const flip = compose(view.matrix, MatOps.fromScale(1, -1));
  const stack = [{ node: root, matrix: flip }];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    const { node } = entry;
    const matrix = compose(readTransform(attr(node, 'transform') ?? ''), entry.matrix);
    if (node.namespace !== SVG) {
      omitted.set(node.localName, (omitted.get(node.localName) ?? 0) + 1);
      continue;
    }
    if (node.localName === 'g' || node === root) {
      for (const child of [...node.children].reverse()) stack.push({ node: child, matrix });
      continue;
    }
    // Frobenius norm bounds the stretch of any direction under this matrix.
    const stretch = Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
    if (!Number.isFinite(stretch)) throw new SvgImportError('INVALID_SVG');
    const tolerance = EXPORT_TOLERANCE_MM / Math.max(1, stretch);
    const paths = shape(node, dpi, view.userUnit, tolerance);
    if (paths === undefined) {
      omitted.set(node.localName, (omitted.get(node.localName) ?? 0) + 1);
      continue;
    }
    for (const p of paths)
      for (const segment of p.segments) {
        if (segment.kind === 'arc')
          checkResourceLimit(
            'nodes',
            Math.ceil(
              Math.abs(segment.sweepAngle) / maxArcStepForTolerance(segment.radius, tolerance),
            ),
          );
      }
    const transformed = paths.map((p) => PathOps.transform(p, matrix, tolerance));
    for (const p of transformed)
      for (const segment of p.segments) {
        const bounds = PathOps.bbox({ segments: [segment], closed: false });
        if (bounds === null || !Object.values(bounds).every(Number.isFinite))
          throw new SvgImportError('INVALID_SVG');
      }
    shapes.push({ element: node, paths: transformed });
  }
  return { shapes, omitted: Object.fromEntries(omitted) };
}

export function importSvg(root: SvgElement, options: SvgOptions = {}): SvgGeometry {
  try {
    return convertSvg(root, options);
  } catch (error) {
    if (error instanceof RangeError) throw new SvgImportError('INVALID_SVG');
    throw error;
  }
}
