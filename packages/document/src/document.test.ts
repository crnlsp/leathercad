import { evaluate, type FeatureId } from '@leathercad/domain';
import { PathOps, RectOps, type Rect } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureVisible,
} from './commands.js';
import {
  drawnBounds,
  partSelectionOf,
  selectedFeatureIds,
  selectionOf,
  type Command,
  type Document,
} from './document.js';

/**
 * What Fit drawing and Fit selection frame (U.4): the drawn extent of the
 * features, in millimetres. A 100 × 60 panel at the origin with a slot in it,
 * and a 50 × 40 one at x = 200.
 */
function board(...then: Command[]): Document {
  return [
    addPart(rectanglePart('a', 'a-out', 'Outer', rectShape({ x: 0, y: 0 }, 100, 60))),
    addCutOut('a', 'a-slot', { kind: 'shape', shape: rectShape({ x: 10, y: 20 }, 20, 6) }),
    addPart(rectanglePart('b', 'b-out', 'Pocket', rectShape({ x: 200, y: 0 }, 50, 40))),
    ...then,
  ].reduce((document, command) => command.apply(document), emptyDocument('doc'));
}

const ALL: readonly FeatureId[] = ['a-out', 'a-slot', 'b-out'];

const expectRect = (actual: Rect | null, expected: Rect): void => {
  expect(actual).not.toBeNull();
  for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const) {
    expect(actual![key]).toBeCloseTo(expected[key], 9);
  }
};

describe('the drawn bounds (U.4)', () => {
  it('frames every piece drawn, for Fit drawing', () => {
    expectRect(drawnBounds(evaluate(board().project)), {
      minX: 0,
      minY: 0,
      maxX: 250,
      maxY: 60,
    });
  });

  it('frames a part picked by its heading as all of it, for Fit selection', () => {
    const { project } = board();
    const picked = new Set(selectedFeatureIds(project, partSelectionOf(['b'])));
    expectRect(drawnBounds(evaluate(project), picked), { minX: 200, minY: 0, maxX: 250, maxY: 40 });
  });

  it('frames only the features picked', () => {
    const { project } = board();
    const picked = new Set(selectedFeatureIds(project, selectionOf(['a-slot'])));
    expectRect(drawnBounds(evaluate(project), picked), { minX: 10, minY: 20, maxX: 30, maxY: 26 });
  });

  it('leaves out what is hidden, which the board does not draw', () => {
    const { project } = board(setFeatureVisible(['b-out'], false));
    const resolved = evaluate(project);
    expectRect(drawnBounds(resolved), { minX: 0, minY: 0, maxX: 100, maxY: 60 });
    expect(drawnBounds(resolved, new Set(['b-out']))).toBeNull();
  });

  it('is nothing when nothing is picked, or nothing is drawn', () => {
    expect(drawnBounds(evaluate(board().project), new Set())).toBeNull();
    expect(drawnBounds(evaluate(emptyDocument('doc').project))).toBeNull();
  });

  it('is the union of the picked features’ own bounds, whatever is picked', () => {
    const resolved = evaluate(board().project);
    const own = new Map(
      resolved.parts
        .flatMap((part) => part.features)
        .map((entry) => [entry.feature.id, entry.ok ? PathOps.bbox(entry.path) : null] as const),
    );
    fc.assert(
      fc.property(fc.subarray([...ALL]), (picked) => {
        // A minimum and a maximum of the same numbers: exact, in any order.
        expect(drawnBounds(resolved, new Set(picked))).toEqual(
          RectOps.unionAll(picked.flatMap((id) => own.get(id) ?? [])),
        );
      }),
    );
  });
});
