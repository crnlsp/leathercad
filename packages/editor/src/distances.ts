import { EPS_POINT, type Mm } from '@leathercad/core';
import {
  dependentsOf,
  edgeClearance,
  materialOf,
  type Feature,
  type FeatureId,
  type Part,
  type Project,
  type ResolvedProject,
} from '@leathercad/domain';
import {
  PathOps,
  RectOps,
  SegmentOps,
  intersectSegments,
  line,
  polyline,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import { CANVAS, boardTextItem, pathItem, type DisplayItem } from '@leathercad/render';

/**
 * Live distances while a move is under way (3.17, smart-guides spec §7): how
 * far it went, how far a feature moved inside its piece is from that piece's
 * outline along the four world axes, and a hole's clearance from every edge as
 * `HOLE_TOO_CLOSE_TO_EDGE` judges it. Facts in millimetres; the app words them.
 */

export type RayDirection = 'left' | 'right' | 'down' | 'up';

/** From the moved feature's side, or a hole's rim, to the first crossing with the outline. */
export interface RayDistance {
  readonly direction: RayDirection;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly distanceMm: Mm;
}

/**
 * How near the moved holes come to an edge, by the domain's own judgement
 * (`edgeClearance`): `off` is what Problems lists as `OUTSIDE_PART`,
 * `too-close` as `HOLE_TOO_CLOSE_TO_EDGE`.
 */
export interface Clearance {
  readonly verdict: 'clear' | 'too-close' | 'off';
  /** The least leather left between a hole's cut and an edge, of the holes on it; never below 0. */
  readonly clearanceMm: Mm;
}

/** What a move reads while it is under way, and what is said when it is kept. */
export interface MoveReadout {
  /** How far it went, as it will be stored. */
  readonly deltaMm: Vec2;
  /** Features inside a piece only, to its outline: none for whole pieces. */
  readonly rays: readonly RayDistance[];
  /** Holes inside a piece only; null when nothing moved punches the leather. */
  readonly clearance: Clearance | null;
}

const DIRECTIONS: readonly (readonly [RayDirection, Vec2])[] = [
  ['left', { x: -1, y: 0 }],
  ['right', { x: 1, y: 0 }],
  ['down', { x: 0, y: -1 }],
  ['up', { x: 0, y: 1 }],
];

/**
 * Where a ray from `from` along the unit `direction` first meets the path, and
 * how far along it that is; null when it never does. Exact: the crossing comes
 * from `intersectSegments`, analytic for lines and arcs, polished on cubics.
 */
export function rayCrossing(
  path: Path,
  from: Vec2,
  direction: Vec2,
): { readonly point: Vec2; readonly distanceMm: Mm } | null {
  const box = PathOps.bbox(path);
  if (box === null) return null;
  // Long enough to leave the path's box from anywhere: past its farthest corner.
  const reach =
    Math.hypot(
      Math.max(Math.abs(box.minX - from.x), Math.abs(box.maxX - from.x)),
      Math.max(Math.abs(box.minY - from.y), Math.abs(box.maxY - from.y)),
    ) + 1;
  const end = { x: from.x + direction.x * reach, y: from.y + direction.y * reach };
  const ray = line(from, end);
  const reached = RectOps.fromCorners(from, end);
  let nearest: { point: Vec2; distanceMm: Mm } | null = null;
  // Only a segment whose box meets the ray's can cross it: a scan of boxes,
  // not `intersectPaths`' pairing of every segment with every other.
  for (const segment of path.segments) {
    if (!RectOps.intersects(SegmentOps.bbox(segment), reached, EPS_POINT)) continue;
    for (const { point } of intersectSegments(ray, segment)) {
      const distanceMm = Math.hypot(point.x - from.x, point.y - from.y);
      if (nearest === null || distanceMm < nearest.distanceMm) nearest = { point, distanceMm };
    }
  }
  return nearest;
}

/**
 * The four distances from a moved extent to the outline (spec §7): from the
 * middle of each side, or for a hole of radius `rimMm` from its rim, square to
 * it. A direction the outline does not lie in is left out. Four crossings, the
 * work bound of a pointer move.
 */
export function rayDistances(outline: Path, box: Rect, rimMm: Mm | null): RayDistance[] {
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const out: RayDistance[] = [];
  for (const [direction, unit] of DIRECTIONS) {
    const side =
      rimMm === null
        ? {
            x: unit.x === 0 ? centre.x : unit.x < 0 ? box.minX : box.maxX,
            y: unit.y === 0 ? centre.y : unit.y < 0 ? box.minY : box.maxY,
          }
        : { x: centre.x + unit.x * rimMm, y: centre.y + unit.y * rimMm };
    // A hole is measured from its centre, so a rim on the very edge still
    // finds the edge; the rim then starts where the distance does.
    const start = rimMm === null ? side : centre;
    const hit = rayCrossing(outline, start, unit);
    if (hit === null) continue;
    out.push({
      direction,
      from: side,
      to: hit.point,
      distanceMm: rimMm === null ? hit.distanceMm : hit.distanceMm - rimMm,
    });
  }
  return out;
}

/**
 * The clearance of what was moved, where it is now: every hole among `ids`,
 * each against its own piece's material, as validation judges it. Null when
 * none of them punches the leather.
 */
export function clearanceOf(resolved: ResolvedProject, ids: ReadonlySet<string>): Clearance | null {
  let verdict: Clearance['verdict'] | null = null;
  let clearanceMm = Number.POSITIVE_INFINITY;
  for (const part of resolved.parts) {
    const material = materialOf(part);
    // A part with no outline is judged for nothing, as validation judges it.
    if (material.outer === null) continue;
    for (const entry of part.features) {
      if (!entry.ok || !ids.has(entry.feature.id)) continue;
      const each = edgeClearance(entry, material);
      if (each === null) continue;
      const said = each.off.length > 0 ? 'off' : each.tight.length > 0 ? 'too-close' : 'clear';
      verdict = verdict === null || RANK[said] > RANK[verdict] ? said : verdict;
      clearanceMm = Math.min(clearanceMm, each.clearanceMm);
    }
  }
  return verdict === null ? null : { verdict, clearanceMm };
}

const RANK = { clear: 0, 'too-close': 1, off: 2 } as const;

/**
 * The piece features are moved inside (3.18): the part every one of them lies
 * in, when none is its outline. Null for whole pieces, and for features in
 * several pieces.
 */
export function hostPart(project: Project, about: readonly FeatureId[]): Part | null {
  const owners = new Map(
    project.parts.flatMap((part) =>
      part.features.map((feature) => [feature.id, { part, feature }] as const),
    ),
  );
  const held = about.map((id) => owners.get(id));
  const host = held[0]?.part;
  if (host === undefined) return null;
  return held.every((each) => each?.part === host && !isOutline(each.feature)) ? host : null;
}

export const isOutline = (feature: Feature): boolean =>
  feature.kind === 'cut-contour' && feature.role === 'outer';

/**
 * What moves with a move inside a piece and may punch the leather: what is
 * moved, and what follows it — a rivet's counterpart across a fold.
 */
export function punchedBy(project: Project, moving: readonly FeatureId[]): ReadonlySet<string> {
  return new Set([...moving, ...dependentsOf(project, moving)]);
}

/**
 * The rays drawn on the board (spec §7, §9): a thin line in the tools' live
 * colour from the moved feature to the outline, its length beside it in the
 * app's words. A gap under `MIN_LABEL_PX` on screen is not drawn, so a
 * zoomed-out board is not covered in numbers. Without `words`, nothing is.
 */
export function distanceOverlay(
  rays: readonly RayDistance[],
  pxPerMm: number,
  words?: (mm: Mm) => string,
): DisplayItem[] {
  if (words === undefined) return [];
  const items: DisplayItem[] = [];
  for (const ray of rays) {
    if (ray.distanceMm * pxPerMm < MIN_LABEL_PX) continue;
    items.push(
      pathItem('construction', polyline([ray.from, ray.to]), {
        colour: CANVAS.overlay.preview,
        widthPx: 1,
        dashMm: [],
      }),
    );
    const middle = { x: (ray.from.x + ray.to.x) / 2, y: (ray.from.y + ray.to.y) / 2 };
    // Above a level line; left of an upright one, clear of the readout the
    // app shows right of the pointer.
    const gap = LABEL_GAP_PX / pxPerMm;
    const level = ray.direction === 'left' || ray.direction === 'right';
    items.push(
      boardTextItem(
        level ? { x: middle.x, y: middle.y + gap } : { x: middle.x - gap, y: middle.y },
        words(ray.distanceMm),
        CANVAS.text.value,
        CANVAS.overlay.preview,
        { align: level ? 'center' : 'right' },
      ),
    );
  }
  return items;
}

/** The smallest gap on screen, in CSS pixels, that is labelled (spec §7). */
const MIN_LABEL_PX = 24;
/** How far a label sits off its line, in CSS pixels. */
const LABEL_GAP_PX = 4;
