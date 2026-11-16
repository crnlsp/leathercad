import { approxCmp, approxZero, quantise } from '@leathercad/core';
import { evaluate, type FeatureId, type Project, type Problem } from '@leathercad/domain';
import { MatOps, PathOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';

import { pieceScope, transformRefusal, translateFeatures } from './commands.js';
import { command, type Command } from './document.js';

export type ArrangeAxis = 'x' | 'y';
export type ArrangeMode = 'min' | 'centre' | 'max' | 'distribute';
export type ArrangementRefusal =
  | { readonly kind: 'count'; readonly minimum: number }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'linked' }
  | { readonly kind: 'order' }
  | { readonly kind: 'transform'; readonly problem: Problem };

interface Item {
  readonly ids: readonly string[];
  readonly box: Rect;
}

function itemsFor(project: Project, ids: readonly string[]): Item[] | null {
  const resolved = evaluate(project);
  const items: Item[] = [];
  for (const id of pieceScope(project, [...new Set(ids)]).about) {
    const entry = resolved.parts
      .flatMap((part) => part.features)
      .find((feature) => feature.feature.id === id);
    const box = entry?.ok === true ? PathOps.bbox(entry.path) : null;
    if (box === null || box === undefined) return null;
    items.push({ ids: pieceScope(project, [id]).features, box });
  }
  return items;
}

function coordinate(
  box: Rect,
  axis: ArrangeAxis,
  mode: Exclude<ArrangeMode, 'distribute'>,
): number {
  const low = axis === 'x' ? box.minX : box.minY;
  const high = axis === 'x' ? box.maxX : box.maxY;
  return mode === 'min' ? low : mode === 'max' ? high : (low + high) / 2;
}

function movesFor(items: readonly Item[], axis: ArrangeAxis, mode: ArrangeMode) {
  const bounds = RectOps.unionAll(items.map((item) => item.box));
  if (bounds === null) return [];
  if (mode !== 'distribute') {
    const target = coordinate(bounds, axis, mode);
    return items.map((item) => ({ ...item, delta: target - coordinate(item.box, axis, mode) }));
  }
  const sorted = [...items].sort((a, b) =>
    approxCmp(coordinate(a.box, axis, 'min'), coordinate(b.box, axis, 'min')),
  );
  const first = sorted.at(0);
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return [];
  const low = coordinate(first.box, axis, 'min');
  const high = coordinate(last.box, axis, 'max');
  const size = (box: Rect) => coordinate(box, axis, 'max') - coordinate(box, axis, 'min');
  const gap =
    (high - low - sorted.reduce((sum, item) => sum + size(item.box), 0)) / (sorted.length - 1);
  let next = low;
  return sorted.map((item, index) => {
    const delta =
      index === 0 || index === sorted.length - 1 ? 0 : next - coordinate(item.box, axis, 'min');
    next += size(item.box) + gap;
    return { ...item, delta };
  });
}

/** An outline is one whole piece; children do not become extra items (Q30). */
export function arrangementRefusal(
  project: Project,
  ids: readonly string[],
  axis: ArrangeAxis,
  mode: ArrangeMode,
): ArrangementRefusal | null {
  const items = itemsFor(project, ids);
  if (items === null) return { kind: 'unresolved' };
  const minimum = mode === 'distribute' ? 3 : 2;
  if (items.length < minimum) return { kind: 'count', minimum };
  const moves = movesFor(items, axis, mode);
  if (mode === 'distribute') {
    let previous = Number.NEGATIVE_INFINITY;
    for (const item of moves) {
      const position = coordinate(item.box, axis, 'min') + item.delta;
      if (approxCmp(position, previous) < 0) return { kind: 'order' };
      previous = position;
    }
  }
  const all = new Set(items.flatMap((item) => item.ids));
  for (const item of moves) {
    const own = new Set(item.ids);
    // Independently arranging linked items would move one twice, through its
    // source and its own placement. Refuse rather than change the relationship.
    for (const feature of project.parts.flatMap((part) => part.features)) {
      if (!own.has(feature.id)) continue;
      const source = feature.source;
      const references =
        source.kind === 'derived'
          ? [source.sourceId]
          : source.kind === 'measurement'
            ? [source.a.featureId, source.b.featureId]
            : [];
      if (references.some((id) => all.has(id) && !own.has(id))) return { kind: 'linked' };
    }
    const issue = transformRefusal(
      project,
      item.ids,
      MatOps.fromTranslation(axis === 'x' ? { x: item.delta, y: 0 } : { x: 0, y: item.delta }),
    );
    if (issue !== null) return { kind: 'transform', problem: issue };
  }
  return null;
}

/** Atomic, undoable translations. The two outer items stay fixed during distribution. */
export function arrangeFeatures(
  ids: readonly string[],
  axis: ArrangeAxis,
  mode: ArrangeMode,
): Command {
  return command({ action: mode === 'distribute' ? 'distribute' : 'align' }, (document) => {
    if (arrangementRefusal(document.project, ids, axis, mode) !== null) return document;
    const items = itemsFor(document.project, ids);
    if (items === null) return document;
    let next = document;
    for (const { ids: targets, delta } of movesFor(items, axis, mode)) {
      // Quantised first, then asked: a delta of one quantum is a move to make.
      const offset = quantise(delta);
      if (approxZero(offset)) continue;
      next = translateFeatures(
        targets,
        axis === 'x' ? { x: offset, y: 0 } : { x: 0, y: offset },
      ).apply(next);
    }
    return next;
  });
}

/**
 * Where the selection is (3.15): the box whose left and bottom Properties
 * shows, in world millimetres, Y up, as the rulers read them. A piece is boxed by its
 * outline, as align boxes it (Q30); `null` when nothing named draws.
 */
export function selectionBox(project: Project, ids: readonly FeatureId[]): Rect | null {
  const items = itemsFor(project, ids);
  return items === null ? null : RectOps.unionAll(items.map((item) => item.box));
}

/**
 * Why the selection cannot be moved, or `null` — asked before Properties
 * offers its position and Move by. Every translation is refused alike — a lock, a
 * counterpart its fold places, a derived line picked without what it follows —
 * whatever the distance, so one step stands for all of them.
 */
export function moveRefusal(project: Project, ids: readonly FeatureId[]): Problem | null {
  return transformRefusal(
    project,
    pieceScope(project, ids).features,
    MatOps.fromTranslation({ x: 1, y: 0 }),
  );
}

/** The selection, each piece in it made whole, moved by a typed distance (3.15). */
export function moveFeaturesBy(ids: readonly FeatureId[], deltaMm: Vec2): Command {
  return command({ action: 'move' }, (document) =>
    approxZero(deltaMm.x) && approxZero(deltaMm.y)
      ? document
      : translateFeatures(pieceScope(document.project, ids).features, deltaMm).apply(document),
  );
}

/**
 * The selection moved so its box's left (`x`) or bottom (`y`) edge is at `mm`
 * (3.15). The move is quantised, so what is stored stays on the grid; the edge
 * then lands within half a quantum of the number typed.
 */
export function placeFeatures(ids: readonly FeatureId[], axis: ArrangeAxis, mm: number): Command {
  return command({ action: 'move' }, (document) => {
    const box = selectionBox(document.project, ids);
    if (box === null) return document;
    const delta = quantise(mm - (axis === 'x' ? box.minX : box.minY));
    if (approxZero(delta)) return document;
    return moveFeaturesBy(ids, axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta }).apply(
      document,
    );
  });
}
