import { diagnose, evaluate, type FeatureId, type PartId, type Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addFoldLine,
  addMeasurement,
  addPart,
  addStitchHoles,
  addStitchLine,
  duplicatePart,
  emptyDocument,
  deleteFeatures,
  isPartVisible,
  mirrorAcrossFold,
  mirrorAxisFor,
  mirrorFeatures,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  setFeatureVisible,
  setPartVisible,
  setShape,
  translateFeatures,
} from './commands.js';
import type { Command, Document } from './document.js';

const A = 'part-a' as PartId;
const B = 'part-b' as PartId;

/** A panel with an outline, a stitch line following it, and holes on that. */
function panel(document: Document, partId: PartId, cutId: string, x = 0): Document {
  const apply = (d: Document, c: Command): Document => c.apply(d);
  let next = apply(
    document,
    addPart(rectanglePart(partId, cutId as FeatureId, 'Panel', rectShape({ x, y: 0 }, 100, 60))),
  );
  next = apply(next, addStitchLine(partId, `${cutId}-stitch` as FeatureId, cutId as FeatureId));
  next = apply(
    next,
    addStitchHoles(partId, `${cutId}-holes` as FeatureId, `${cutId}-stitch` as FeatureId),
  );
  return next;
}

const partIn = (project: Project, id: string) => project.parts.find((p) => p.id === id);
const sourceIdOf = (project: Project, featureId: string): string | undefined => {
  const feature = project.parts.flatMap((p) => p.features).find((f) => f.id === featureId);
  return feature?.source.kind === 'derived' ? feature.source.sourceId : undefined;
};

/** Ids for the copy: one per feature, in document order, as the command asks. */
const idsFor = (project: Project, partId: string, prefix: string): FeatureId[] =>
  (partIn(project, partId)?.features ?? []).map((_, i) => `${prefix}-${i}` as FeatureId);

describe('duplicatePart', () => {
  it('copies the part beside the original', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    expect(next.project.parts.map((p) => p.id)).toEqual([A, B]);
    expect(partIn(next.project, B)?.name).toBe('Panel copy');
    expect(partIn(next.project, B)?.features).toHaveLength(3);
  });

  it('re-points derivations inside the part to the copies', () => {
    // The whole point: the copy's stitch line follows the copy's outline, not
    // the original's. Otherwise editing the original would move the copy's
    // stitching and the copy would not be a copy at all.
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    const [outline, stitch, holes] = partIn(next.project, B)!.features;
    expect(sourceIdOf(next.project, stitch!.id)).toBe(outline!.id);
    expect(sourceIdOf(next.project, holes!.id)).toBe(stitch!.id);
  });

  it('never points the copy at the original, nor the original at the copy', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const original = new Set(partIn(document.project, A)!.features.map((f) => f.id));
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    for (const feature of partIn(next.project, B)!.features) {
      const source = sourceIdOf(next.project, feature.id);
      expect(source === undefined || !original.has(source as FeatureId)).toBe(true);
    }
    // And the original is untouched.
    expect(partIn(next.project, A)).toEqual(partIn(document.project, A));
  });

  it('leaves a derivation to another part pointing where it did', () => {
    // §3.2: only derivations *inside* the part are re-pointed. One that
    // reaches into another part still means the other part. A mirrored piece
    // is the one that does (Q8): its outline mirrors the original's.
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const axis = mirrorAxisFor(document.project, ['cut-a' as FeatureId], 'horizontal')!;
    const mirrored = mirrorFeatures(['cut-a'] as FeatureId[], ['cross-1'] as FeatureId[], axis, [
      B,
    ]).apply(document);

    const next = duplicatePart(B, 'part-c' as PartId, ['copy-0'] as FeatureId[]).apply(mirrored);

    expect(sourceIdOf(next.project, 'copy-0')).toBe('cut-a');
  });

  it("re-points a dimension's two ends to the copy (Q10)", () => {
    let document = panel(emptyDocument('proj'), A, 'cut-a');
    document = addMeasurement(
      'dim' as FeatureId,
      'aligned',
      { kind: 'anchor', featureId: 'cut-a' as FeatureId, anchor: 3 },
      { kind: 'anchor', featureId: 'cut-a' as FeatureId, anchor: 0 },
    ).apply(document);
    const ids = idsFor(document.project, A, 'copy');

    let next = duplicatePart(A, B, ids).apply(document);
    const [outline, , , dimension] = partIn(next.project, B)!.features;
    expect(dimension!.source).toMatchObject({
      a: { featureId: outline!.id },
      b: { featureId: outline!.id },
    });

    // So it reads the copy: resize the copy and its dimension follows.
    next = setShape(outline!.id, rectShape({ x: 0, y: 0 }, 50, 60)).apply(next);
    const read = evaluate(next.project)
      .parts.flatMap((p) => p.features)
      .find((e) => e.feature.id === dimension!.id);
    expect(read?.ok === true ? read.text?.layout.text : undefined).toBe('50.0');
  });

  it("re-points a fold mirror to the copy's own fold (Q10)", () => {
    let document = addPart(
      rectanglePart(A, 'o' as FeatureId, 'Wallet', rectShape({ x: 0, y: 0 }, 200, 90)),
    ).apply(emptyDocument('proj'));
    document = addFoldLine(A, 'f' as FeatureId, {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 100, y: 0 },
          { x: 100, y: 90 },
        ],
        false,
      ),
    }).apply(document);
    document = addCutOut(A, 'slot' as FeatureId, {
      kind: 'shape',
      shape: rectShape({ x: 20, y: 60 }, 60, 5),
    }).apply(document);
    document = mirrorAcrossFold(
      ['slot'] as FeatureId[],
      ['slotM'] as FeatureId[],
      'f' as FeatureId,
    ).apply(document);

    const next = duplicatePart(A, B, ['o2', 'f2', 'slot2', 'slotM2'] as FeatureId[]).apply(
      document,
    );

    const copy = partIn(next.project, B)!.features.find((f) => f.id === 'slotM2')!;
    expect(copy.source).toMatchObject({ sourceId: 'slot2', op: { axis: { foldId: 'f2' } } });
    // And it lands on the copy, not 230 mm off it: nothing is off the material.
    expect(diagnose(next.project).filter((d) => d.partId === B)).toEqual([]);
  });

  it('places the copy clear of the original rather than exactly on top', () => {
    // A copy drawn on top of its original is invisible, and the first thing
    // anyone would do is drag it off.
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    const boxOf = (partId: string) => {
      const part = evaluate(next.project).parts.find((p) => p.part.id === partId)!;
      const boxes = part.features.flatMap((e) => (e.ok ? [PathOps.bbox(e.path)!] : []));
      return boxes.reduce((acc, b) => ({
        minX: Math.min(acc.minX, b.minX),
        maxX: Math.max(acc.maxX, b.maxX),
        minY: Math.min(acc.minY, b.minY),
        maxY: Math.max(acc.maxY, b.maxY),
      }));
    };

    // Clear to the right, and no overlap.
    expect(boxOf(B).minX).toBeGreaterThan(boxOf(A).maxX);
  });

  it('refuses, changing nothing, when given too few ids', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');

    expect(duplicatePart(A, B, ['only-one' as FeatureId]).apply(document).project).toBe(
      document.project,
    );
  });

  it('is a no-op for a part that is not there', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');

    expect(duplicatePart('nobody' as PartId, B, []).apply(document).project).toBe(document.project);
  });

  it('copies a locked feature as locked, but is not refused by it', () => {
    // Duplicating changes nothing about the original, so the lock has no
    // reason to stop it — and the copy arrives pinned down the same way.
    let document = panel(emptyDocument('proj'), A, 'cut-a');
    document = {
      project: {
        ...document.project,
        parts: document.project.parts.map((p) => ({
          ...p,
          features: p.features.map((f) => (f.id === 'cut-a' ? { ...f, locked: true } : f)),
        })),
      },
    };
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    expect(partIn(next.project, B)?.features[0]?.locked).toBe(true);
  });
});

describe('part visibility', () => {
  it('hides every feature in the part', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');

    const hidden = setPartVisible(A, false).apply(document);

    expect(partIn(hidden.project, A)!.features.every((f) => !f.visible)).toBe(true);
    expect(isPartVisible(partIn(hidden.project, A)!)).toBe(false);
  });

  it('shows every feature again', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const hidden = setPartVisible(A, false).apply(document);

    const shown = setPartVisible(A, true).apply(hidden);

    expect(partIn(shown.project, A)!.features.every((f) => f.visible)).toBe(true);
    expect(isPartVisible(partIn(shown.project, A)!)).toBe(true);
  });

  it('reads as hidden only when nothing in it is visible', () => {
    const document = panel(emptyDocument('proj'), A, 'cut-a');
    const one = setFeatureVisible('cut-a' as FeatureId, false).apply(document);

    expect(isPartVisible(partIn(one.project, A)!)).toBe(true);
  });

  it('treats an empty part as visible, having nothing hidden', () => {
    const document = addPart({ id: B, name: 'Empty', quantity: 1, features: [] }).apply(
      emptyDocument('proj'),
    );

    expect(isPartVisible(partIn(document.project, B)!)).toBe(true);
  });

  it('hides a locked feature with the rest, because the lock is not about the view', () => {
    let document = panel(emptyDocument('proj'), A, 'cut-a');
    document = {
      project: {
        ...document.project,
        parts: document.project.parts.map((p) => ({
          ...p,
          features: p.features.map((f) => (f.id === 'cut-a' ? { ...f, locked: true } : f)),
        })),
      },
    };

    const hidden = setPartVisible(A, false).apply(document);

    expect(partIn(hidden.project, A)!.features.every((f) => !f.visible)).toBe(true);
  });
});

describe('duplicating a part that is locked', () => {
  const lockAll = (document: Document, partId: string): Document => ({
    project: {
      ...document.project,
      parts: document.project.parts.map((p) =>
        p.id === partId ? { ...p, features: p.features.map((f) => ({ ...f, locked: true })) } : p,
      ),
    },
  });

  it('still places the copy clear of the original', () => {
    // The copy inherits the lock, and the placement is part of *making* the
    // copy rather than an edit to it — so the lock must not refuse it. It did:
    // a duplicated locked part landed exactly on top of its original, which
    // looks precisely like the button doing nothing.
    const document = lockAll(panel(emptyDocument('proj'), A, 'cut-a'), A);
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    const xOf = (partId: string) => {
      const part = evaluate(next.project).parts.find((p) => p.part.id === partId)!;
      const boxes = part.features.flatMap((e) => (e.ok ? [PathOps.bbox(e.path)!] : []));
      return {
        minX: Math.min(...boxes.map((b) => b.minX)),
        maxX: Math.max(...boxes.map((b) => b.maxX)),
      };
    };

    expect(xOf(B).minX).toBeGreaterThan(xOf(A).maxX);
  });

  it('gives the copy back its locks once it is placed', () => {
    const document = lockAll(panel(emptyDocument('proj'), A, 'cut-a'), A);
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    expect(partIn(next.project, B)!.features.every((f) => f.locked)).toBe(true);
  });

  /**
   * The contract, end to end, because the implementation deliberately does
   * **not** copy the state verbatim.
   *
   * A copy of a locked part is built unlocked so that placing it is not
   * refused by the lock it just inherited, and then re-locked once it is in
   * place. That is an invisible detour, and the only thing holding it honest
   * is this: whatever happens in the middle, what comes out is a locked part,
   * beside the original, that refuses to be edited. If someone later
   * simplifies `duplicatePart` to the obvious copy-everything path, the
   * placement assertion fails; if they simplify away the re-lock, the last two
   * fail.
   */
  it('makes a locked copy, placed clear, that refuses to be edited', () => {
    const document = lockAll(panel(emptyDocument('proj'), A, 'cut-a'), A);
    const ids = idsFor(document.project, A, 'copy');
    const [outlineId] = ids;

    // 1. It succeeds at all: the lock on the original is no reason to refuse a
    //    copy, which changes nothing about the original.
    const next = duplicatePart(A, B, ids).apply(document);
    expect(next.project).not.toBe(document.project);
    expect(partIn(next.project, B)?.features).toHaveLength(3);

    // 2. It is placed clear of the original, not dropped on top of it — the
    //    failure the detour exists to avoid.
    const spanOf = (partId: string) => {
      const part = evaluate(next.project).parts.find((p) => p.part.id === partId)!;
      const boxes = part.features.flatMap((e) => (e.ok ? [PathOps.bbox(e.path)!] : []));
      return {
        minX: Math.min(...boxes.map((b) => b.minX)),
        maxX: Math.max(...boxes.map((b) => b.maxX)),
      };
    };
    expect(spanOf(B).minX).toBeGreaterThan(spanOf(A).maxX);

    // 3. It ends locked. The lock is a property of the finished copy, not of
    //    the act of making it.
    expect(partIn(next.project, B)!.features.every((f) => f.locked)).toBe(true);

    // 4. And the lock is real, not just a flag: geometry edits to the copy are
    //    refused, changing nothing (S7).
    expect(translateFeatures([outlineId!], { x: 25, y: 0 }).apply(next).project).toBe(next.project);
    expect(setShape(outlineId!, rectShape({ x: 0, y: 0 }, 999, 999)).apply(next).project).toBe(
      next.project,
    );
    expect(deleteFeatures([outlineId!]).apply(next).project).toBe(next.project);

    // Unlocking the copy releases it, and the original stays pinned down.
    const freed = setFeatureLocked(outlineId!, false).apply(next);
    expect(translateFeatures([outlineId!], { x: 25, y: 0 }).apply(freed).project).not.toBe(
      freed.project,
    );
    expect(partIn(freed.project, A)!.features.every((f) => f.locked)).toBe(true);
  });

  it('keeps a mixed set of locks exactly as it found them', () => {
    let document = panel(emptyDocument('proj'), A, 'cut-a');
    document = {
      project: {
        ...document.project,
        parts: document.project.parts.map((p) => ({
          ...p,
          features: p.features.map((f) => (f.id === 'cut-a-stitch' ? { ...f, locked: true } : f)),
        })),
      },
    };
    const ids = idsFor(document.project, A, 'copy');

    const next = duplicatePart(A, B, ids).apply(document);

    expect(partIn(next.project, B)!.features.map((f) => f.locked)).toEqual([false, true, false]);
  });
});
