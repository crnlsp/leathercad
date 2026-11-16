import { EPS_ANGLE, EPS_POINT, approxEq } from '@leathercad/core';
import type { ResolvedProject } from '@leathercad/domain';
import { CANVAS, pathItem, type DisplayItem } from '@leathercad/render';
import { PathOps, polyline, type Path, type Rect, type Vec2 } from '@leathercad/geometry';

import {
  HOLD,
  decideSnap,
  snapGlyph,
  type AxisCandidate,
  type Measured,
  type Snapped,
} from './snap.js';

/**
 * Smart guides for a moved piece (3.16, smart-guides spec §6): the moving
 * extent's left, centre and right — bottom, centre and top — line up with
 * other pieces' extents and with axis-aligned guides, each axis on its own,
 * by the one priority table in `snap.ts`.
 */

type Axis = 'x' | 'y';

/** A value a moving reference can line up with, and its place in document order. */
export interface AlignTarget extends AxisCandidate {
  readonly order: number;
  /**
   * Where the target runs along its line — its piece's extent on the other
   * axis — for drawing; null for a guide, which runs for ever.
   */
  readonly span: readonly [number, number] | null;
}

interface AxisTargets {
  /**
   * Sorted by value, so a move finds what is in reach by a binary search.
   * Of the targets of one kind at one value only the first in document order
   * is offered: it is the one a tie would choose, and a row of level pieces
   * then costs a move one target, not one each.
   */
  readonly offered: readonly AlignTarget[];
  /** Every target, sorted by value: the pieces a line is drawn through. */
  readonly all: readonly AlignTarget[];
}

export interface AlignTargets {
  readonly x: AxisTargets;
  readonly y: AxisTargets;
}

export interface Alignment {
  /** The move: the raw delta, with each caught axis replaced so a reference lands on its target. */
  readonly delta: Vec2;
  /** What was caught, held by the next move (hysteresis). Never a point. */
  readonly snapped: Snapped;
  /** How many target values this move measured: the work bound (3.16). */
  readonly measured: number;
}

const AXES: readonly Axis[] = ['x', 'y'];

/**
 * Every target a move can line up with, collected once when the gesture begins
 * from the document as it was: nothing else moves during a move. Other
 * pieces' extents, visible or locked — a locked piece is still where it is —
 * and every axis-aligned guide. A piece offers an extent edge only where its
 * outline runs along it straight (spec §6): the extent of a disc or a turned
 * panel is not a side the leather has, so those offer their centre alone.
 */
export function collectAlignTargets(
  resolved: ResolvedProject,
  moving: ReadonlySet<string>,
): AlignTargets {
  const list: AlignTarget[] = [];
  const add = (target: Omit<AlignTarget, 'order'>): void => {
    list.push({ ...target, order: list.length });
  };

  for (const part of resolved.parts) {
    const outline = part.features.find(
      (entry) => entry.ok && entry.feature.kind === 'cut-contour' && entry.feature.role === 'outer',
    );
    if (outline?.ok !== true || !outline.feature.visible) continue;
    if (moving.has(outline.feature.id)) continue;
    const box = PathOps.bbox(outline.path);
    if (box === null) continue;
    const featureId = outline.feature.id;
    for (const axis of AXES) {
      const [low, high] = sides(box, axis);
      const span = sides(box, axis === 'x' ? 'y' : 'x');
      const straight = straightSides(outline.path, axis, low, high);
      if (straight.low) add({ kind: 'piece-edge', axis, value: low, featureId, span });
      add({ kind: 'piece-centre', axis, value: (low + high) / 2, featureId, span });
      if (straight.high) add({ kind: 'piece-edge', axis, value: high, featureId, span });
    }
  }

  for (const guide of resolved.project.guides ?? []) {
    const turn = ((guide.angleRad % Math.PI) + Math.PI) % Math.PI;
    const level = approxEq(turn, 0, EPS_ANGLE) || approxEq(turn, Math.PI, EPS_ANGLE);
    const upright = approxEq(turn, Math.PI / 2, EPS_ANGLE);
    if (!level && !upright) continue;
    const axis: Axis = level ? 'y' : 'x';
    add({ kind: 'guide-axis', axis, value: guide.origin[axis], guideId: guide.id, span: null });
  }

  return indexTargets(list);
}

/** Targets sorted per axis, as a move searches them. */
export function indexTargets(list: readonly AlignTarget[]): AlignTargets {
  const index = (axis: Axis): AxisTargets => {
    const all = list
      .filter((target) => target.axis === axis)
      .sort((a, b) => a.value - b.value || a.order - b.order);
    const seen = new Set<string>();
    const offered = all.filter((target) => {
      const key = `${target.kind} ${target.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { all, offered };
  };
  return { x: index('x'), y: index('y') };
}

/**
 * One pointer move of a piece with this extent, by this raw delta. Pure: the
 * same extent, delta, targets and held result give the same move.
 *
 * Each axis's three references are looked up among the targets within reach —
 * 1.5 × tolerance, where a held target lets go — and `decideSnap` chooses, so
 * a guide outranks a piece's centre, a centre an edge, and the nearest wins
 * within a kind. A caught axis's delta becomes *target − reference* exactly;
 * the command quantises it.
 */
export function alignMove(
  box: Rect,
  raw: Vec2,
  targets: AlignTargets,
  held: Snapped | null,
  options: { readonly toleranceMm: number; readonly smartGuides: boolean },
): Alignment {
  if (!options.smartGuides) return { delta: raw, snapped: NOTHING, measured: 0 };

  const reach = HOLD * options.toleranceMm;
  const reference = new Map<AxisCandidate, number>();
  const found: Measured<AxisCandidate>[] = [];
  for (const axis of AXES) {
    const offered = targets[axis].offered;
    const [low, high] = sides(box, axis);
    [low, (low + high) / 2, high].forEach((value, which) => {
      const at = value + raw[axis];
      for (let i = firstAtLeast(offered, at - reach); i < offered.length; i++) {
        const target = offered[i]!;
        if (target.value > at + reach) break;
        // One candidate per reference, so the reference it was caught by is known.
        const candidate: AxisCandidate = { ...target };
        reference.set(candidate, value);
        found.push({
          candidate,
          distanceMm: Math.abs(target.value - at),
          order: target.order * 3 + which,
        });
      }
    });
  }

  const snapped = decideSnap([], found, held, options);
  const along = (axis: Axis): number => {
    const caught = snapped[axis];
    const from = caught === null ? undefined : reference.get(caught);
    return caught === null || from === undefined ? raw[axis] : caught.value - from;
  };
  return { delta: { x: along('x'), y: along('y') }, snapped, measured: found.length };
}

/**
 * What a caught alignment draws (spec §9): on each caught axis a thin line in
 * the snap colour from the moved extent to the farthest piece lined up at that
 * value, and a small × where each of them meets it. Screen-constant, in CSS
 * pixels; overlay only.
 */
export function alignmentOverlay(
  moved: Rect,
  snapped: Snapped,
  targets: AlignTargets,
  pxPerMm: number,
): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const axis of AXES) {
    const caught = snapped[axis];
    if (caught === null) continue;
    const all = targets[axis].all;
    const spans: (readonly [number, number])[] = [sides(moved, axis === 'x' ? 'y' : 'x')];
    for (let i = firstAtLeast(all, caught.value - EPS_POINT); i < all.length; i++) {
      const target = all[i]!;
      if (!approxEq(target.value, caught.value)) break;
      if (target.span !== null) spans.push(target.span);
    }
    const ends = spans.flat();
    const at = (along: number): Vec2 =>
      axis === 'x' ? { x: caught.value, y: along } : { x: along, y: caught.value };
    items.push(
      pathItem('construction', polyline([at(Math.min(...ends)), at(Math.max(...ends))]), {
        colour: CANVAS.overlay.snap,
        widthPx: 1,
        // Solid (spec §9): the construction role's dotted rhythm reads as a
        // drawn construction line, which this is not.
        dashMm: [],
      }),
    );
    for (const end of ends) {
      items.push(...snapGlyph({ kind: 'intersection', point: at(end) }, pxPerMm, { sizePx: 7 }));
    }
  }
  return items;
}

const NOTHING: Snapped = { point: null, x: null, y: null };

const sides = (box: Rect, axis: Axis): readonly [number, number] =>
  axis === 'x' ? [box.minX, box.maxX] : [box.minY, box.maxY];

/** Whether the outline runs straight along its extent's low and high side on this axis. */
function straightSides(
  path: Path,
  axis: Axis,
  low: number,
  high: number,
): { low: boolean; high: boolean } {
  const across: Axis = axis === 'x' ? 'y' : 'x';
  const found = { low: false, high: false };
  for (const segment of path.segments) {
    if (segment.kind !== 'line') continue;
    const { a, b } = segment;
    if (!approxEq(a[axis], b[axis]) || approxEq(a[across], b[across])) continue;
    if (approxEq(a[axis], low)) found.low = true;
    if (approxEq(a[axis], high)) found.high = true;
  }
  return found;
}

/** The first target at or above `value`, by binary search. */
function firstAtLeast(sorted: readonly AlignTarget[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]!.value < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
