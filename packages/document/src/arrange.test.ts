import { QUANTUM_MM, quantise } from '@leathercad/core';
import { evaluate } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  arrangeFeatures,
  arrangementRefusal,
  moveFeaturesBy,
  moveRefusal,
  placeFeatures,
  selectionBox,
} from './arrange.js';
import {
  addPart,
  addHardwareHole,
  emptyDocument,
  rectanglePart,
  rectShape,
  setFeatureLocked,
  addStitchLine,
  setFeatureVisible,
} from './commands.js';
import { DocumentStore } from './store.js';
import type { Document } from './document.js';

function drawing(): Document {
  let document = emptyDocument('project');
  for (const [id, x, y, width] of [
    ['a', 0, 0, 10],
    ['b', 40, 20, 20],
    ['c', 100, 50, 30],
  ] as const) {
    document = addPart(rectanglePart(`part-${id}`, id, id, rectShape({ x, y }, width, 10))).apply(
      document,
    );
  }
  return document;
}

function bounds(document: Document) {
  return evaluate(document.project).parts.flatMap((part) =>
    part.features.flatMap((entry) => (entry.ok ? (PathOps.bbox(entry.path) ?? []) : [])),
  );
}

describe('align and distribute', () => {
  it('aligns to selection bounds, with Y up, in one undoable step', () => {
    const original = drawing();
    const store = new DocumentStore(original);
    store.dispatch(arrangeFeatures(['a', 'b', 'c'], 'y', 'max'));
    expect(bounds(store.getState().document).map((box) => box.maxY)).toEqual([60, 60, 60]);
    store.undo();
    expect(store.getState().document).toBe(original);
    store.redo();
    expect(bounds(store.getState().document).map((box) => box.maxY)).toEqual([60, 60, 60]);
  });

  it('distributes equal edge gaps, preserving the outer two items', () => {
    const result = bounds(arrangeFeatures(['c', 'a', 'b'], 'x', 'distribute').apply(drawing()));
    expect(result.map((box) => box.minX)).toEqual([0, 45, 100]);
    expect((result[1]?.minX ?? 0) - (result[0]?.maxX ?? 0)).toBe(35);
    expect((result[2]?.minX ?? 0) - (result[1]?.maxX ?? 0)).toBe(35);
  });

  it('aligns centres for any separation within storage precision and is idempotent', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (y) => {
        let document = addPart(
          rectanglePart('other', 'd', 'd', rectShape({ x: 200, y }, 10, 10)),
        ).apply(drawing());
        const action = arrangeFeatures(['a', 'b', 'c', 'd'], 'y', 'centre');
        document = action.apply(document);
        const centres = bounds(document).map((box) => (box.minY + box.maxY) / 2);
        for (const centre of centres)
          expect(Math.abs(centre - (centres[0] ?? centre))).toBeLessThanOrEqual(QUANTUM_MM);
        expect(action.apply(document)).toBe(document);
      }),
    );
  });

  it('carries a whole piece, including hidden hardware, and ignores duplicate selection entries', () => {
    let original = drawing();
    original = addHardwareHole('part-a', 'rivet', { x: 3, y: 3 }, 1).apply(original);
    original = setFeatureVisible(['rivet'], false).apply(original);
    const moved = arrangeFeatures(['a', 'rivet', 'a', 'b'], 'y', 'max').apply(original);
    const source = moved.project.parts[0]?.features.find(
      (feature) => feature.id === 'rivet',
    )?.source;
    expect(
      source?.kind === 'shape' && source.shape.type === 'circle' ? source.shape.centre.y : null,
    ).toBe(23);
  });

  it('refuses the whole action for locked pieces and derived features picked alone', () => {
    const locked = setFeatureLocked(['b'], true).apply(drawing());
    expect(arrangementRefusal(locked.project, ['a', 'b'], 'x', 'min')).not.toBeNull();
    expect(arrangeFeatures(['a', 'b'], 'x', 'min').apply(locked)).toBe(locked);
    const linked = addStitchLine('part-a', 'stitch', 'a', 1).apply(drawing());
    expect(arrangeFeatures(['stitch', 'b'], 'x', 'min').apply(linked)).toBe(linked);
  });

  it('closes a gap of one quantum, rather than calling it aligned', () => {
    const original = addPart(
      rectanglePart('part-d', 'd', 'd', rectShape({ x: 200, y: QUANTUM_MM }, 10, 10)),
    ).apply(drawing());
    const aligned = bounds(arrangeFeatures(['a', 'd'], 'y', 'min').apply(original));
    expect(aligned.map((box) => box.minY)).toEqual([0, 20, 50, 0]);
  });

  it('does nothing when there are too few independent items', () => {
    const original = drawing();
    expect(arrangeFeatures(['a'], 'x', 'min').apply(original)).toBe(original);
    expect(arrangeFeatures(['a', 'b'], 'x', 'distribute').apply(original)).toBe(original);
  });

  it('refuses gaps that would reverse the order of nested items', () => {
    let original = emptyDocument('nested');
    for (const [id, x, width] of [
      ['wide', 0, 1000],
      ['middle', 10, 1],
      ['end', 20, 1],
    ] as const) {
      original = addPart(rectanglePart(`p-${id}`, id, id, rectShape({ x, y: 0 }, width, 10))).apply(
        original,
      );
    }
    expect(arrangeFeatures(['wide', 'middle', 'end'], 'x', 'distribute').apply(original)).toBe(
      original,
    );
  });
});

describe('typed position and Move by (3.15)', () => {
  /** A storage-grid length a maker could type: four decimals, either sign. */
  const typed = fc.integer({ min: -10_000_000, max: 10_000_000 }).map((n) => n * QUANTUM_MM);

  it("reads the selection's box: its left and bottom, Y up, the pieces boxed by their outlines", () => {
    const document = addHardwareHole('part-a', 'rivet', { x: -5, y: 3 }, 1).apply(drawing());
    expect(selectionBox(document.project, ['a', 'b'])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 60,
      maxY: 30,
    });
    // A rivet sitting past its outline is carried, but the piece is its outline.
    expect(selectionBox(document.project, ['rivet', 'a'])?.minX).toBe(0);
    expect(selectionBox(document.project, ['rivet'])?.minX).toBe(-6);
    expect(selectionBox(document.project, [])).toBeNull();
    expect(selectionBox(document.project, ['nothing'])).toBeNull();
  });

  it("typing X puts the selection's left edge there, in one undoable step", () => {
    const original = drawing();
    const store = new DocumentStore(original);
    store.dispatch(placeFeatures(['a', 'b'], 'x', 20));
    const moved = store.getState().document;
    expect(selectionBox(moved.project, ['a', 'b'])).toEqual({
      minX: 20,
      minY: 0,
      maxX: 80,
      maxY: 30,
    });
    expect(store.getState().canUndo).toBe(true);
    store.undo();
    expect(store.getState().document).toBe(original);
    expect(store.getState().canUndo).toBe(false);
  });

  it('typing Y moves the bottom edge, Y up', () => {
    const moved = placeFeatures(['b'], 'y', -5).apply(drawing());
    expect(selectionBox(moved.project, ['b'])).toEqual({ minX: 40, minY: -5, maxX: 60, maxY: 5 });
  });

  it('carries the whole piece, its hidden hardware included', () => {
    let original = addHardwareHole('part-a', 'rivet', { x: 3, y: 3 }, 1).apply(drawing());
    original = setFeatureVisible(['rivet'], false).apply(original);
    const placed = placeFeatures(['a'], 'x', 100).apply(original);
    const byTyped = moveFeaturesBy(['a'], { x: 100, y: 0 }).apply(original);
    for (const document of [placed, byTyped]) {
      const rivet = document.project.parts[0]?.features.find((f) => f.id === 'rivet')?.source;
      expect(
        rivet?.kind === 'shape' && rivet.shape.type === 'circle' ? rivet.shape.centre.x : null,
      ).toBe(103);
    }
  });

  it('Move by −12 moves the selection 12 mm left, in one undoable step', () => {
    const original = drawing();
    const store = new DocumentStore(original);
    store.dispatch(moveFeaturesBy(['a', 'c'], { x: -12, y: 0 }));
    const boxes = bounds(store.getState().document);
    expect(boxes.map((box) => box.minX)).toEqual([-12, 40, 88]);
    expect(boxes.map((box) => box.minY)).toEqual([0, 20, 50]);
    store.undo();
    expect(store.getState().document).toBe(original);
  });

  it('a move to where it already is, or by nothing, earns no history', () => {
    const original = drawing();
    expect(placeFeatures(['b'], 'x', 40).apply(original)).toBe(original);
    expect(moveFeaturesBy(['b'], { x: 0, y: 0 }).apply(original)).toBe(original);
    expect(placeFeatures(['nothing'], 'x', 40).apply(original)).toBe(original);
  });

  it('a locked piece, or a derived line picked alone, refuses both, and says why', () => {
    const locked = setFeatureLocked(['b'], true).apply(drawing());
    expect(moveRefusal(locked.project, ['a', 'b'])?.code).toBe('FEATURE_LOCKED');
    expect(placeFeatures(['a', 'b'], 'x', 0).apply(locked)).toBe(locked);
    expect(moveFeaturesBy(['a', 'b'], { x: 1, y: 0 }).apply(locked)).toBe(locked);

    const linked = addStitchLine('part-a', 'stitch', 'a', 1).apply(drawing());
    expect(moveRefusal(linked.project, ['stitch'])?.code).toBe('DERIVED_MOVED_ALONE');
    expect(placeFeatures(['stitch'], 'x', 50).apply(linked)).toBe(linked);
    // With its piece it goes along.
    expect(moveRefusal(linked.project, ['a'])).toBeNull();
    expect(moveRefusal(drawing().project, ['a', 'b'])).toBeNull();
  });

  it('places the left or bottom edge within half a quantum of any typed value, the box kept, the move on the grid', () => {
    fc.assert(
      fc.property(
        typed,
        typed,
        fc.constantFrom('x' as const, 'y' as const),
        typed,
        (x, y, axis, target) => {
          const original = addPart(
            rectanglePart('p', 'r', 'r', rectShape({ x, y }, 17.3, 9.1)),
          ).apply(emptyDocument('p'));
          const before = selectionBox(original.project, ['r']);
          const placed = placeFeatures(['r'], axis, target).apply(original);
          const after = selectionBox(placed.project, ['r']);
          if (before === null || after === null) throw new Error('unresolved');
          const [low, other] =
            axis === 'x'
              ? [after.minX, after.minY - before.minY]
              : [after.minY, after.minX - before.minX];
          expect(Math.abs(low - target)).toBeLessThanOrEqual(QUANTUM_MM / 2 + 1e-9);
          expect(other).toBeCloseTo(0, 9);
          const shape = placed.project.parts[0]?.features[0]?.source;
          if (shape?.kind !== 'shape' || shape.shape.type !== 'rect') throw new Error('not a rect');
          // On the storage grid, give or take the float noise of one sum.
          for (const value of [shape.shape.origin.x, shape.shape.origin.y])
            expect(Math.abs(quantise(value) - value)).toBeLessThan(1e-9);
          // Placed again, it is already there.
          expect(placeFeatures(['r'], axis, target).apply(placed)).toBe(placed);
        },
      ),
    );
  });

  it('Move by shifts the box by exactly the typed distance, and back again', () => {
    fc.assert(
      fc.property(typed, typed, (dx, dy) => {
        const original = drawing();
        const before = selectionBox(original.project, ['a', 'b']);
        const moved = moveFeaturesBy(['a', 'b'], { x: dx, y: dy }).apply(original);
        const after = selectionBox(moved.project, ['a', 'b']);
        if (before === null || after === null) throw new Error('unresolved');
        expect(after.minX - before.minX).toBeCloseTo(dx, 6);
        expect(after.minY - before.minY).toBeCloseTo(dy, 6);
        expect(after.maxX - after.minX).toBeCloseTo(before.maxX - before.minX, 6);
        const back = moveFeaturesBy(['a', 'b'], { x: -dx, y: -dy }).apply(moved);
        const home = selectionBox(back.project, ['a', 'b']);
        expect(home?.minX).toBeCloseTo(before.minX, 6);
        expect(home?.minY).toBeCloseTo(before.minY, 6);
      }),
    );
  });
});
