import type { FeatureId, Guide, ResolvedProject } from '@leathercad/domain';
import { approxEq } from '@leathercad/core';
import { guideCrossing, projectToGuide } from '@leathercad/domain';
import { CANVAS, dotsItem, pathItem, type DisplayItem } from '@leathercad/render';
import {
  intersectPaths,
  PathOps,
  SegmentOps,
  RectOps,
  dist,
  polyline,
  type Intersection,
  type Path,
  type Vec2,
} from '@leathercad/geometry';

/** A point the cursor caught, in priority order. */
export type SnapKind =
  'endpoint' | 'midpoint' | 'centre' | 'intersection' | 'guide' | 'on-path' | 'grid';

/**
 * A value one axis of a moving reference caught: alignment, ranks 2 to 7 of
 * the smart-guides spec §5. Nothing collects these yet — 3.16, 3.18 and 3.19
 * do — but they are decided by the same table and the same rules as points.
 */
export type AxisKind =
  'guide-axis' | 'host-centre' | 'host-edge' | 'piece-centre' | 'piece-edge' | 'equal-spacing';

/**
 * The one priority table, highest first (smart-guides spec §5).
 *
 * The order is a product decision, not an implementation detail: an endpoint
 * beats the edge running through it, because a user aiming at a corner means
 * the corner (docs/product-spec.md §133). Every point kind outranks every
 * axis kind, so a point caught wins both axes.
 */
const PRIORITY: readonly (SnapKind | AxisKind)[] = [
  'endpoint',
  'midpoint',
  'centre',
  'intersection',
  'guide',
  'on-path',
  'grid',
  'guide-axis',
  'host-centre',
  'host-edge',
  'piece-centre',
  'piece-edge',
  'equal-spacing',
];

const rank = (kind: SnapKind | AxisKind): number => PRIORITY.indexOf(kind);

/**
 * Where a candidate came from: what a drag must exclude, what hysteresis
 * recognises from one move to the next, and what an overlay can name. A point
 * on a feature names it, a crossing names both of what crossed, a point on a
 * guide names the guide, and the grid names nothing.
 */
export interface SnapSource {
  readonly featureId?: FeatureId;
  /** The second feature of a crossing of two features. */
  readonly otherFeatureId?: FeatureId;
  readonly guideId?: string;
  /** The second guide of a crossing of two guides. */
  readonly otherGuideId?: string;
}

export interface SnapCandidate extends SnapSource {
  readonly kind: SnapKind;
  readonly point: Vec2;
}

/** `x = value` or `y = value`, in millimetres. */
export interface AxisCandidate extends SnapSource {
  readonly kind: AxisKind;
  readonly axis: 'x' | 'y';
  readonly value: number;
}

/**
 * A candidate and how far it is from what is being snapped — the cursor for a
 * point, the reference value for an axis — and its place in document order,
 * which breaks a tie in distance.
 */
export interface Measured<C extends SnapCandidate | AxisCandidate> {
  readonly candidate: C;
  readonly distanceMm: number;
  readonly order: number;
}

/** What was caught: a point, which wins both axes, or else each axis on its own. */
export interface Snapped {
  readonly point: SnapCandidate | null;
  readonly x: AxisCandidate | null;
  readonly y: AxisCandidate | null;
}

/**
 * How far past the tolerance a caught target holds, as a multiple of it.
 * Without it, a cursor between two targets flips between them on every move.
 */
const HOLD = 1.5;

export interface SnapOptions {
  /**
   * In millimetres. The caller converts its pixel radius through the viewport
   * first, so the feel is identical at any zoom — the same reasoning as
   * `hitTest`. See CLAUDE.md invariant 1.
   */
  readonly toleranceMm: number;
  /** Grid pitch. Omit to leave grid snapping off. */
  readonly gridMm?: number;
  /** Kinds absent from this map are enabled. */
  readonly enabled?: Partial<Record<SnapKind, boolean>>;
  /**
   * Features and guides to ignore — normally whatever is being dragged.
   * Snapping a shape to its own corner would pin it in place. A candidate is
   * ignored when anything it came from is.
   */
  readonly exclude?: readonly string[];
  /**
   * What the previous pointer event caught, which holds to 1.5 × tolerance
   * unless a higher kind comes within tolerance. Omit it, or null, to start
   * afresh.
   */
  readonly held?: SnapCandidate | null;
}

export interface SnapIndexOptions {
  /** Bucket size. Larger means fewer, fuller buckets. */
  readonly cellMm?: number;
}

/**
 * Discrete snap targets, bucketed by position.
 *
 * Endpoints, midpoints, centres and intersections are a fixed point set per
 * document revision, so they are gathered once and looked up by cell rather
 * than rescanned on every pointer move. On-path and grid snaps are continuous
 * and computed on demand — there is no point set to index.
 */
export interface SnapIndex {
  readonly cellMm: number;
  readonly buckets: ReadonlyMap<string, readonly IndexedCandidate[]>;
  /** How many candidates in all; the places after them are the ones `snap` computes. */
  readonly size: number;
}

/**
 * A discrete target and its place in document order — parts, then features,
 * then segments, then crossings — which breaks a tie in distance between
 * candidates in different buckets. Carried on the candidate because an index
 * is rebuilt on every move of a drag, and a second array per bucket cost a
 * tenth of that rebuild.
 */
export interface IndexedCandidate extends SnapCandidate {
  readonly order: number;
}

/** 20 mm holds a useful number of targets without making buckets huge. */
const DEFAULT_CELL_MM = 20;

export function buildSnapIndex(
  resolved: ResolvedProject,
  options: SnapIndexOptions = {},
): SnapIndex {
  const cellMm = options.cellMm ?? DEFAULT_CELL_MM;
  const buckets = new Map<string, IndexedCandidate[]>();
  let size = 0;

  const add = (candidate: IndexedCandidate): void => {
    const key = cellKey(candidate.point, cellMm);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [candidate]);
    else bucket.push(candidate);
  };

  const visible: { id: FeatureId; path: Path }[] = [];

  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (!entry.ok || !entry.feature.visible || entry.feature.locked) continue;
      visible.push({ id: entry.feature.id, path: entry.path });

      for (const segment of entry.path.segments) {
        add({
          kind: 'endpoint',
          point: SegmentOps.start(segment),
          featureId: entry.feature.id,
          order: size++,
        });
        add({
          kind: 'endpoint',
          point: SegmentOps.end(segment),
          featureId: entry.feature.id,
          order: size++,
        });
        add({
          kind: 'midpoint',
          point: SegmentOps.pointAt(segment, 0.5),
          featureId: entry.feature.id,
          order: size++,
        });

        if (segment.kind === 'arc') {
          add({
            kind: 'centre',
            point: segment.centre,
            featureId: entry.feature.id,
            order: size++,
          });
        }
      }
    }
  }

  for (const guide of resolved.project.guides ?? []) {
    for (const feature of visible) {
      for (const hit of crossings(feature.path, guide, () => guideCrossings(guide, feature.path))) {
        add({
          kind: 'intersection',
          point: hit.point,
          featureId: feature.id,
          guideId: guide.id,
          order: size++,
        });
      }
    }
  }

  // Crossings between features. Quadratic in the feature count, but a pair is
  // computed once for as long as both paths live: a preview re-evaluates only
  // what it changed, so a drag recomputes the pairs of what moved.
  for (let i = 0; i < visible.length; i++) {
    const a = visible[i]!;
    for (let j = i + 1; j < visible.length; j++) {
      const b = visible[j]!.path;
      for (const hit of crossings(a.path, b, () => intersectPaths(a.path, b))) {
        add({
          kind: 'intersection',
          point: hit.point,
          featureId: a.id,
          otherFeatureId: visible[j]!.id,
          order: size++,
        });
      }
    }
  }

  return { cellMm, buckets, size };
}

/**
 * Crossings by the immutable objects they come from (PERF-004). Evaluation
 * keeps an unchanged feature's path the same object from one revision to the
 * next, and a command leaves an untouched guide as it was, so an edit
 * recomputes the crossings of what it changed and reads the rest. Weak on
 * both keys: nothing to invalidate, and nothing kept once a path has gone.
 */
const crossingsCache = new WeakMap<Path, WeakMap<Path | Guide, readonly Intersection[]>>();

function crossings(
  path: Path,
  other: Path | Guide,
  compute: () => readonly Intersection[],
): readonly Intersection[] {
  let row = crossingsCache.get(path);
  if (row === undefined) crossingsCache.set(path, (row = new WeakMap()));
  let hits = row.get(other);
  if (hits === undefined) row.set(other, (hits = compute()));
  return hits;
}

/** Where an infinite guide crosses a path. */
function guideCrossings(guide: Guide, path: Path): readonly Intersection[] {
  const bounds = PathOps.bbox(path);
  if (bounds === null) return [];
  const centre = projectToGuide(guide, RectOps.centre(bounds));
  // A line centred on the nearest point to the box's centre, extending
  // past its diagonal, includes every possible crossing of that box.
  const reach = Math.hypot(RectOps.width(bounds), RectOps.height(bounds));
  const dx = Math.cos(guide.angleRad) * reach;
  const dy = Math.sin(guide.angleRad) * reach;
  const line = polyline([
    { x: centre.x - dx, y: centre.y - dy },
    { x: centre.x + dx, y: centre.y + dy },
  ]);
  return intersectPaths(line, path);
}

/**
 * The best snap for a cursor position, or null if nothing is in range.
 *
 * Priority first, distance second, document order last: the nearest endpoint
 * beats a closer midpoint, because the kinds mean different things to the
 * person aiming. What was caught last holds (`SnapOptions.held`).
 */
export function snap(
  index: SnapIndex,
  resolved: ResolvedProject,
  cursorMm: Vec2,
  options: SnapOptions,
): SnapCandidate | null {
  const excluded = new Set(options.exclude ?? []);
  const allows = (kind: SnapKind): boolean => options.enabled?.[kind] !== false;
  const held = options.held ?? null;
  // A caught target is looked for out to where it lets go.
  const reach = held === null ? options.toleranceMm : HOLD * options.toleranceMm;

  const found: Measured<SnapCandidate>[] = [];
  const consider = (candidate: SnapCandidate, order: number): void => {
    if (!allows(candidate.kind) || cameFromAny(candidate, excluded)) return;
    const distanceMm = dist(candidate.point, cursorMm);
    if (distanceMm <= reach) found.push({ candidate, distanceMm, order });
  };

  forEachNearby(index, cursorMm, reach, (candidate) => consider(candidate, candidate.order));

  // Computed here, so they come after everything indexed in document order.
  let order = index.size;

  // Guides are infinite; their projections cannot be stored in a point index.
  const guides = (resolved.project.guides ?? []).filter((guide) => !excluded.has(guide.id));
  for (const [at, guide] of guides.entries()) {
    consider({ kind: 'guide', point: projectToGuide(guide, cursorMm), guideId: guide.id }, order++);
    for (const other of guides.slice(at + 1)) {
      const crossing = guideCrossing(guide, other);
      if (crossing !== null) {
        consider(
          { kind: 'intersection', point: crossing, guideId: guide.id, otherGuideId: other.id },
          order++,
        );
      }
    }
  }

  if (allows('on-path')) {
    for (const part of resolved.parts) {
      for (const entry of part.features) {
        if (!entry.ok || !entry.feature.visible || entry.feature.locked) continue;
        if (excluded.has(entry.feature.id)) continue;

        const closest = closestPointOnPath(entry.path, cursorMm);
        if (closest !== null) {
          consider({ kind: 'on-path', point: closest, featureId: entry.feature.id }, order++);
        }
      }
    }
  }

  if (options.gridMm !== undefined && options.gridMm > 0 && allows('grid')) {
    const g = options.gridMm;
    // Not quantised here: quantisation happens when a value enters the
    // document (CLAUDE.md invariant 8), and a snap result is a proposal the
    // command layer still has to accept. Only the nearest grid point is
    // offered, so a grid snap never holds past the next one.
    consider({ kind: 'grid', point: { x: round(cursorMm.x, g), y: round(cursorMm.y, g) } }, order);
  }

  return pick(found, held, options.toleranceMm);
}

/**
 * The one decision (smart-guides spec §5): the points and axis values in
 * reach, measured, and what the previous move caught. A point within
 * tolerance wins both axes; otherwise each axis is decided on its own, and
 * only with smart guides on. Pure: the same inputs give the same answer,
 * whatever order the candidates come in.
 */
export function decideSnap(
  points: readonly Measured<SnapCandidate>[],
  axes: readonly Measured<AxisCandidate>[],
  held: Snapped | null,
  options: { readonly toleranceMm: number; readonly smartGuides: boolean },
): Snapped {
  const point = pick(points, held?.point ?? null, options.toleranceMm);
  if (point !== null || !options.smartGuides) return { point, x: null, y: null };
  const on = (axis: 'x' | 'y') => axes.filter((found) => found.candidate.axis === axis);
  return {
    point: null,
    x: pick(on('x'), held?.x ?? null, options.toleranceMm),
    y: pick(on('y'), held?.y ?? null, options.toleranceMm),
  };
}

/**
 * The best of one set within tolerance — or what was held, while it is within
 * 1.5 × tolerance and nothing of a higher kind is within tolerance.
 */
function pick<C extends SnapCandidate | AxisCandidate>(
  found: readonly Measured<C>[],
  held: C | null,
  toleranceMm: number,
): C | null {
  let best: Measured<C> | null = null;
  let kept: Measured<C> | null = null;
  for (const each of found) {
    if (each.distanceMm <= toleranceMm && (best === null || beats(each, best))) best = each;
    if (
      held !== null &&
      each.distanceMm <= HOLD * toleranceMm &&
      sameTarget(each.candidate, held) &&
      (kept === null || beats(each, kept))
    ) {
      kept = each;
    }
  }
  if (kept !== null && (best === null || rank(best.candidate.kind) >= rank(kept.candidate.kind))) {
    return kept.candidate;
  }
  return best?.candidate ?? null;
}

/**
 * Rank, then distance, then document order. A total order, so the winner does
 * not depend on the order candidates were found in — which is why distances
 * compare exactly rather than through `approxEq`: "as near as" within an
 * epsilon is not transitive, and the winner would depend on the order again.
 */
function beats<C extends SnapCandidate | AxisCandidate>(a: Measured<C>, b: Measured<C>): boolean {
  const byRank = rank(a.candidate.kind) - rank(b.candidate.kind);
  if (byRank !== 0) return byRank < 0;
  if (a.distanceMm < b.distanceMm) return true;
  if (b.distanceMm < a.distanceMm) return false;
  return a.order < b.order;
}

/** Recomputed from the cursor on every move, so known by what they lie on, not where. */
const FOLLOWS_CURSOR: ReadonlySet<SnapKind> = new Set(['guide', 'on-path']);

/** Whether two candidates are one target: one kind, from one source, at one place. */
function sameTarget(a: SnapCandidate | AxisCandidate, b: SnapCandidate | AxisCandidate): boolean {
  if (
    a.kind !== b.kind ||
    a.featureId !== b.featureId ||
    a.otherFeatureId !== b.otherFeatureId ||
    a.guideId !== b.guideId ||
    a.otherGuideId !== b.otherGuideId
  ) {
    return false;
  }
  if ('point' in a && 'point' in b) {
    if (FOLLOWS_CURSOR.has(a.kind)) return true;
    return approxEq(a.point.x, b.point.x) && approxEq(a.point.y, b.point.y);
  }
  if ('axis' in a && 'axis' in b) return a.axis === b.axis && approxEq(a.value, b.value);
  return false;
}

function cameFromAny(candidate: SnapSource, ids: ReadonlySet<string>): boolean {
  return (
    (candidate.featureId !== undefined && ids.has(candidate.featureId)) ||
    (candidate.otherFeatureId !== undefined && ids.has(candidate.otherFeatureId)) ||
    (candidate.guideId !== undefined && ids.has(candidate.guideId)) ||
    (candidate.otherGuideId !== undefined && ids.has(candidate.otherGuideId))
  );
}

/** Every indexed candidate in the buckets the search circle touches. */
function forEachNearby(
  index: SnapIndex,
  at: Vec2,
  radiusMm: number,
  visit: (candidate: IndexedCandidate) => void,
): void {
  const visitBucket = (key: string): void => {
    const bucket = index.buckets.get(key);
    if (bucket !== undefined) for (const candidate of bucket) visit(candidate);
  };

  if (!Number.isFinite(index.cellMm)) {
    for (const key of index.buckets.keys()) visitBucket(key);
    return;
  }

  const minX = Math.floor((at.x - radiusMm) / index.cellMm);
  const maxX = Math.floor((at.x + radiusMm) / index.cellMm);
  const minY = Math.floor((at.y - radiusMm) / index.cellMm);
  const maxY = Math.floor((at.y + radiusMm) / index.cellMm);

  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) visitBucket(`${cx},${cy}`);
  }
}

/**
 * The nearest point on a path, by projecting onto its flattened polyline.
 *
 * Flattening is the approximation here, not the projection: at the export
 * tolerance the polyline is within 5 µm of the curve, which is far below the
 * pick radius the answer is compared against.
 */
function closestPointOnPath(p: Path, at: Vec2): Vec2 | null {
  const points = PathOps.flattenPath(p, 0.005);
  if (points.length < 2) return null;

  let best: Vec2 | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length - 1; i++) {
    const projected = projectOntoSegment(at, points[i]!, points[i + 1]!);
    const d = dist(projected, at);
    if (d < bestDistance) {
      bestDistance = d;
      best = projected;
    }
  }

  return best;
}

function projectOntoSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return a;

  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

const round = (value: number, step: number): number => Math.round(value / step) * step;

const cellKey = (p: Vec2, cellMm: number): string =>
  Number.isFinite(cellMm) ? `${Math.floor(p.x / cellMm)},${Math.floor(p.y / cellMm)}` : 'all';

/**
 * A marker for the snap the cursor has caught.
 *
 * Each kind gets its own shape, because the kinds mean different things and a
 * user needs to know which one they are about to commit to — a corner and the
 * edge running through it are a fraction of a millimetre apart on screen and
 * very different in the file.
 *
 * Sized in **CSS pixels** and converted through the zoom in CSS pixels per
 * millimetre, so the glyph stays the same size at any zoom and on any display
 * while sitting at a true millimetre position.
 */
export function snapGlyph(
  candidate: SnapCandidate,
  pxPerMm: number,
  options: { sizePx?: number; colour?: string } = {},
): DisplayItem[] {
  const half = (options.sizePx ?? 9) / 2 / pxPerMm;
  const colour = options.colour ?? SNAP_COLOUR;
  const { x, y } = candidate.point;
  const stroke = { colour, widthPx: 1.5 };

  const at = (dx: number, dy: number): Vec2 => ({ x: x + dx * half, y: y + dy * half });
  const shape = (points: Vec2[], closed: boolean): DisplayItem =>
    pathItem('construction', polyline(points, closed), stroke);

  switch (candidate.kind) {
    case 'endpoint':
      return [shape([at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], true)];

    case 'midpoint':
      return [shape([at(-1, -1), at(1, -1), at(0, 1)], true)];

    case 'centre':
      return [
        shape([at(-1, 0), at(1, 0)], false),
        shape([at(0, -1), at(0, 1)], false),
        dotsItem('construction', [candidate.point], (options.sizePx ?? 9) / 2, 'transparent'),
      ];

    case 'intersection':
      return [shape([at(-1, -1), at(1, 1)], false), shape([at(-1, 1), at(1, -1)], false)];

    case 'guide':
    case 'on-path':
      return [shape([at(0, -1), at(1, 0), at(0, 1), at(-1, 0)], true)];

    case 'grid':
      return [shape([at(-1, 0), at(1, 0)], false), shape([at(0, -1), at(0, 1)], false)];
  }
}

/**
 * Distinct from every layer role, so a snap marker is never mistaken for
 * geometry — and distinct from the **selection** colour, which is the case
 * that actually bites: the glyph was `#ffd166` against a selection drawn
 * `#ffcc44`, so the marker vanished into the very outline it was pointing at.
 * A glyph exists to say which target is about to be committed to, and one that
 * cannot be picked out from the highlight says nothing.
 *
 * Magenta is the only hue no layer role uses.
 */
const SNAP_COLOUR = CANVAS.overlay.snap;
