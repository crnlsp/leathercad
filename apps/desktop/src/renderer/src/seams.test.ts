import {
  addPart,
  addStitchLine,
  addStitchHoles,
  DocumentStore,
  emptyDocument,
  rectShape,
  shapePart,
} from '@leathercad/document';
import { seamVerdict } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { defaultSide, SeamWorkflow, sewableIds, sewingSides, stretchChoices } from './seams.js';

function fixture() {
  const store = new DocumentStore(emptyDocument('project'));
  store.dispatch(addPart(shapePart('part', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 40, 20))));
  store.dispatch(addStitchLine('part', 'line', 'outline', 2));
  store.dispatch(addStitchHoles('part', 'holes', 'line'));
  const a = defaultSide(store.getState().document.project, 'holes');
  return { store, seam: { id: 'seam', a, b: a } };
}

describe('seam workflow', () => {
  it('offers only one or two explicitly selected hole sets, with measured run choices', () => {
    const { store } = fixture();
    const p = store.getState().document.project;
    expect(sewableIds(p, new Set(['holes']))).toEqual(['holes']);
    expect(sewableIds(p, new Set(['outline', 'holes']))).toEqual([]);
    expect(stretchChoices(p, 'holes')).toHaveLength(5);
    expect(stretchChoices(p, 'holes')[0]).toMatchObject({
      stretch: { kind: 'whole' },
      count: expect.any(Number),
    });
  });
  it('starts the second side on another piece when only one hole set is selected (QA5)', () => {
    const { store } = fixture();
    store.dispatch(
      addPart(shapePart('back', 'back-outline', 'Back', rectShape({ x: 60, y: 0 }, 40, 20))),
    );
    store.dispatch(addStitchLine('back', 'back-line', 'back-outline', 2));
    store.dispatch(addStitchHoles('back', 'back-holes', 'back-line'));
    const p = store.getState().document.project;
    expect(sewingSides(p, 'holes')).toEqual({
      a: defaultSide(p, 'holes'),
      b: defaultSide(p, 'back-holes'),
    });
    expect(sewingSides(p, 'back-holes', 'holes').b.holeSetId).toBe('holes');
  });
  it('leaves a lone piece’s second side for the maker to choose: Sew stays off until they do', () => {
    const { store } = fixture();
    const p = store.getState().document.project;
    const sides = sewingSides(p, 'holes');
    expect(sides.b.holeSetId).toBe('holes');
    expect(seamVerdict(p, { id: 'seam', ...sides }).ok).toBe(false);
  });
  it('cancels without history and commits repeated previews as one step', () => {
    const { store, seam } = fixture();
    const before = store.getState().document;
    const workflow = new SeamWorkflow(store);
    workflow.open(seam, false);
    expect(store.getState().inTransaction).toBe(true);
    workflow.cancel();
    expect(store.getState().document).toBe(before);
    workflow.open(seam, false);
    workflow.update({
      ...seam,
      a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
    });
    workflow.update(seam);
    workflow.commit();
    expect(store.getState().document.project.seams).toEqual([seam]);
    store.undo();
    expect(store.getState().document).toBe(before);
    workflow.dispose();
  });
  it('closes after an outside command and never rolls that command back', () => {
    const { store, seam } = fixture();
    const workflow = new SeamWorkflow(store);
    workflow.open(seam, false);
    store.dispatch(addPart({ id: 'other', name: 'Other', quantity: 1, features: [] }));
    expect(workflow.snapshot()).toBeNull();
    workflow.cancel();
    expect(store.getState().document.project.parts).toHaveLength(2);
    expect(store.getState().document.project.seams).toBeUndefined();
    workflow.dispose();
  });
});
