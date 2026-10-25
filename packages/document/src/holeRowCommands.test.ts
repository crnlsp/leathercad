import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addHoleRow,
  addMarkingLine,
  addPart,
  addStitchLine,
  emptyDocument,
  planDelete,
  rectShape,
  shapePart,
} from './commands.js';
import { DocumentStore } from './store.js';

/** A 200 × 40 strap with a line down its middle to punch along (4.14). */
function strap(): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(
    addPart(shapePart('part-1', 'cut-1', 'Strap', rectShape({ x: 0, y: 0 }, 200, 40, 0))),
  );
  store.dispatch(
    addMarkingLine('part-1', 'mark-1', {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 50, y: 20 },
          { x: 150, y: 20 },
        ],
        false,
      ),
    }),
  );
  return store;
}

const features = (store: DocumentStore) =>
  store.getState().document.project.parts.flatMap((part) => part.features);

describe('adding a row of holes (4.14)', () => {
  it('lands on the part, following the marking line, as five holes at 25 mm with a 4 mm punch', () => {
    const store = strap();
    store.dispatch(addHoleRow('part-1', 'row-1', 'mark-1'));

    expect(features(store).find((f) => f.id === 'row-1')).toEqual({
      id: 'row-1',
      kind: 'hole-row',
      name: 'Row of holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'mark-1',
        op: { type: 'hole-row', pitchMm: 25, radiusMm: 2 },
      },
    });
  });

  it('is one step of undo', () => {
    const store = strap();
    store.dispatch(addHoleRow('part-1', 'row-1', 'mark-1'));
    store.undo();

    expect(features(store).map((f) => f.id)).toEqual(['cut-1', 'mark-1']);
    store.redo();
    expect(features(store).map((f) => f.id)).toEqual(['cut-1', 'mark-1', 'row-1']);
  });

  it('is refused on a stitch line, whose holes are a hole set, and changes nothing', () => {
    const store = strap();
    store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 3.5));
    const before = store.getState().document;
    store.dispatch(addHoleRow('part-1', 'row-1', 'stitch-1'));

    expect(store.getState().document).toBe(before);
  });

  it('goes with its line when the line is deleted, never kept frozen', () => {
    const store = strap();
    store.dispatch(addHoleRow('part-1', 'row-1', 'mark-1'));
    const plan = planDelete(store.getState().document.project, ['mark-1']);

    expect(plan.dependents).toMatchObject([{ featureId: 'row-1', direct: true, freezable: false }]);
  });
});
