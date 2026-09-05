import type { FeatureId, ResolvedProject } from '@leathercad/domain';
import { dotsItem, pathItem, type DisplayItem } from '@leathercad/render';
import {
  intersectPaths,
  PathOps,
  SegmentOps,
  dist,
  polyline,
  type Path,
  type Vec2,
} from '@leathercad/geometry';

/**
 * What the cursor caught, in priority order.
 *
 * The order is a product decision, not an implementation detail: an endpoint
 * beats the edge running through it, because a user aiming at a corner means
 * the corner. See docs/product-spec.md §133.
 */
export type SnapKind = 'endpoint' | 'midpoint' | 'centre' | 'intersection' | 'on-path' | 'grid';

const PRIORITY: readonly SnapKind[] = [
  'endpoint',
  'midpoint',
  'centre',
  'intersection',
  'on-path',
  'grid',
];

export interface SnapCandidate {
  readonly kind: SnapKind;
  readonly point: Vec2;
  /** Absent for grid snaps, which belong to no feature. */
  readonly featureId?: FeatureId;
}

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
   * Features to ignore — normally whatever is being dragged. Snapping a shape
   * to its own corner would pin it in place.
   */
  readonly exclude?: readonly FeatureId[];
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
  readonly buckets: ReadonlyMap<string, readonly SnapCandidate[]>;
}

/** 20 mm holds a useful number of targets without making buckets huge. */
const DEFAULT_CELL_MM = 20;

export function buildSnapIndex(
  resolved: ResolvedProject,
  options: SnapIndexOptions = {},
): SnapIndex {
  const cellMm = options.cellMm ?? DEFAULT_CELL_MM;
  const buckets = new Map<string, SnapCandidate[]>();

  const add = (candidate: SnapCandidate): void => {
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
        add({ kind: 'endpoint', point: SegmentOps.start(segment), featureId: entry.feature.id });
        add({ kind: 'endpoint', point: SegmentOps.end(segment), featureId: entry.feature.id });
        add({
          kind: 'midpoint',
          point: SegmentOps.pointAt(segment, 0.5),
          featureId: entry.feature.id,
        });

        if (segment.kind === 'arc') {
          add({ kind: 'centre', point: segment.centre, featureId: entry.feature.id });
        }
      }
    }
  }

  // Crossings between features. Quadratic in the feature count, which is fine
  // at the scale a pattern reaches and is done once per revision rather than
  // per pointer move.
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      for (const hit of intersectPaths(visible[i]!.path, visible[j]!.path)) {
        add({ kind: 'intersection', point: hit.point, featureId: visible[i]!.id });
      }
    }
  }

  return { cellMm, buckets };
}

/**
 * The best snap for a cursor position, or null if nothing is in range.
 *
 * Priority first, distance second: the nearest endpoint beats a closer
 * midpoint, because the kinds mean different things to the person aiming.
 */
export function snap(
  index: SnapIndex,
  resolved: ResolvedProject,
  cursorMm: Vec2,
  options: SnapOptions,
): SnapCandidate | null {
  const excluded = new Set(options.exclude ?? []);
  const allows = (kind: SnapKind): boolean => options.enabled?.[kind] !== false;

  const byKind = new Map<SnapKind, SnapCandidate>();
  const consider = (candidate: SnapCandidate): void => {
    if (!allows(candidate.kind)) return;
    if (candidate.featureId !== undefined && excluded.has(candidate.featureId)) return;
    if (dist(candidate.point, cursorMm) > options.toleranceMm) return;

    const best = byKind.get(candidate.kind);
    if (best === undefined || dist(candidate.point, cursorMm) < dist(best.point, cursorMm)) {
      byKind.set(candidate.kind, candidate);
    }
  };

  for (const candidate of nearbyCandidates(index, cursorMm, options.toleranceMm)) {
    consider(candidate);
  }

  if (allows('on-path')) {
    for (const part of resolved.parts) {
      for (const entry of part.features) {
        if (!entry.ok || !entry.feature.visible || entry.feature.locked) continue;
        if (excluded.has(entry.feature.id)) continue;

        const closest = closestPointOnPath(entry.path, cursorMm);
        if (closest !== null) {
          consider({ kind: 'on-path', point: closest, featureId: entry.feature.id });
        }
      }
    }
  }

  if (options.gridMm !== undefined && options.gridMm > 0 && allows('grid')) {
    const g = options.gridMm;
    // Not quantised here: quantisation happens when a value enters the
    // document (CLAUDE.md invariant 8), and a snap result is a proposal the
    // command layer still has to accept.
    consider({ kind: 'grid', point: { x: round(cursorMm.x, g), y: round(cursorMm.y, g) } });
  }

  for (const kind of PRIORITY) {
    const found = byKind.get(kind);
    if (found !== undefined) return found;
  }

  return null;
}

/** Candidates from every bucket the search circle touches. */
function* nearbyCandidates(index: SnapIndex, at: Vec2, radiusMm: number): Iterable<SnapCandidate> {
  if (!Number.isFinite(index.cellMm)) {
    for (const bucket of index.buckets.values()) yield* bucket;
    return;
  }

  const minX = Math.floor((at.x - radiusMm) / index.cellMm);
  const maxX = Math.floor((at.x + radiusMm) / index.cellMm);
  const minY = Math.floor((at.y - radiusMm) / index.cellMm);
  const maxY = Math.floor((at.y + radiusMm) / index.cellMm);

  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      const bucket = index.buckets.get(`${cx},${cy}`);
      if (bucket !== undefined) yield* bucket;
    }
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
 * Sized in **device pixels** and converted through the scale, so the glyph
 * stays the same size at any zoom while sitting at a true millimetre position.
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
const SNAP_COLOUR = '#e86bff';
