import { EPS_ANGLE, assertFinite } from '@leathercad/core';
import type { LayerRole } from '@leathercad/domain';
import {
  EXPORT_TOLERANCE_MM,
  MatOps,
  PathOps,
  RectOps,
  SegmentOps,
  type ArcSegment,
  type Path,
  type Rect,
  type Segment,
  type Vec2,
} from '@leathercad/geometry';

import { circleOf, fileBoundsOf, fileLayersOf, mmFixed, mmText } from '../fileScene.js';
import { PRINT_STYLES, type ExportScene } from '../scene.js';

export interface DxfExportResult {
  /** The file, as text. It is ASCII, with `\r\n` line ends on every platform. */
  readonly text: string;
  /**
   * The box of the drawing on the board, in model millimetres. The file's origin
   * is this box's lower left corner, so a point in the file maps back to the board
   * by adding `minX` and `minY`.
   */
  readonly boundsMm: Rect;
}

/**
 * Writes the drawing as a DXF: lines, arcs and circles for a laser cutter or a
 * CNC program, in millimetres.
 *
 * **The dialect is R12 (`AC1009`).** It is the most widely read DXF there is: a
 * valid R12 file needs only an `ENTITIES` section, every CAM and laser program
 * reads it, and LightBurn writes it itself for that reason. What R12 lacks, this
 * does without. It has no `LWPOLYLINE` (that is R14's), so a curve is a
 * `POLYLINE` with `VERTEX`es and a `SEQEND`; and no spline, so a cubic is
 * flattened to 0.005 mm, the export tolerance.
 *
 * **It has no unit either.** `$INSUNITS` and `$MEASUREMENT` came with R2000, and
 * a DXF before it is unitless, which is how a pattern arrives 25.4 times too big
 * or small. They are written anyway: `$INSUNITS = 4` (millimetres) and
 * `$MEASUREMENT = 1` (metric), as extra header variables. A header is a list of
 * named variables and a reader skips a name it does not know; QCAD's dxflib
 * hands every variable it finds to its host without looking at the file's
 * version, and LightBurn's *Auto-detect units* reads `$INSUNITS`. A reader that
 * insists on R2000 for them falls back to its own unit setting, and the maker
 * chooses millimetres there. A file of `AC1015` would say it properly, but
 * R2000 wants handles, subclass markers, a block record table and an objects
 * section, and a strict reader refuses a file that has any of them wrong — a
 * worse trade for the programs that matter here.
 *
 * What an entity is, as `printing.md` §11 says: a line is a `LINE`, an arc an
 * `ARC` (always counter-clockwise, so a clockwise arc is written from its end
 * to its start), a whole circle a `CIRCLE` — a stitch hole too, at the 1 mm the
 * scene gives it, since laser software ignores a `POINT`. Words are the
 * typeface's outlines as closed polylines, never a `TEXT` and so never a font.
 *
 * Layers are the layer roles, named as the domain names them and as the SVG
 * names its groups, each with the colour index of the role and a linetype of the
 * role's true dash rhythm in millimetres, which laser software that sorts by
 * colour, and CAD software that sorts by layer, both use. Y is up in a DXF as
 * in the model, so nothing is flipped; the drawing is moved so its lower left
 * corner is the origin, as the SVG's page is. It is the scene the PDF is written
 * from, so it holds exactly what the PDF prints.
 *
 * @throws RangeError when the scene draws nothing, which has no extents to give.
 * The interface does not offer the export then.
 */
export function exportDxf(scene: ExportScene): DxfExportResult {
  const layers = fileLayersOf(scene);
  const bounds = fileBoundsOf(layers);
  if (bounds === null) throw new RangeError('nothing to export: the scene draws nothing');

  // Only a move: the file's origin is the drawing's lower left corner.
  const move = MatOps.fromTranslation({ x: -bounds.minX, y: -bounds.minY });
  const out: string[] = [];
  const tag = (code: number, value: string | number): void => {
    out.push(String(code).padStart(3, ' '), String(value));
  };

  tag(0, 'SECTION');
  tag(2, 'HEADER');
  tag(9, '$ACADVER');
  tag(1, 'AC1009');
  // Not in R12; see above.
  tag(9, '$INSUNITS');
  tag(70, 4);
  tag(9, '$MEASUREMENT');
  tag(70, 1);
  for (const [name, corner] of [
    ['$EXTMIN', { x: 0, y: 0 }],
    ['$EXTMAX', { x: RectOps.width(bounds), y: RectOps.height(bounds) }],
  ] as const) {
    tag(9, name);
    tag(10, mmFixed(corner.x));
    tag(20, mmFixed(corner.y));
    tag(30, mmFixed(0));
  }
  tag(0, 'ENDSEC');

  tag(0, 'SECTION');
  tag(2, 'TABLES');

  // Linetypes: CONTINUOUS, and one for each role the role table dashes.
  const dashed = layers.filter((layer) => PRINT_STYLES[layer.role].dashMm.length > 0);
  tag(0, 'TABLE');
  tag(2, 'LTYPE');
  tag(70, 1 + dashed.length);
  tag(0, 'LTYPE');
  tag(2, 'CONTINUOUS');
  tag(70, 0);
  tag(3, 'Solid line');
  tag(72, 65);
  tag(73, 0);
  tag(40, mmFixed(0));
  for (const { role } of dashed) {
    const items = dashItems(PRINT_STYLES[role].dashMm);
    tag(0, 'LTYPE');
    tag(2, role);
    tag(70, 0);
    tag(3, `${role}: ${PRINT_STYLES[role].dashMm.map(mmText).join(' ')} mm`);
    tag(72, 65);
    tag(73, items.length);
    tag(40, mmFixed(items.reduce((total, item) => total + Math.abs(item), 0)));
    for (const item of items) tag(49, mmFixed(item));
  }
  tag(0, 'ENDTAB');

  // Layers: layer 0, which every drawing has, and one for each role drawn.
  tag(0, 'TABLE');
  tag(2, 'LAYER');
  tag(70, 1 + layers.length);
  for (const [name, colour, linetype] of [
    ['0', 7, 'CONTINUOUS'],
    ...layers.map(
      ({ role }) =>
        [
          role,
          COLOUR_INDEX[role],
          PRINT_STYLES[role].dashMm.length > 0 ? role : 'CONTINUOUS',
        ] as const,
    ),
  ] as const) {
    tag(0, 'LAYER');
    tag(2, name);
    tag(70, 0);
    tag(62, colour);
    tag(6, linetype);
  }
  tag(0, 'ENDTAB');
  tag(0, 'ENDSEC');

  tag(0, 'SECTION');
  tag(2, 'ENTITIES');
  const entities = new Entities(tag);
  for (const layer of layers) {
    for (const path of layer.paths) entities.path(layer.role, PathOps.transform(path, move));
    for (const text of layer.texts) {
      for (const glyph of text.glyphs) {
        const outline = PathOps.flattenPath(PathOps.transform(glyph, move), EXPORT_TOLERANCE_MM);
        entities.polyline(layer.role, outline, true);
      }
    }
  }
  tag(0, 'ENDSEC');
  tag(0, 'EOF');

  return { text: out.join('\r\n') + '\r\n', boundsMm: bounds };
}

/**
 * The colour index (ACI) of each role's layer: one each, so laser software that
 * maps a DXF's colours to its layers keeps the roles apart. As near the canvas's
 * colour as the index has — the cut line black on white (7), the stitch line
 * blue — except that a stitch line's holes are cyan, which they are not on the
 * canvas: a laser operator punches the holes and may only score the line.
 */
const COLOUR_INDEX: Readonly<Record<LayerRole, number>> = {
  cut: 7,
  stitch: 5,
  'stitch-holes': 4,
  fold: 3,
  mark: 8,
  hardware: 6,
  annotation: 30,
  construction: 9,
};

/**
 * A dash rhythm as a DXF linetype writes it: lengths that alternate pen down,
 * positive, and pen up, negative. An odd list is repeated, as an SVG repeats
 * one, so the dash and the gap swap places on the second round.
 */
export function dashItems(dashMm: readonly number[]): number[] {
  const pattern = dashMm.length % 2 === 0 ? dashMm : [...dashMm, ...dashMm];
  return pattern.map((length, i) => (i % 2 === 0 ? length : -length));
}

/** The angle of an arc as DXF writes it: degrees from 0 up to, and not including, 360. */
function degrees(radians: number): string {
  assertFinite(radians, 'arc angle');
  const wrapped = ((((radians * 180) / Math.PI) % 360) + 360) % 360;
  const text = wrapped.toFixed(6);
  // A hair under a whole turn rounds up to 360, which is 0.
  return Number(text) >= 360 ? (0).toFixed(6) : text;
}

class Entities {
  constructor(private readonly tag: (code: number, value: string | number) => void) {}

  /** A path, segment by segment: its cubics are the only part that is flattened. */
  path(layer: LayerRole, path: Path): void {
    const circle = circleOf(path);
    if (circle !== null) return this.circle(layer, circle.centre, circle.radius);

    // A closed loop of cubics alone is one closed polyline.
    if (path.closed && path.segments.length > 0 && path.segments.every((s) => s.kind === 'cubic')) {
      return this.polyline(layer, PathOps.flattenPath(path, EXPORT_TOLERANCE_MM), true);
    }

    // Consecutive cubics are one open polyline; a line or an arc ends the run.
    let run: Segment[] = [];
    const flush = (): void => {
      if (run.length > 0) {
        const points = PathOps.flattenPath(PathOps.unsafePath(run, false), EXPORT_TOLERANCE_MM);
        this.polyline(layer, points, false);
      }
      run = [];
    };
    for (const segment of path.segments) {
      if (segment.kind === 'cubic') {
        run.push(segment);
        continue;
      }
      flush();
      if (segment.kind === 'line') this.line(layer, segment.a, segment.b);
      else this.arc(layer, segment);
    }
    flush();
  }

  private line(layer: LayerRole, a: Vec2, b: Vec2): void {
    // A line with no length in the file cuts nothing, and some programs refuse it.
    if (mmFixed(a.x) === mmFixed(b.x) && mmFixed(a.y) === mmFixed(b.y)) return;
    this.tag(0, 'LINE');
    this.tag(8, layer);
    this.point(10, a);
    this.point(11, b);
  }

  private arc(layer: LayerRole, arc: ArcSegment): void {
    // A radius of nothing in the file, or a sweep of nothing, is no arc.
    if (Number(mmFixed(arc.radius)) <= 0 || Math.abs(arc.sweepAngle) < EPS_ANGLE) return;

    // Always counter-clockwise from the start angle to the end angle: a clockwise
    // arc is the same arc, drawn from its far end.
    const from = arc.sweepAngle > 0 ? arc.startAngle : arc.startAngle + arc.sweepAngle;
    const [start, end] = [degrees(from), degrees(from + Math.abs(arc.sweepAngle))];
    const whole = Math.abs(arc.sweepAngle) > Math.PI;

    // Written to six decimals, a sweep a hair short of a whole turn has the same
    // two angles as one a hair long of nothing, and a reader draws either as a
    // whole circle. So a long one is one, and a short one is nothing.
    if (start === end) {
      if (whole) this.circle(layer, arc.centre, arc.radius);
      return;
    }
    if (Math.abs(arc.sweepAngle) >= SegmentOps.FULL_TURN - EPS_ANGLE) {
      this.circle(layer, arc.centre, arc.radius);
      return;
    }

    this.tag(0, 'ARC');
    this.tag(8, layer);
    this.point(10, arc.centre);
    this.tag(40, mmFixed(arc.radius));
    this.tag(50, start);
    this.tag(51, end);
  }

  private circle(layer: LayerRole, centre: Vec2, radius: number): void {
    this.tag(0, 'CIRCLE');
    this.tag(8, layer);
    this.point(10, centre);
    this.tag(40, mmFixed(radius));
  }

  /**
   * A polyline, as R12 has one: a `POLYLINE` that says vertices follow, each
   * `VERTEX`, and a `SEQEND`. A closed one is closed by its flag and does not
   * repeat its first vertex. Nothing is written for fewer points than a line.
   */
  polyline(layer: LayerRole, points: readonly Vec2[], closed: boolean): void {
    if (points.length < (closed ? 3 : 2)) return;
    this.tag(0, 'POLYLINE');
    this.tag(8, layer);
    this.tag(66, 1);
    this.point(10, { x: 0, y: 0 });
    this.tag(70, closed ? 1 : 0);
    for (const vertex of points) {
      this.tag(0, 'VERTEX');
      this.tag(8, layer);
      this.point(10, vertex);
    }
    this.tag(0, 'SEQEND');
    this.tag(8, layer);
  }

  /** A point as group codes `code`, `code + 10` and `code + 20`: x, y and a z of nothing. */
  private point(code: number, at: Vec2): void {
    this.tag(code, mmFixed(at.x));
    this.tag(code + 10, mmFixed(at.y));
    this.tag(code + 20, mmFixed(0));
  }
}
