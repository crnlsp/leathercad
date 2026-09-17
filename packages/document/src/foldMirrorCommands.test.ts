import { evaluate, type FeatureId, type PartId, type Project } from '@leathercad/domain';
import { MatOps, PathOps, polyline } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addFoldLine,
  addPart,
  deleteFeatures,
  emptyDocument,
  foldMirrorRefusal,
  mirrorAcrossFold,
  rectShape,
  rectanglePart,
  refusedTransforms,
  translateFeatures,
} from './commands.js';
import type { Document } from './document.js';

const PART = 'part-1' as PartId;
const SHELL = 'shell-cut' as FeatureId;
const FOLD = 'fold-1' as FeatureId;
const SLOT = 'slot-1' as FeatureId;
const COPY = 'copy-1' as FeatureId;

/** The §2 scenario: a bifold shell, a fold down the middle, one card slot. */
function shell(foldX = 95): Document {
  let document = addPart(
    rectanglePart(PART, SHELL, 'Shell', rectShape({ x: 0, y: 0 }, 190, 95)),
  ).apply(emptyDocument('proj'));

  document = addFoldLine(PART, FOLD, {
    kind: 'path',
    path: polyline(
      [
        { x: foldX, y: 0 },
        { x: foldX, y: 95 },
      ],
      false,
    ),
  }).apply(document);

  return addCutOut(PART, SLOT, {
    kind: 'shape',
    shape: rectShape({ x: 12, y: 20 }, 70, 6),
  }).apply(document);
}

const folded = (document: Document): Document =>
  mirrorAcrossFold([SLOT], [COPY], FOLD).apply(document);

const boxOf = (project: Project, id: string) => {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id);
  if (entry?.ok !== true)
    throw new Error(`${id}: ${entry?.ok === false ? entry.problem.code : '?'}`);
  return PathOps.bbox(entry.path)!;
};

const featureIn = (project: Project, id: string) =>
  project.parts.flatMap((p) => p.features).find((f) => f.id === id);

describe('mirror across fold', () => {
  it('puts the counterpart in the same part, because a fold is inside one piece', () => {
    const next = folded(shell());

    expect(next.project.parts).toHaveLength(1);
    expect(featureIn(next.project, COPY)?.kind).toBe('cut-contour');
    // The slot spans 12..82; reflected in x = 95 it spans 108..178.
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(108, 6);
  });

  it('re-mirrors every counterpart when the fold moves — the slice', () => {
    const before = folded(shell());

    const next = translateFeatures([FOLD], { x: 25, y: 0 }).apply(before);

    // The fold is now at 120, so the slot's reflection starts at 158.
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(158, 6);
    // And the original has not moved.
    expect(boxOf(next.project, SLOT).minX).toBeCloseTo(12, 6);
  });

  it('follows the original too, as any counterpart does', () => {
    const before = folded(shell());

    const next = translateFeatures([SLOT], { x: 0, y: 10 }).apply(before);

    expect(boxOf(next.project, COPY).minY).toBeCloseTo(30, 6);
  });

  it('refuses to be dragged, and says what to move instead', () => {
    // The consistency rule: dragging a derived, linked result must not
    // silently break or half-alter the relationship.
    const before = folded(shell());

    expect(translateFeatures([COPY], { x: 10, y: 0 }).apply(before).project).toBe(before.project);
    expect(
      refusedTransforms(before.project, [COPY], MatOps.fromTranslation({ x: 10, y: 0 }))[0]
        ?.problem,
    ).toMatchObject({
      code: 'MIRROR_PLACED_BY_FOLD',
      facts: { foldName: 'Fold (valley)', sourceName: 'Cut-out' },
    });
  });

  it('opens the pair symmetrically when the source is dragged with it', () => {
    // Not a refusal: the source moves and the counterpart re-mirrors about the
    // fold, so the two stay symmetric and the pair opens. The counterpart has
    // not been asked to go anywhere of its own.
    const before = folded(shell());

    const next = translateFeatures([SLOT, COPY], { x: 10, y: 0 }).apply(before);

    expect(boxOf(next.project, SLOT).minX).toBeCloseTo(22, 6);
    // 22..92 reflected in x = 95 is 98..168.
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(98, 6);
    expect(
      refusedTransforms(before.project, [SLOT, COPY], MatOps.fromTranslation({ x: 10, y: 0 })),
    ).toEqual([]);
  });

  it('moves the whole assembly rigidly when the fold comes along', () => {
    // Select the slot, its counterpart and the fold, and drag: the fold moves
    // too, so everything keeps its place relative to everything else.
    const before = folded(shell());
    const apart = boxOf(before.project, COPY).minX - boxOf(before.project, SLOT).minX;

    const next = translateFeatures([SLOT, COPY, FOLD], { x: 10, y: 0 }).apply(before);

    expect(boxOf(next.project, SLOT).minX).toBeCloseTo(22, 6);
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(118, 6);
    expect(boxOf(next.project, COPY).minX - boxOf(next.project, SLOT).minX).toBeCloseTo(apart, 6);
  });
});

describe('what mirror across fold refuses', () => {
  it('refuses the part’s own outline, naming all three facts', () => {
    const document = shell();

    const refusal = foldMirrorRefusal(document.project, [SHELL], FOLD);

    expect(refusal).toMatchObject({
      code: 'MIRROR_OUTLINE_ACROSS_FOLD',
      facts: { partName: 'Shell' },
    });
    // And the command changes nothing.
    expect(mirrorAcrossFold([SHELL], [COPY], FOLD).apply(document).project).toBe(document.project);
  });

  it('refuses the fold itself: it is the axis, not a thing to mirror', () => {
    const document = shell();

    expect(foldMirrorRefusal(document.project, [FOLD], FOLD)).not.toBeNull();
  });

  it('refuses when the named fold is not a fold line', () => {
    const document = shell();

    expect(foldMirrorRefusal(document.project, [SLOT], SHELL)).not.toBeNull();
  });

  it('says nothing about a slot folded across a real fold', () => {
    expect(foldMirrorRefusal(shell().project, [SLOT], FOLD)).toBeNull();
  });
});

describe('deleting the fold a counterpart is folded about', () => {
  it('freezes the axis: the counterpart keeps its shape and its source', () => {
    const before = folded(shell());
    const was = boxOf(before.project, COPY);

    const next = deleteFeatures([FOLD], 'freeze-dependents').apply(before);

    // The fold is gone; the counterpart is not, and has not moved.
    expect(featureIn(next.project, FOLD)).toBeUndefined();
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(was.minX, 6);

    // Still a mirror, still following its source — only the axis is now a
    // captured line rather than a reference.
    const copy = featureIn(next.project, COPY)!;
    expect(
      copy.kind !== 'text-label' &&
        copy.source.kind === 'derived' &&
        copy.source.op.type === 'mirror' &&
        copy.source.op.axis.kind,
    ).toBe('line');

    // The captured axis is vertical, so a move in y is preserved by the
    // reflection rather than reversed: both halves rise together.
    const moved = translateFeatures([SLOT], { x: 0, y: 5 }).apply(next);
    expect(boxOf(moved.project, COPY).minY).toBeCloseTo(was.minY + 5, 6);
  });

  it('takes the counterpart with it when asked to delete them', () => {
    const before = folded(shell());

    const next = deleteFeatures([FOLD], 'delete-dependents').apply(before);

    expect(featureIn(next.project, COPY)).toBeUndefined();
  });

  it('asks first, because the counterpart depends on it', () => {
    const before = folded(shell());

    // No resolution given: refused, so the dialog gets its turn (ADR 0009).
    expect(deleteFeatures([FOLD]).apply(before).project).toBe(before.project);
  });
});
