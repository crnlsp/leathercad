import { EPS_ANGLE, EPS_LENGTH, EPS_POINT } from '@leathercad/core';
import {
  MatOps,
  PathOps,
  RectOps,
  SegmentOps,
  arc,
  dist,
  type ArcSegment,
  type Mat2x3,
  type Path,
  type Rect,
  type Segment,
} from '@leathercad/geometry';
import { ROLE_STYLES } from '@leathercad/render';

import { circleOf, fileBoundsOf, fileLayersOf, mmText } from '../fileScene.js';
import { PRINT_STYLES, type ExportScene } from '../scene.js';

export interface SvgExportResult {
  /** The file, as text. It is UTF-8, with `\n` line ends on every platform. */
  readonly text: string;
  /**
   * The box of the drawing on the board, in model millimetres: what the page is.
   * The page's left edge is `minX` and its top edge is `maxY`, which is how a
   * point in the file maps back to the board.
   */
  readonly boundsMm: Rect;
}

/**
 * Writes the drawing as an SVG: the pieces where the maker put them on the
 * board, in true millimetres.
 *
 * **One user unit is one millimetre.** `width` and `height` carry `mm`, the
 * `viewBox` is the same two numbers, and no element carries a transform, so an
 * importer that respects physical units gets the right size with no setting.
 * A line drawn as 100 mm is a line of 100.0000 in the file.
 *
 * It is the scene the PDF is written from, so it holds exactly what the PDF
 * prints — and not where the PDF puts it: the sheets pack pieces onto paper,
 * and a laser wants the arrangement the maker made.
 *
 * Groups are the layer roles, named as the domain names them. A stroke is its
 * role's true width, a dash its true rhythm, and its colour the canvas's, so
 * software that sorts a drawing by colour (a laser's layers) sorts it by role.
 * Words are filled outlines: no font is named, in this file or any other.
 *
 * @throws RangeError when the scene draws nothing, which has no size to give a
 * page. The interface does not offer the export then.
 */
export function exportSvg(scene: ExportScene): SvgExportResult {
  const layers = fileLayersOf(scene);
  const bounds = fileBoundsOf(layers);
  if (bounds === null) throw new RangeError('nothing to export: the scene draws nothing');

  const flip = modelToFile(bounds);
  const width = mmText(RectOps.width(bounds));
  const height = mmText(RectOps.height(bounds));
  const title = xmlText(scene.projectName).trim();

  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`,
  ];
  if (title !== '') out.push(`<title>${title}</title>`);

  for (const layer of layers) {
    const { widthMm, dashMm } = PRINT_STYLES[layer.role];
    const colour = ROLE_STYLES[layer.role].colour;
    const dashes = dashMm.length === 0 ? '' : ` stroke-dasharray="${dashMm.map(mmText).join(' ')}"`;
    out.push(
      `<g id="${layer.role}" fill="none" stroke="${colour}" stroke-width="${mmText(widthMm)}" ` +
        `stroke-linecap="round" stroke-linejoin="round"${dashes}>`,
    );

    for (const path of layer.paths) {
      const onPage = PathOps.transform(path, flip);
      const circle = circleOf(onPage);
      if (circle !== null) {
        out.push(
          `<circle cx="${mmText(circle.centre.x)}" cy="${mmText(circle.centre.y)}" r="${mmText(circle.radius)}"/>`,
        );
        continue;
      }
      const d = pathData(onPage);
      if (d !== '') out.push(`<path d="${d}"/>`);
    }

    // A string is one path of every contour of its letters, filled with the
    // non-zero rule the typeface's outlines assume, so an "o" has its counter.
    for (const text of layer.texts) {
      const d = text.glyphs
        .map((glyph) => pathData(PathOps.transform(glyph, flip)))
        .filter((contour) => contour !== '')
        .join(' ');
      if (d !== '') out.push(`<path d="${d}" fill="${colour}" stroke="none"/>`);
    }

    out.push('</g>');
  }

  out.push('</svg>', '');
  return { text: out.join('\n'), boundsMm: bounds };
}

/**
 * Model to file: **the one Y flip in the SVG writer** (CLAUDE.md invariant 2).
 *
 * The board is Y-up and a page is Y-down, with its origin at the top left. The
 * drawing's top edge becomes the page's top, `y = 0`, and its left edge the
 * page's left. A file has no viewport, so this is its own flip and not
 * `worldToScreen`'s; nothing else in this file turns anything over. A mirror
 * reverses an arc's sweep, which the geometry layer's transform does, and the
 * sweep flag below reads that reversed sweep — so it needs no flip of its own.
 */
function modelToFile(bounds: Rect): Mat2x3 {
  return MatOps.composeAll(
    MatOps.fromTranslation({ x: -bounds.minX, y: -bounds.maxY }),
    MatOps.fromScale(1, -1),
  );
}

/** The most one `A` command may turn. */
const QUARTER_TURN = Math.PI / 2;

/**
 * An arc, as arcs no longer than a quarter turn.
 *
 * SVG writes an arc by its endpoints and radius, and a reader works its centre
 * out from them: for a half turn that is as sensitive as a square root at zero.
 * Rounding an endpoint by 0.1 µm moves the far side of a 12.5 mm radius by up
 * to 0.035 mm, and a strap's rounded end is exactly that arc. Within a quarter
 * turn a rounding moves the arc by no more than it moved the endpoint, and the
 * large-arc flag is always 0.
 */
function quarterTurns(piece: ArcSegment): ArcSegment[] {
  if (piece.radius < EPS_LENGTH || Math.abs(piece.sweepAngle) < EPS_ANGLE) return [];
  const count = Math.max(1, Math.ceil(Math.abs(piece.sweepAngle) / QUARTER_TURN - EPS_ANGLE));
  const step = piece.sweepAngle / count;
  return Array.from({ length: count }, (_, i) =>
    arc(piece.centre, piece.radius, piece.startAngle + step * i, step),
  );
}

function pathData(path: Path): string {
  const out: string[] = [];
  let at: { x: number; y: number } | null = null;

  for (const segment of path.segments) {
    for (const piece of segment.kind === 'arc' ? quarterTurns(segment) : [segment]) {
      const start = SegmentOps.start(piece);
      // A path that does not join up starts a new subpath, as the PDF's does.
      if (at === null || dist(at, start) > EPS_POINT) out.push(`M ${xy(start)}`);
      out.push(command(piece));
      at = SegmentOps.end(piece);
    }
  }

  if (path.closed && out.length > 0) out.push('Z');
  return out.join(' ');
}

const xy = (p: { x: number; y: number }): string => `${mmText(p.x)} ${mmText(p.y)}`;

function command(piece: Segment): string {
  switch (piece.kind) {
    case 'line':
      return `L ${xy(piece.b)}`;
    case 'cubic':
      return `C ${xy(piece.p1)} ${xy(piece.p2)} ${xy(piece.p3)}`;
    case 'arc': {
      const r = mmText(piece.radius);
      // On the page, so positive is the direction its y grows: clockwise to the
      // eye, which is what flag 1 draws. The flip has already reversed the sweep.
      const sweep = piece.sweepAngle > 0 ? 1 : 0;
      return `A ${r} ${r} 0 0 ${String(sweep)} ${xy(SegmentOps.end(piece))}`;
    }
  }
}

/**
 * Text for an XML element: what XML 1.0 cannot hold at all is dropped, and the
 * markup characters are escaped. The name of a project is whatever its file
 * says it is.
 */
function xmlText(text: string): string {
  return text.replace(NOT_XML, '').replace(/[&<>"']/g, (character) => ENTITIES[character]!);
}

/**
 * What XML 1.0 cannot hold: everything but its `Char` production: tab, line
 * feed, carriage return, and the ranges from U+0020 to U+D7FF, U+E000 to U+FFFD
 * and U+10000 up. A lone surrogate is in none of them.
 */
// eslint-disable-next-line no-control-regex
const NOT_XML = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
