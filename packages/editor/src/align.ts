import { EPS_ANGLE, EPS_POINT, approxEq, type Mm } from '@leathercad/core';
import type { Feature, ResolvedProject } from '@leathercad/domain';
import { CANVAS, boardTextItem, pathItem, type DisplayItem } from '@leathercad/render';
import {
  PathOps,
  SegmentOps,
  Vec2Ops,
  polyline,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

import {
  HOLD,
  decideSnap,
  snapGlyph,
  type AxisCandidate,
  type Measured,
  type Snapped,
} from './snap.js';
import { isSpacing, spacingFor, type Face, type Gap } from './spacing.js';

/**
 * Smart guides for a moved piece (3.16, smart-guides spec §6): the moving
 * extent's left, centre and right — bottom, centre and top — line up with
 * other pieces' extents and with axis-aligned guides, each axis on its own,
 * by the one priority table in `snap.ts`. Features moved inside a piece line
 * up with that piece instead (3.18).
 */

type Axis = 'x' | 'y';

/**
 * What a host piece's centre line is called (spec §6), a fact the app words:
 * its `centre` when the outline is mirrored about it — a strap end, a flap —
 * and otherwise only the `extent-centre`, the middle of its box, which is not
 * an axis the leather has.
 */
export type AlignLabel = 'centre' | 'extent-centre';

/** A value a moving reference can line up with, and its place in document order. */
export interface AlignTarget extends AxisCandidate {
  readonly order: number;
  /**
   * Where the target runs along its line — its piece's extent on the other
   * axis — for drawing; null for a guide, which runs for ever.
   */
  readonly span: readonly [number, number] | null;
  /** A host piece's centre's name; absent on every other target. */
  readonly label?: AlignLabel;
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
  /** What a gap is measured to, for equal spacing (3.19), in document order. */
  readonly faces: readonly Face[];
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
  const faces: Face[] = [];
  const add = numbered(list);
  for (const part of resolved.parts) {
    const outline = outlineOf(part);
    if (outline === null || moving.has(outline.feature.id)) continue;
    addExtent(add, outline.feature.id, outline.path, 'piece-centre', 'piece-edge', false);
    addFace(faces, outline.feature.id, outline.path);
  }
  addGuides(add, resolved);
  return indexTargets(list, faces);
}

/**
 * What a feature moved inside its piece lines up with (3.18, spec §6), once
 * when the gesture begins: that piece's centre lines and the extent edges its
 * outline runs straight along, the centres of its other holes, cut-outs and
 * labels, and every axis-aligned guide. Other pieces are not targets: a rivet
 * is placed on its own flap. `moving` holds what moves and what moves with it
 * — a counterpart mirrored across a fold — whose places now are not places
 * to line up with.
 */
export function collectHostTargets(
  resolved: ResolvedProject,
  partId: string,
  moving: ReadonlySet<string>,
): AlignTargets {
  const list: AlignTarget[] = [];
  const faces: Face[] = [];
  const add = numbered(list);
  const part = resolved.parts.find((candidate) => candidate.part.id === partId);
  const outline = part === undefined ? null : outlineOf(part);
  if (part !== undefined && outline !== null) {
    addExtent(add, outline.feature.id, outline.path, 'host-centre', 'host-edge', true);
    for (const entry of part.features) {
      if (!entry.ok || !entry.feature.visible || moving.has(entry.feature.id)) continue;
      if (!PLACED(entry.feature)) continue;
      const box = PathOps.bbox(entry.path);
      if (box === null) continue;
      // A cut-out is a face a gap is measured to; a hole's rim and a label's glyphs are not.
      if (entry.feature.kind === 'cut-contour') addFace(faces, entry.feature.id, entry.path);
      for (const axis of AXES) {
        const [low, high] = sides(box, axis);
        add({
          kind: 'feature-centre',
          axis,
          value: (low + high) / 2,
          featureId: entry.feature.id,
          span: sides(box, other(axis)),
        });
      }
    }
  }
  addGuides(add, resolved);
  return indexTargets(list, faces);
}

/** What is placed inside a piece and has a centre worth placing by: holes, cut-outs and labels. */
const PLACED = (feature: Feature): boolean =>
  feature.kind === 'hardware-hole' ||
  feature.kind === 'hole-row' ||
  feature.kind === 'text-label' ||
  (feature.kind === 'cut-contour' && feature.role === 'inner');

type Adder = (target: Omit<AlignTarget, 'order'>) => void;

const numbered =
  (list: AlignTarget[]): Adder =>
  (target) => {
    list.push({ ...target, order: list.length });
  };

/** A part's drawn outline, if it is visible and built. */
function outlineOf(
  part: ResolvedProject['parts'][number],
): { readonly feature: Feature; readonly path: Path } | null {
  const outline = part.features.find(
    (entry) => entry.ok && entry.feature.kind === 'cut-contour' && entry.feature.role === 'outer',
  );
  return outline?.ok === true && outline.feature.visible ? outline : null;
}

/**
 * A piece's extent as targets: its centre on each axis, and an edge only where
 * its outline runs straight along it (spec §6) — the extent of a disc or a
 * turned panel is not a side the leather has, so those offer their centre
 * alone. A host's centre is named for whether it is an axis of the outline.
 */
function addExtent(
  add: Adder,
  featureId: string,
  path: Path,
  centre: 'host-centre' | 'piece-centre',
  edge: 'host-edge' | 'piece-edge',
  named: boolean,
): void {
  const box = PathOps.bbox(path);
  if (box === null) return;
  for (const axis of AXES) {
    const [low, high] = sides(box, axis);
    const span = sides(box, other(axis));
    const straight = straightSides(path, axis, low, high);
    const middle = (low + high) / 2;
    if (straight.low) add({ kind: edge, axis, value: low, featureId, span });
    add({
      kind: centre,
      axis,
      value: middle,
      featureId,
      span,
      ...(named ? { label: mirroredAbout(path, axis, middle) ? 'centre' : 'extent-centre' } : {}),
    });
    if (straight.high) add({ kind: edge, axis, value: high, featureId, span });
  }
}

/** A piece or a cut-out as something equal spacing measures a gap to (3.19). */
function addFace(faces: Face[], featureId: string, path: Path): void {
  const box = PathOps.bbox(path);
  if (box === null) return;
  faces.push({
    featureId,
    order: faces.length,
    box,
    straight: {
      x: straightSides(path, 'x', box.minX, box.maxX),
      y: straightSides(path, 'y', box.minY, box.maxY),
    },
  });
}

/** Every level or upright guide, on the axis it fixes. */
function addGuides(add: Adder, resolved: ResolvedProject): void {
  for (const guide of resolved.project.guides ?? []) {
    const turn = ((guide.angleRad % Math.PI) + Math.PI) % Math.PI;
    const level = approxEq(turn, 0, EPS_ANGLE) || approxEq(turn, Math.PI, EPS_ANGLE);
    const upright = approxEq(turn, Math.PI / 2, EPS_ANGLE);
    if (!level && !upright) continue;
    const axis: Axis = level ? 'y' : 'x';
    add({ kind: 'guide-axis', axis, value: guide.origin[axis], guideId: guide.id, span: null });
  }
}

/** Targets sorted per axis, as a move searches them, and the faces equal spacing measures to. */
export function indexTargets(
  list: readonly AlignTarget[],
  faces: readonly Face[] = [],
): AlignTargets {
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
  return { x: index('x'), y: index('y'), faces };
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
  options: {
    readonly toleranceMm: number;
    readonly smartGuides: boolean;
    /** A single hole or circle: its centre alone lines up, never its rim (spec §6). */
    readonly centreOnly?: boolean;
  },
): Alignment {
  if (!options.smartGuides) return { delta: raw, snapped: NOTHING, measured: 0 };

  const reach = HOLD * options.toleranceMm;
  const reference = new Map<AxisCandidate, number>();
  const found: Measured<AxisCandidate>[] = [];
  for (const axis of AXES) {
    const offered = targets[axis].offered;
    const [low, high] = sides(box, axis);
    const middle = (low + high) / 2;
    // Each reference keeps its place among the three, so ties order alike.
    const refs: (readonly [number, number])[] =
      options.centreOnly === true
        ? [[middle, 1]]
        : [
            [low, 0],
            [middle, 1],
            [high, 2],
          ];
    for (const [value, which] of refs) {
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
    }
    // A single hole lines up by its centre alone: its rim is no face (spec §6).
    if (options.centreOnly === true) continue;
    for (const spaced of spacingFor(targets.faces, box, raw, axis, reach)) {
      reference.set(spaced.candidate, spaced.reference);
      found.push(spaced);
    }
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
 * pixels; overlay only. A host piece's centre line is named at its far end,
 * in the app's words (3.18); without `words`, it is drawn unnamed. Equal
 * spacing draws its two gaps instead, each labelled with the one gap both are
 * (3.19) — through `gapWords`, without which they are drawn unlabelled.
 */
export function alignmentOverlay(
  moved: Rect,
  snapped: Snapped,
  targets: AlignTargets,
  pxPerMm: number,
  words?: (label: AlignLabel) => string,
  gapWords?: (mm: Mm) => string,
): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const axis of AXES) {
    const caught = snapped[axis];
    if (caught === null) continue;
    if (isSpacing(caught)) {
      for (const gap of caught.gaps) {
        items.push(...gapItems(gap, axis, caught.gapMm, pxPerMm, gapWords));
      }
      continue;
    }
    const all = targets[axis].all;
    const spans: (readonly [number, number])[] = [sides(moved, other(axis))];
    let label: AlignLabel | undefined;
    for (let i = firstAtLeast(all, caught.value - EPS_POINT); i < all.length; i++) {
      const target = all[i]!;
      if (!approxEq(target.value, caught.value)) break;
      if (target.span !== null) spans.push(target.span);
      if (target.kind === caught.kind) label ??= target.label;
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
    if (label !== undefined && words !== undefined) {
      // Past the line's far end — above an upright line, right of a level one —
      // clear of the × drawn there.
      const gap = LABEL_GAP_PX / pxPerMm;
      const far = Math.max(...ends) + gap;
      items.push(
        axis === 'x'
          ? boardTextItem(at(far), words(label), CANVAS.text.value, CANVAS.overlay.snap, {
              align: 'center',
            })
          : boardTextItem(
              { x: far, y: caught.value - CANVAS.text.value.sizePx / 3 / pxPerMm },
              words(label),
              CANVAS.text.value,
              CANVAS.overlay.snap,
            ),
      );
    }
  }
  return items;
}

/**
 * One equal gap: a line in the snap colour between the two faces, a × at each,
 * and its width — above a level line, left of an upright one.
 */
function gapItems(
  gap: Gap,
  axis: Axis,
  gapMm: Mm,
  pxPerMm: number,
  words?: (mm: Mm) => string,
): DisplayItem[] {
  const at = (along: number): Vec2 =>
    axis === 'x' ? { x: along, y: gap.across } : { x: gap.across, y: along };
  const items: DisplayItem[] = [
    pathItem('construction', polyline([at(gap.from), at(gap.to)]), {
      colour: CANVAS.overlay.snap,
      widthPx: 1,
      dashMm: [],
    }),
    ...snapGlyph({ kind: 'intersection', point: at(gap.from) }, pxPerMm, { sizePx: 7 }),
    ...snapGlyph({ kind: 'intersection', point: at(gap.to) }, pxPerMm, { sizePx: 7 }),
  ];
  if (words !== undefined) {
    const middle = at((gap.from + gap.to) / 2);
    const off = LABEL_GAP_PX / pxPerMm;
    items.push(
      axis === 'x'
        ? boardTextItem(
            { x: middle.x, y: middle.y + off },
            words(gapMm),
            CANVAS.text.value,
            CANVAS.overlay.snap,
            {
              align: 'center',
            },
          )
        : boardTextItem(
            { x: middle.x - off, y: middle.y },
            words(gapMm),
            CANVAS.text.value,
            CANVAS.overlay.snap,
            {
              align: 'right',
            },
          ),
    );
  }
  return items;
}

/** How far past a guide's end its name sits, in CSS pixels: clear of the × there. */
const LABEL_GAP_PX = 8;

const NOTHING: Snapped = { point: null, x: null, y: null };

const sides = (box: Rect, axis: Axis): readonly [number, number] =>
  axis === 'x' ? [box.minX, box.maxX] : [box.minY, box.maxY];

const other = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');

/** Where along a segment its shape is sampled: enough to fix a line, an arc or a cubic. */
const SAMPLES = [0, 0.25, 0.5, 0.75, 1];

/**
 * Whether the outline is its own mirror image about `axis = value`: every
 * segment, reflected, is a segment of the outline, run either way. A
 * reflection keeps a segment's parameter — a line's and a cubic's are affine,
 * an arc's its angle — so five points along it fix the curve.
 *
 * Conservative: an outline split into segments at places not mirrored to each
 * other reads as not mirrored, and is called by its extent, which is still
 * true. The segments are sorted by their midpoints' place along the axis, so
 * each reflected one finds its match by a binary search: a 1000-segment
 * outline mirrored both ways is otherwise a million comparisons when a drag
 * begins.
 */
function mirroredAbout(path: Path, axis: Axis, value: number): boolean {
  const flip = (p: Vec2): Vec2 =>
    axis === 'x' ? { x: 2 * value - p.x, y: p.y } : { x: p.x, y: 2 * value - p.y };
  const traced = path.segments
    .map((segment) => SAMPLES.map((t) => SegmentOps.pointAt(segment, t)))
    .sort((a, b) => a[MIDDLE]![axis] - b[MIDDLE]![axis]);
  const same = (a: readonly Vec2[], b: readonly Vec2[]): boolean =>
    a.every((p, i) => Vec2Ops.equals(p, b[i]!));
  return traced.every((points) => {
    const mirrored = points.map(flip);
    const backwards = [...mirrored].reverse();
    const at = mirrored[MIDDLE]![axis];
    let lo = 0;
    let hi = traced.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (traced[mid]![MIDDLE]![axis] < at - EPS_POINT) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < traced.length && traced[i]![MIDDLE]![axis] <= at + EPS_POINT; i++) {
      const candidate = traced[i]!;
      if (same(mirrored, candidate) || same(backwards, candidate)) return true;
    }
    return false;
  });
}

/** The sample at t = ½, which a segment and its reverse share. */
const MIDDLE = SAMPLES.indexOf(0.5);

/** Whether the outline runs straight along its extent's low and high side on this axis. */
function straightSides(
  path: Path,
  axis: Axis,
  low: number,
  high: number,
): { low: boolean; high: boolean } {
  const across = other(axis);
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
