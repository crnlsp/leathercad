import { COORDINATE_LIMIT_MM, checkResourceLimit } from '@leathercad/core';
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
  type Segment,
} from '@leathercad/geometry';
import { numbers, SvgImportError } from './numbers.js';
import { readPath } from './path.js';
import { readTransform } from './transform.js';
import { LAYER_NAMES, type LayerName } from './roles.js';
export { SvgImportError } from './numbers.js';
export { assignRoles, type SvgPattern } from './roles.js';
export { svgText } from './text.js';

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
  /** The nearest enclosing group named `cut`, `stitch` or `fold` (9.20b). */
  readonly layer?: LayerName;
}
export interface SvgGeometry {
  readonly shapes: readonly SvgShape[];
  readonly omitted: Readonly<Record<string, number>>;
}
const SVG = 'http://www.w3.org/2000/svg';
const INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';
function attr(node: SvgElement, name: string, namespace = ''): string | undefined {
  return node.attributes.find((a) => a.namespace === namespace && a.localName === name)?.value;
}
/**
 * A group's layer name, if it is one of the roles: Inkscape's label, else
 * Illustrator's `data-name`, else its id, which Illustrator sets to the
 * layer's name.
 */
function layerName(group: SvgElement): LayerName | undefined {
  const name = (attr(group, 'label', INKSCAPE) ?? attr(group, 'data-name') ?? attr(group, 'id'))
    ?.trim()
    .toLowerCase();
  return LAYER_NAMES.find((layer) => layer === name);
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
/** The numbers a project file stores of a segment: its schema holds each to the coordinate limit. */
function stored(segment: Segment): number[] {
  switch (segment.kind) {
    case 'line':
      return [segment.a.x, segment.a.y, segment.b.x, segment.b.y];
    case 'arc':
      return [segment.centre.x, segment.centre.y, segment.radius];
    case 'cubic':
      return [segment.p0, segment.p1, segment.p2, segment.p3].flatMap((p) => [p.x, p.y]);
  }
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
/**
 * What a pattern never needs and a file can still hold (9.20c): listed by
 * kind when left out, even inside another left-out element — a clip in
 * `defs` — and never fetched, run or applied.
 */
const REPORTED = new Set([
  'text',
  'image',
  'use',
  'foreignObject',
  'script',
  'filter',
  'clipPath',
  'mask',
]);
/** Counts a left-out element by its name, and the reported kinds within it. */
function leaveOut(node: SvgElement, omitted: Map<string, number>): void {
  const count = (name: string) => omitted.set(name, (omitted.get(name) ?? 0) + 1);
  count(node.localName);
  const inside = [...node.children];
  for (let child = inside.pop(); child !== undefined; child = inside.pop()) {
    if (child.namespace === SVG && REPORTED.has(child.localName)) count(child.localName);
    inside.push(...child.children);
  }
}
/** Converts an already parsed tree atomically. Unknown scale is a typed refusal, never a guess.
 * The caller supplies 96 for Inkscape or 72 for legacy Illustrator after identification/confirmation.
 * The text it was parsed from has passed `svgText` (9.20c).
 */
function convertSvg(root: SvgElement, options: SvgOptions): SvgGeometry {
  if (root.namespace !== SVG || root.localName !== 'svg') throw new SvgImportError('INVALID_SVG');
  const dpi = options.pixelsPerInch;
  if (dpi !== undefined && (!Number.isFinite(dpi) || dpi <= 0))
    throw new SvgImportError('INVALID_SVG');
  const view = viewport(root, dpi),
    shapes: SvgShape[] = [],
    omitted = new Map<string, number>();
  let segments = 0;
  const flip = compose(view.matrix, MatOps.fromScale(1, -1));
  const stack: { node: SvgElement; matrix: Mat2x3; layer?: LayerName }[] = [
    { node: root, matrix: flip },
  ];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    const { node } = entry;
    const matrix = compose(readTransform(attr(node, 'transform') ?? ''), entry.matrix);
    if (node.namespace !== SVG) {
      leaveOut(node, omitted);
      continue;
    }
    if (node.localName === 'g' || node === root) {
      const layer = (node === root ? undefined : layerName(node)) ?? entry.layer;
      for (const child of [...node.children].reverse())
        stack.push({ node: child, matrix, ...(layer === undefined ? {} : { layer }) });
      continue;
    }
    // Frobenius norm bounds the stretch of any direction under this matrix.
    const stretch = Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
    if (!Number.isFinite(stretch)) throw new SvgImportError('INVALID_SVG');
    const tolerance = EXPORT_TOLERANCE_MM / Math.max(1, stretch);
    const paths = shape(node, dpi, view.userUnit, tolerance);
    if (paths === undefined) {
      leaveOut(node, omitted);
      continue;
    }
    for (const p of paths) checkResourceLimit('segments', (segments += p.segments.length));
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
        // What reaches past the limit could be imported but never saved and reopened (QA F2).
        if (
          [...Object.values(bounds), ...stored(segment)].some(
            (v) => Math.abs(v) > COORDINATE_LIMIT_MM,
          )
        )
          throw new SvgImportError('BEYOND_LIMIT');
      }
    shapes.push({
      element: node,
      paths: transformed,
      ...(entry.layer === undefined ? {} : { layer: entry.layer }),
    });
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
