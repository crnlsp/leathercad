import { diagnose, problemKey, type Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { acceptWarning, unacceptWarning } from './accepted.js';
import {
  addPart,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  rectShape,
  shapePart,
} from './commands.js';
import { DocumentStore } from './store.js';

/** A panel stitched 1 mm in: its holes too near the edge (a warning). */
function tooClose(): DocumentStore {
  const store = new DocumentStore(emptyDocument('project'));
  store.dispatch(addPart(shapePart('panel', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 105, 70, 4))));
  store.dispatch(addStitchLine('panel', 'stitch', 'outline', 1));
  store.dispatch(addStitchHoles('panel', 'holes', 'stitch', { pitchMm: 3.85 }));
  return store;
}

const project = (store: DocumentStore): Project => store.getState().document.project;
const warningKey = (store: DocumentStore): string => {
  const found = diagnose(project(store)).find((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE');
  if (found === undefined) throw new Error('no warning');
  return problemKey(found.problem);
};
const accepted = (store: DocumentStore) =>
  diagnose(project(store)).filter((d) => d.accepted === true).map((d) => d.problem.code);

describe('accepting a warning (9.16)', () => {
  it('accept and un-accept are one undo step each', () => {
    const store = tooClose();
    const key = warningKey(store);
    store.dispatch(acceptWarning(key));
    expect(accepted(store)).toEqual(['HOLE_TOO_CLOSE_TO_EDGE']);
    expect(store.getState().undoLabel).toEqual({ action: 'accept-warning' });
    store.dispatch(unacceptWarning(key));
    expect(accepted(store)).toEqual([]);
    expect(store.getState().undoLabel).toEqual({ action: 'unaccept-warning' });
    store.undo();
    expect(accepted(store)).toEqual(['HOLE_TOO_CLOSE_TO_EDGE']);
    store.undo();
    expect(accepted(store)).toEqual([]);
    expect(project(store).acceptedWarnings).toBeUndefined();
  });

  it('accepting again after the cause changed replaces the stale entry, never adds a second', () => {
    const store = tooClose();
    const key = warningKey(store);
    store.dispatch(acceptWarning(key));
    store.dispatch(addStitchLine('panel', 'stitch-2', 'outline', 2));
    store.dispatch(acceptWarning(key));
    expect(project(store).acceptedWarnings?.filter((e) => e.problemKey === key)).toHaveLength(1);
  });

  it('changes nothing for an error, an accepted warning, or a key nothing has', () => {
    const store = tooClose();
    store.dispatch(addStitchLine('panel', 'deep', 'outline', 60));
    const error = diagnose(project(store)).find((d) => d.severity === 'error');
    expect(error).toBeDefined();
    const before = store.getState().document;
    expect(acceptWarning(problemKey(error!.problem)).apply(before)).toBe(before);
    expect(acceptWarning('NO_SUCH:thing').apply(before)).toBe(before);
    expect(unacceptWarning(warningKey(store)).apply(before)).toBe(before);
    const once = acceptWarning(warningKey(store)).apply(before);
    expect(acceptWarning(warningKey(store)).apply(once)).toBe(once);
  });
});
