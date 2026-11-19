import { approxEq, EPS_POINT, QUANTUM_MM, quantise } from '@leathercad/core';
import {
  evaluate,
  graphProblems,
  partStructureProblems,
  referencesOf,
  type Feature,
  type FeatureId,
  type PartId,
  type Project,
} from '@leathercad/domain';
import { PathOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addFoldLine,
  addPart,
  addStitchHoles,
  addStitchLine,
  circleShape,
  emptyDocument,
  mirrorAcrossFold,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  translateFeatures,
} from './commands.js';
import type { Command, Document } from './document.js';
import { copyFeatures, featureStep, pasteFeatures, type CopiedFeatures } from './pieces.js';

/** 8.8b-4: features copied into a piece, and duplicated and stepped inside one. */

const apply = (document: Document, ...commands: Command[]): Document =>
  commands.reduce((d, c) => c.apply(d), document);
const fid = (id: string) => id as FeatureId;
const pid = (id: string) => id as PartId;

/**
 * The bifold's lining, smaller: an outline, a fold down its middle, a slot on
 * the left and its mirror across the fold, and a stitched round hole — a
 * cut-out with a stitch line and holes around it, all derived from it.
 */
function lining(document: Document, partId = 'lining', x = 0): Document {
  const p = pid(partId);
  const at = (id: string) => fid(`${partId}-${id}`);
  return apply(
    document,
    addPart(rectanglePart(p, at('outline'), 'Lining', rectShape({ x, y: 0 }, 200, 95))),
    addFoldLine(p, at('fold'), {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: x + 100, y: 0 },
          { x: x + 100, y: 95 },
        ],
        false,
      ),
    }),
    addCutOut(p, at('slot'), { kind: 'shape', shape: rectShape({ x: x + 18, y: 65 }, 64, 3) }),
    mirrorAcrossFold([at('slot')], [at('slot-m')], at('fold')),
    addCutOut(p, at('ring'), { kind: 'shape', shape: circleShape({ x: x + 50, y: 30 }, 8) }),
    addStitchLine(p, at('ring-stitch'), at('ring')),
    addStitchHoles(p, at('ring-holes'), at('ring-stitch')),
  );
}

/** Fresh ids for everything a copy of features holds. */
function freshIds(copied: CopiedFeatures, prefix = 'new') {
  return {
    features: copied.features.map((_, i) => fid(`${prefix}-f-${String(i)}`)),
    seams: copied.seams.map((_, i) => `${prefix}-seam-${String(i)}`),
  };
}

const featuresOf = (project: Project, partId: string): readonly Feature[] =>
  project.parts.find((p) => p.id === partId)?.features ?? [];

/** The evaluated box of some features. */
function boxOf(project: Project, ids: readonly string[]): Rect | null {
  return RectOps.unionAll(
    evaluate(project)
      .parts.flatMap((entry) => entry.features)
      .filter((entry) => ids.includes(entry.feature.id))
      .flatMap((entry) => (entry.ok ? [PathOps.bbox(entry.path)] : []))
      .filter((box) => box !== null),
  );
}

const sound = (project: Project) => {
  expect(graphProblems(project)).toEqual([]);
  expect(partStructureProblems(project)).toEqual([]);
};

describe('copyFeatures and pasteFeatures (8.8b-4)', () => {
  it('pastes a root feature into another piece as it is, under new ids', () => {
    const document = lining(lining(emptyDocument('p')), 'other', 300);
    const { copied, frozen, dropped } = copyFeatures(document.project, [fid('lining-ring')]);
    expect(frozen).toEqual([]);
    expect(dropped).toEqual([]);

    const next = pasteFeatures(copied, freshIds(copied), pid('other'), null).apply(document);

    const pasted = featuresOf(next.project, 'other').at(-1)!;
    expect(pasted.id).toBe('new-f-0');
    expect(pasted.source).toEqual(featuresOf(document.project, 'lining')[4]!.source);
    sound(next.project);
  });

  it('brings derived features with their sources, re-pointed to the copies', () => {
    const document = lining(emptyDocument('p'));
    const ids = ['lining-ring', 'lining-ring-stitch', 'lining-ring-holes'].map(fid);
    const { copied, frozen } = copyFeatures(document.project, ids);
    expect(frozen).toEqual([]);

    const next = pasteFeatures(copied, freshIds(copied), pid('lining'), null).apply(document);

    const pasted = featuresOf(next.project, 'lining').slice(-3);
    expect(pasted.map((f) => referencesOf(f))).toEqual([[], ['new-f-0'], ['new-f-1']]);
    sound(next.project);
  });

  it('freezes a derived feature whose source stays behind, and says so when copying', () => {
    const document = lining(emptyDocument('p'));
    const { copied, frozen, dropped } = copyFeatures(document.project, [fid('lining-ring-stitch')]);

    expect(frozen).toEqual([{ featureName: 'Stitch line', partName: 'Lining' }]);
    expect(dropped).toEqual([]);
    expect(copied.features[0]?.source.kind).toBe('path');

    // The frozen line is the stitch line as drawn when it was copied.
    const next = pasteFeatures(copied, freshIds(copied), pid('lining'), null).apply(document);
    const drawn = (id: string) =>
      evaluate(next.project).parts[0]!.features.find((e) => e.feature.id === id);
    const [was, is] = [drawn('lining-ring-stitch'), drawn('new-f-0')];
    expect(was?.ok && is?.ok && PathOps.bbox(is.path)).toEqual(was?.ok && PathOps.bbox(was.path));
  });

  it('leaves out holes whose line stays behind, having no drawn form, and names them', () => {
    const document = lining(emptyDocument('p'));
    const { copied, dropped } = copyFeatures(document.project, [fid('lining-ring-holes')]);
    expect(copied.features).toEqual([]);
    expect(dropped).toEqual([{ featureName: 'Stitch holes', partName: 'Lining' }]);
  });

  it('keeps a fold mirror copied with its original mirroring it, about the line the fold is on', () => {
    const document = lining(lining(emptyDocument('p')), 'other', 300);
    const { copied, frozen } = copyFeatures(document.project, [
      fid('lining-slot'),
      fid('lining-slot-m'),
    ]);
    expect(frozen).toEqual([]);

    const next = pasteFeatures(copied, freshIds(copied), pid('lining'), null).apply(document);

    const mirror = featuresOf(next.project, 'lining').at(-1)!;
    expect(referencesOf(mirror)).toEqual(['new-f-0']);
    // In place, it draws exactly where the original's mirror does.
    expect(boxOf(next.project, ['new-f-1'])).toEqual(boxOf(document.project, ['lining-slot-m']));
    sound(next.project);
  });

  it('copies in document order, whatever order they were asked for in', () => {
    const document = lining(emptyDocument('p'));
    const { copied } = copyFeatures(document.project, [fid('lining-ring'), fid('lining-slot')]);
    expect(copied.features.map((f) => f.id)).toEqual(['lining-slot', 'lining-ring']);
  });

  it('with no point, pastes in place: a duplicate stands on its original until moved', () => {
    const document = lining(emptyDocument('p'));
    const { copied } = copyFeatures(document.project, [fid('lining-slot')]);
    const next = pasteFeatures(copied, freshIds(copied), pid('lining'), null).apply(document);
    expect(boxOf(next.project, ['new-f-0'])).toEqual(boxOf(document.project, ['lining-slot']));
  });

  it('centres the copy on the point it is pasted at, moved by whole quanta', () => {
    const document = lining(lining(emptyDocument('p')), 'other', 300);
    const { copied } = copyFeatures(document.project, [fid('lining-slot')]);
    const at = { x: 350.123456, y: 40.98765 };
    const next = pasteFeatures(copied, freshIds(copied), pid('other'), at).apply(document);

    const box = boxOf(next.project, ['new-f-0'])!;
    const half = QUANTUM_MM / 2 + EPS_POINT;
    expect(approxEq((box.minX + box.maxX) / 2, at.x, half)).toBe(true);
    expect(approxEq((box.minY + box.maxY) / 2, at.y, half)).toBe(true);
    const was = boxOf(document.project, ['lining-slot'])!;
    expect(approxEq(box.minX - was.minX, quantise(box.minX - was.minX))).toBe(true);
  });

  it('pastes that far from where they were copied, given a step', () => {
    const document = lining(emptyDocument('p'));
    const { copied } = copyFeatures(document.project, [fid('lining-slot'), fid('lining-slot-m')]);
    const next = pasteFeatures(copied, freshIds(copied), pid('lining'), null, {
      x: 0,
      y: -15,
    }).apply(document);
    const was = boxOf(document.project, ['lining-slot', 'lining-slot-m'])!;
    const is = boxOf(next.project, ['new-f-0', 'new-f-1'])!;
    expect(is.minX).toBeCloseTo(was.minX, 9);
    expect(is.minY).toBeCloseTo(was.minY - 15, 9);
    expect(is.maxX).toBeCloseTo(was.maxX, 9);
  });

  it('keeps locks, and still places a locked feature', () => {
    let document = lining(emptyDocument('p'));
    document = setFeatureLocked([fid('lining-slot')], true).apply(document);
    const { copied } = copyFeatures(document.project, [fid('lining-slot')]);
    const next = pasteFeatures(copied, freshIds(copied), pid('lining'), null, {
      x: 0,
      y: -15,
    }).apply(document);
    const pasted = featuresOf(next.project, 'lining').at(-1)!;
    expect(pasted.locked).toBe(true);
    expect(boxOf(next.project, ['new-f-0'])!.minY).toBeCloseTo(
      boxOf(document.project, ['lining-slot'])!.minY - 15,
      9,
    );
  });

  it('leaves the rest of the project exactly as it was', () => {
    const document = lining(lining(emptyDocument('p')), 'other', 300);
    const { copied } = copyFeatures(document.project, [fid('lining-slot')]);
    const next = pasteFeatures(copied, freshIds(copied), pid('other'), null).apply(document);
    expect(next.project.parts[0]).toBe(document.project.parts[0]);
    featuresOf(document.project, 'other').forEach((f, i) =>
      expect(featuresOf(next.project, 'other')[i]).toBe(f),
    );
  });

  it('says what it pasted, by count, for Undo', () => {
    const document = lining(emptyDocument('p'));
    const { copied } = copyFeatures(document.project, [fid('lining-slot'), fid('lining-ring')]);
    expect(pasteFeatures(copied, freshIds(copied), pid('lining'), null).label).toEqual({
      action: 'paste-features',
      count: 2,
    });
  });

  it('refuses, changing nothing, into no piece, with too few ids, or with nothing copied', () => {
    const document = lining(emptyDocument('p'));
    const { copied } = copyFeatures(document.project, [fid('lining-slot')]);
    const none = copyFeatures(document.project, [fid('lining-ring-holes')]).copied;
    const ids = freshIds(copied);
    expect(pasteFeatures(copied, ids, pid('nowhere'), null).apply(document)).toBe(document);
    expect(
      pasteFeatures(copied, { ...ids, features: [] }, pid('lining'), null).apply(document),
    ).toBe(document);
    expect(pasteFeatures(none, freshIds(none), pid('lining'), null).apply(document)).toBe(document);
  });

  it('refuses a copy holding an outline, which would give the piece a second one (S5)', () => {
    const document = lining(emptyDocument('p'));
    const outline = featuresOf(document.project, 'lining')[0]!;
    const copied = { features: [outline], seams: [] };
    expect(pasteFeatures(copied, freshIds(copied), pid('lining'), null).apply(document)).toBe(
      document,
    );
  });

  it('refuses a point or a step that is not a number, naming it', () => {
    const copied = { features: [], seams: [] };
    expect(() =>
      pasteFeatures(copied, freshIds(copied), pid('lining'), { x: Number.NaN, y: 0 }),
    ).toThrow(/paste point/);
    expect(() =>
      pasteFeatures(copied, freshIds(copied), pid('lining'), null, { x: 0, y: Infinity }),
    ).toThrow(/paste step/);
  });
});

/** Any subset of the lining's features but its outline, which stands for the piece. */
const featureSets = fc.subarray(
  ['fold', 'slot', 'slot-m', 'ring', 'ring-stitch', 'ring-holes'].map((id) => fid(`lining-${id}`)),
  { minLength: 1 },
);
const anywhere = fc.integer({ min: -3_500_000, max: 3_500_000 }).map((n) => n / 7000);
const quantised = fc
  .integer({ min: -2_000_000, max: 2_000_000 })
  .map((n) => quantise(n * QUANTUM_MM));

describe('copy then paste of features, as a property', () => {
  it('gives a sound project, with every reference inside what was pasted', () => {
    fc.assert(
      fc.property(
        featureSets,
        fc.option(fc.record({ x: anywhere, y: anywhere }), { nil: null }),
        fc.constantFrom('lining', 'other'),
        (ids, at, into) => {
          const document = lining(lining(emptyDocument('p')), 'other', 300);
          const { copied } = copyFeatures(document.project, ids);
          const fresh = freshIds(copied);
          const next = pasteFeatures(copied, fresh, pid(into), at).apply(document).project;

          sound(next);
          const pasted = featuresOf(next, into).filter((f) => fresh.features.includes(f.id));
          expect(pasted).toHaveLength(copied.features.length);
          for (const f of pasted) {
            for (const ref of referencesOf(f)) expect(fresh.features).toContain(ref);
          }
        },
      ),
    );
  });

  it('evaluates in place to exactly what was copied, a feature at a time', () => {
    fc.assert(
      fc.property(featureSets, (ids) => {
        const document = lining(emptyDocument('p'));
        const { copied } = copyFeatures(document.project, ids);
        const fresh = freshIds(copied);
        const next = pasteFeatures(copied, fresh, pid('lining'), null).apply(document).project;
        copied.features.forEach((f, i) => {
          expect(boxOf(next, [fresh.features[i]!])).toEqual(boxOf(document.project, [f.id]));
        });
      }),
    );
  });
});

describe('a step of features, for step and repeat (8.8b-4)', () => {
  it('is read back off a move of those features, whoever made the move', () => {
    fc.assert(
      fc.property(featureSets, fc.record({ x: quantised, y: quantised }), (ids, step) => {
        const { project } = lining(emptyDocument('p'));
        const after = translateFeatures(ids, step).apply({ project }).project;
        const read = featureStep(project, after, new Set(ids));
        if (after === project || (step.x === 0 && step.y === 0)) {
          expect(read).toBeNull();
        } else {
          expect(read).toEqual(step);
        }
      }),
    );
  });

  it('is not read off a move of anything but those features', () => {
    const document = lining(emptyDocument('p'));
    const move = (ids: string[], by: Vec2 = { x: 3, y: 4 }) =>
      translateFeatures(ids.map(fid), by).apply(document).project;
    const slot = new Set([fid('lining-slot')]);
    expect(featureStep(document.project, move(['lining-slot']), slot)).toEqual({ x: 3, y: 4 });
    expect(featureStep(document.project, move(['lining-ring']), slot)).toBeNull();
    expect(featureStep(document.project, move(['lining-slot', 'lining-ring']), slot)).toBeNull();
    expect(featureStep(document.project, document.project, slot)).toBeNull();
  });

  it('steps three slots 15 mm down the lining: duplicate, move 15 mm, duplicate with that step', () => {
    const document = lining(emptyDocument('p'));
    const slotIds = [fid('lining-slot'), fid('lining-slot-m')];
    const first = copyFeatures(document.project, slotIds).copied;
    const pasted = pasteFeatures(first, freshIds(first, 'a'), pid('lining'), null).apply(document);
    const second = translateFeatures([fid('a-f-0'), fid('a-f-1')], { x: 0, y: -15 }).apply(pasted);
    const step = featureStep(pasted.project, second.project, new Set([fid('a-f-0'), fid('a-f-1')]));
    expect(step).toEqual({ x: 0, y: -15 });

    const again = copyFeatures(second.project, [fid('a-f-0'), fid('a-f-1')]).copied;
    const third = pasteFeatures(again, freshIds(again, 'b'), pid('lining'), null, step).apply(
      second,
    ).project;

    const bottom = (ids: string[]) => boxOf(third, ids)!.minY;
    expect(bottom(['a-f-0', 'a-f-1'])).toBeCloseTo(
      bottom(['lining-slot', 'lining-slot-m']) - 15,
      9,
    );
    expect(bottom(['b-f-0', 'b-f-1'])).toBeCloseTo(bottom(['a-f-0', 'a-f-1']) - 15, 9);
    // Each mirror still mirrors its own slot, across the lining's middle.
    expect(boxOf(third, ['b-f-1'])!.minX).toBeCloseTo(
      boxOf(document.project, ['lining-slot-m'])!.minX,
      9,
    );
    sound(third);
  });
});
