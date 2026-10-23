import { QUANTUM_MM } from '@leathercad/core';
import { evaluate } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arrangeFeatures, arrangementRefusal } from './arrange.js';
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
