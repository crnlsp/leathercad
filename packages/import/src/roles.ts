import { approxEq, checkResourceLimit, EPS_ANGLE, EPS_LENGTH, EPS_POINT } from '@leathercad/core';
import {
  dist,
  PathOps,
  RectOps,
  SegmentOps,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

/** The layer names that decide a shape's role over its shape (9.20b). */
export type LayerName = 'cut' | 'stitch' | 'fold';
export const LAYER_NAMES: readonly LayerName[] = ['cut', 'stitch', 'fold'];

/** What role assignment needs of a converted shape: its paths and its nearest named layer. */
export interface RoleInput {
  readonly paths: readonly Path[];
  readonly layer?: LayerName;
}

/** One piece of leather, its paths sorted by what they are. Millimetres, Y up. */
export interface ImportedPiece {
  readonly outline: Path;
  readonly cutOuts: readonly Path[];
  readonly stitchLines: readonly Path[];
  readonly foldLines: readonly Path[];
  readonly markings: readonly Path[];
}

/** Small equal circles in a row: probably holes to punch, reported and not imported. */
export interface LikelyHoleRow {
  readonly count: number;
  readonly diameterMm: number;
}

/** A path that came through conversion and still found no place in a piece. */
export type LeftOutReason = 'outside-piece' | 'open-on-cut-layer';

export interface SvgPattern {
  readonly pieces: readonly ImportedPiece[];
  readonly likelyHoles: readonly LikelyHoleRow[];
  readonly leftOut: Readonly<Partial<Record<LeftOutReason, number>>>;
}

/**
 * The widest circle taken for a likely hole: a stitching punch's or a pricking
 * iron's. A belt's or a rivet's holes are wider, and stay cut-outs.
 */
export const LIKELY_HOLE_MAX_DIAMETER_MM = 3;
/** The furthest apart two holes of one row lie: past the coarsest iron's pitch. */
const LIKELY_HOLE_MAX_PITCH_MM = 7;
const ROW_MIN = 3;

interface Circle {
  readonly path: Path;
  readonly centre: Vec2;
  readonly radius: number;
}

/** A closed path of arcs about one centre that sweep once round, or null. */
function circleOf(p: Path): Circle | null {
  if (!p.closed) return null;
  let sweep = 0;
  const first = p.segments[0];
  if (first?.kind !== 'arc') return null;
  for (const s of p.segments) {
    if (
      s.kind !== 'arc' ||
      !approxEq(s.radius, first.radius, EPS_LENGTH) ||
      dist(s.centre, first.centre) > EPS_POINT
    )
      return null;
    sweep += s.sweepAngle;
  }
  if (!approxEq(Math.abs(sweep), 2 * Math.PI, EPS_ANGLE)) return null;
  return { path: p, centre: first.centre, radius: first.radius };
}

/**
 * Rows of three or more equal small circles, each within a pitch of the next.
 * Returns the rows and the circles that made none, which are cut like any
 * other closed path.
 */
function likelyHoleRows(
  circles: readonly Circle[],
  spend: Spend,
): { rows: Circle[][]; rest: Circle[] } {
  // ponytail: a sweep along x, quadratic only for circles stacked in one
  // column, planned against `spend`; a grid of cells if a real file ever needs more.
  const sorted = [...circles].sort((a, b) => a.centre.x - b.centre.x);
  // The comparisons the sweep makes, counted before it makes them: each
  // circle against those within a pitch to its right, and the one that ends its run.
  let pairs = 0;
  for (let i = 0, end = 0; i < sorted.length; i++) {
    while (
      end < sorted.length &&
      sorted[end]!.centre.x - sorted[i]!.centre.x <= LIKELY_HOLE_MAX_PITCH_MM
    )
      end++;
    pairs += end - i;
  }
  spend(pairs * PAIR_WORK);
  const parent = sorted.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] = parent[parent[r]!]!;
    return r;
  };
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.centre.x - a.centre.x > LIKELY_HOLE_MAX_PITCH_MM) break;
      if (
        approxEq(a.radius, b.radius, EPS_LENGTH) &&
        dist(a.centre, b.centre) <= LIKELY_HOLE_MAX_PITCH_MM
      )
        parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, Circle[]>();
  sorted.forEach((c, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) ?? []), c]);
  });
  const rows: Circle[][] = [],
    rest: Circle[] = [];
  for (const group of groups.values()) {
    if (group.length >= ROW_MIN) rows.push(group);
    else rest.push(...group);
  }
  return { rows, rest };
}

/** Points on a path that a containing path must hold: each segment's start and middle. */
function probes(p: Path): Vec2[] {
  return p.segments.flatMap((s) => [SegmentOps.start(s), SegmentOps.pointAt(s, 0.5)]);
}

/**
 * Counts work against `svgShapeTests` before it is done, refusing the file
 * past it (PERF-012): a point tested against one segment is a unit of it.
 */
type Spend = (work: number) => void;
/**
 * Two shapes compared — their bounds, planned and then tested, or two circle
 * centres — cost about 50 segment tests, measured.
 */
const PAIR_WORK = 50;

/** A closed path with its bounds and area, each computed once, not once per pair. */
interface Boxed {
  readonly path: Path;
  readonly box: Rect | null;
  readonly area: number;
}

function mayHold(outer: Boxed, inner: Boxed): boolean {
  return outer.box !== null && inner.box !== null && RectOps.containsRect(outer.box, inner.box);
}

function holds(outer: Boxed, inner: Boxed): boolean {
  return (
    mayHold(outer, inner) &&
    probes(inner.path).every((point) => PathOps.containsPoint(outer.path, point))
  );
}

/**
 * Sorts converted shapes into pieces (9.20b), headless and pure.
 *
 * By layer name first: on a `stitch` layer a path is a stitch line, on a
 * `fold` layer a fold line, on a `cut` layer a closed path is cut. Otherwise by
 * shape: rows of small equal circles are likely holes, reported and left for
 * the maker to make; other closed paths are cut; open ones are markings.
 *
 * What is cut nests by containment and alternates: a path in no other is a
 * piece's outline, one inside an outline is that piece's cut-out, and one
 * inside a cut-out is a piece of its own, lying in the window. Lines, stitch
 * and folds belong to the innermost outline around them; outside every one,
 * they are left out and counted.
 */
export function assignRoles(shapes: readonly RoleInput[]): SvgPattern {
  const cut: Path[] = [],
    lines: { path: Path; as: 'stitch' | 'fold' | 'marking' }[] = [],
    circles: Circle[] = [],
    leftOut: Partial<Record<LeftOutReason, number>> = {};
  let work = 0;
  const spend: Spend = (n) => checkResourceLimit('svgShapeTests', (work += n));
  const leave = (reason: LeftOutReason): void => {
    leftOut[reason] = (leftOut[reason] ?? 0) + 1;
  };
  for (const { paths, layer } of shapes)
    for (const p of paths) {
      if (layer === 'stitch' || layer === 'fold') lines.push({ path: p, as: layer });
      else if (!p.closed) {
        if (layer === 'cut') leave('open-on-cut-layer');
        else lines.push({ path: p, as: 'marking' });
      } else {
        const circle = layer === 'cut' ? null : circleOf(p);
        if (circle !== null && 2 * circle.radius <= LIKELY_HOLE_MAX_DIAMETER_MM)
          circles.push(circle);
        else cut.push(p);
      }
    }
  const { rows, rest } = likelyHoleRows(circles, spend);
  cut.push(...rest.map((c) => c.path));

  // Largest first, so every container is placed before what it holds.
  // ponytail: each path is tried against every larger one, quadratic in the
  // closed paths; the bounding-box test keeps a real pattern cheap, and
  // `spend` refuses a file past svgShapeTests. A spatial index if one needs more.
  // Planned before the first point is tested: every pair's bounds, then the
  // point tests of each pair whose bounds nest — at most, as the pass stops
  // at the nearest container.
  spend(((cut.length * (cut.length - 1)) / 2) * PAIR_WORK);
  const boxed = cut.map((path) => ({ path, box: PathOps.bbox(path), area: PathOps.area(path) }));
  const order = cut.map((_, i) => i).sort((a, b) => boxed[b]!.area - boxed[a]!.area);
  for (const [k, i] of order.entries())
    for (let m = 0; m < k; m++) {
      const outer = boxed[order[m]!]!,
        inner = boxed[i]!;
      if (mayHold(outer, inner)) spend(2 * inner.path.segments.length * outer.path.segments.length);
    }
  const depth = new Map<number, number>(),
    owner = new Map<number, number>();
  for (const [k, i] of order.entries()) {
    let parent: number | undefined;
    for (let m = k - 1; m >= 0 && parent === undefined; m--)
      if (holds(boxed[order[m]!]!, boxed[i]!)) parent = order[m];
    const d = parent === undefined ? 0 : (depth.get(parent) ?? 0) + 1;
    depth.set(i, d);
    owner.set(i, d % 2 === 0 ? i : parent!);
  }
  const outlines = cut.flatMap((_, i) => (depth.get(i)! % 2 === 0 ? [i] : []));
  const pieces = new Map(
    outlines.map((i) => [
      i,
      {
        outline: cut[i]!,
        cutOuts: [] as Path[],
        stitchLines: [] as Path[],
        foldLines: [] as Path[],
        markings: [] as Path[],
      },
    ]),
  );
  cut.forEach((p, i) => {
    if (depth.get(i)! % 2 === 1) pieces.get(owner.get(i)!)!.cutOuts.push(p);
  });
  // Innermost first: the smallest outline around a line is the piece it is on.
  const smallestFirst = [...outlines].sort((a, b) => boxed[a]!.area - boxed[b]!.area);
  spend(lines.length * outlines.reduce((sum, i) => sum + cut[i]!.segments.length, 0));
  for (const { path: p, as } of lines) {
    const first = p.segments[0];
    const probe = first === undefined ? null : SegmentOps.pointAt(first, 0.5);
    const home =
      probe === null ? undefined : smallestFirst.find((i) => PathOps.containsPoint(cut[i]!, probe));
    const piece = home === undefined ? undefined : pieces.get(home);
    if (piece === undefined) leave('outside-piece');
    else if (as === 'stitch') piece.stitchLines.push(p);
    else if (as === 'fold') piece.foldLines.push(p);
    else piece.markings.push(p);
  }
  return {
    pieces: outlines.map((i) => pieces.get(i)!),
    likelyHoles: rows.map((r) => ({ count: r.length, diameterMm: 2 * r[0]!.radius })),
    leftOut,
  };
}
