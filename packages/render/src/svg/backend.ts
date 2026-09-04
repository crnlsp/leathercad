import { MatOps, SegmentOps, type Path, type Segment } from '@leathercad/geometry';

import type { DisplayItem, DisplayList } from '../displayList.js';
import { worldToScreen, type ViewportView } from '../view.js';

export interface SvgOptions {
  readonly fontFamily?: string;
  /** Painted behind everything. Omitted entirely when not given. */
  readonly background?: string;
  /** Decimal places kept in the output. */
  readonly precision?: number;
}

/**
 * Four decimals is 0.1 µm — finer than the storage grid, and far finer than
 * anything a knife follows. Fixing it is what makes a snapshot stable: without
 * rounding, the last bit of a float changes between platforms and every
 * snapshot churns for no reason.
 */
const DEFAULT_PRECISION = 4;

/**
 * Renders a display list to an SVG document.
 *
 * The second backend for the same `DisplayList`, which is what lets an SVG
 * string stand in for "what does the canvas draw" in tests — deterministic,
 * diffable in review, no image tooling, milliseconds to run. See
 * docs/testing.md §5.1.
 *
 * It mirrors the Canvas2D backend deliberately, including the awkward parts:
 * geometry is emitted in **millimetres** inside a group carrying the world
 * transform, so arcs stay arcs and a snapshot diff reads in the units the user
 * typed; stroke widths and dashes are divided by the scale, keeping them
 * constant on screen while the geometry stays true; and text is emitted in a
 * second, screen-space pass, because the world transform flips Y and text
 * drawn through it would come out mirrored.
 *
 * The flip itself is not defined here. It lives in `worldToScreen` in
 * `view.ts`, and both backends only apply it — see CLAUDE.md invariant 2.
 */
export function renderToSvgString(
  list: DisplayList,
  view: ViewportView,
  options: SvgOptions = {},
): string {
  const precision = options.precision ?? DEFAULT_PRECISION;
  const n = (value: number): string => format(value, precision);
  const transform = worldToScreen(view);
  const perMm = view.scale;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(view.widthPx)}" height="${n(view.heightPx)}" ` +
      `viewBox="0 0 ${n(view.widthPx)} ${n(view.heightPx)}">`,
  ];

  if (options.background !== undefined) {
    parts.push(`<rect width="100%" height="100%" fill="${options.background}"/>`);
  }

  const m = transform;
  parts.push(
    `<g transform="matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})" ` +
      `fill="none" stroke-linecap="round" stroke-linejoin="round">`,
  );

  for (const item of list.items) {
    if (item.kind === 'path') {
      const dash = item.stroke.dashPx;
      const dashAttr =
        dash === undefined || dash.length === 0
          ? ''
          : ` stroke-dasharray="${dash.map((d) => n(d / perMm)).join(' ')}"`;

      parts.push(
        `<path d="${pathData(item.path, n)}" stroke="${item.stroke.colour}" ` +
          `stroke-width="${n(item.stroke.widthPx / perMm)}"${dashAttr}/>`,
      );
    } else if (item.kind === 'dots') {
      const radius = n(item.radiusPx / perMm);
      for (const point of item.points) {
        parts.push(
          `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="${radius}" fill="${item.fill}"/>`,
        );
      }
    }
  }

  parts.push('</g>');

  const texts = list.items.filter(
    (i): i is Extract<DisplayItem, { kind: 'text' }> => i.kind === 'text',
  );
  if (texts.length > 0) {
    parts.push(`<g font-family="${options.fontFamily ?? 'system-ui, sans-serif'}">`);
    for (const item of texts) {
      const at = MatOps.apply(transform, item.at);
      parts.push(
        `<text x="${n(at.x)}" y="${n(at.y)}" font-size="${n(item.sizePx)}" fill="${item.colour}"` +
          `${anchor(item.align)}${baseline(item.baseline)}>${escapeText(item.text)}</text>`,
      );
    }
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** One path as an SVG `d` attribute, in millimetres. */
function pathData(p: Path, n: (v: number) => string): string {
  if (p.segments.length === 0) return '';

  const first = SegmentOps.start(p.segments[0]!);
  const out: string[] = [`M ${n(first.x)} ${n(first.y)}`];

  for (const segment of p.segments) out.push(...commandsFor(segment, n));
  if (p.closed) out.push('Z');

  return out.join(' ');
}

function commandsFor(s: Segment, n: (v: number) => string): string[] {
  if (s.kind === 'line') return [`L ${n(s.b.x)} ${n(s.b.y)}`];

  if (s.kind === 'cubic') {
    return [`C ${n(s.p1.x)} ${n(s.p1.y)} ${n(s.p2.x)} ${n(s.p2.y)} ${n(s.p3.x)} ${n(s.p3.y)}`];
  }

  // A full turn has coincident endpoints, and an SVG arc command between two
  // identical points draws nothing at all. Halving it gives two arcs that each
  // have somewhere to go.
  const full = Math.abs(s.sweepAngle) >= Math.PI * 2 - 1e-9;
  if (full) {
    const [firstHalf, secondHalf] = SegmentOps.split(s, 0.5);
    return [...commandsFor(firstHalf, n), ...commandsFor(secondHalf, n)];
  }

  const end = SegmentOps.end(s);
  const largeArc = Math.abs(s.sweepAngle) > Math.PI ? 1 : 0;
  // Sweep flag is read in the current user space, which here is millimetres
  // with Y up — so a positive sweep is a positive flag, and the group's flip
  // takes care of the rest.
  const sweep = s.sweepAngle > 0 ? 1 : 0;

  return [`A ${n(s.radius)} ${n(s.radius)} 0 ${largeArc} ${sweep} ${n(end.x)} ${n(end.y)}`];
}

function anchor(align: CanvasTextAlign | undefined): string {
  if (align === 'center') return ' text-anchor="middle"';
  if (align === 'right' || align === 'end') return ' text-anchor="end"';
  return '';
}

function baseline(value: CanvasTextBaseline | undefined): string {
  if (value === 'middle') return ' dominant-baseline="middle"';
  if (value === 'top' || value === 'hanging') return ' dominant-baseline="hanging"';
  return '';
}

/** Strips the negative zero a flip produces, so snapshots do not show "-0". */
function format(value: number, precision: number): string {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
