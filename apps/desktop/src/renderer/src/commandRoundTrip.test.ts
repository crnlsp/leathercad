import * as D from '@leathercad/document';
import { evaluate, type FeatureId, type PartId, type Project } from '@leathercad/domain';
import { buildExportScene, pageSetupFor, paginate } from '@leathercad/export';
import { MatOps, PathOps } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/**
 * Every document the commands can make is one the app can open again.
 *
 * The promise behind Save: what the maker sees is what reopens. Two ordinary
 * gestures once broke it — mirroring an outline and mirroring a dimension (Q8,
 * Q9) — each saving a file the loader then refused, taking the crash-recovery
 * copy with it. Neither was a bug in the loader: the loader was right, and a
 * command had made a document the model does not allow. This walks random
 * sequences of the commands a maker can reach and holds every result to
 * three things: it saves, it reopens to the same file, and it paginates.
 *
 * Lives in the app because it is the one place that may import the document,
 * the file format and the export together.
 */

const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-09-24T00:00:00.000Z') };

/** One step: which command, and small integers that pick its operands. */
interface Step {
  readonly kind: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly x: number;
  readonly y: number;
}

const stepArb: fc.Arbitrary<Step> = fc.record({
  kind: fc.nat(),
  a: fc.nat(),
  b: fc.nat(),
  c: fc.nat(),
  x: fc.integer({ min: -200, max: 400 }),
  y: fc.integer({ min: -200, max: 300 }),
});

const at = (x: number, y: number) => ({ x, y });

/**
 * Turns a step into a command against the document as it now is.
 *
 * Operands are picked from what exists, so most steps mean something; ids for
 * new things are fresh, as the app's id factory makes them. A step that picks
 * nonsense is refused by its command, which is part of what is being tested.
 */
function commandFor(
  step: Step,
  project: Project,
  fresh: () => string,
): D.Command | null | undefined {
  const parts = project.parts;
  const features = parts.flatMap((part) => part.features);
  const part = parts.length === 0 ? undefined : parts[step.a % parts.length]!;
  const feature = features.length === 0 ? undefined : features[step.b % features.length]!;
  const other = features.length === 0 ? undefined : features[step.c % features.length]!;
  const size = 20 + (step.c % 120);

  switch (step.kind % 26) {
    case 0:
    case 1:
      return D.addPart(
        D.rectanglePart(fresh(), fresh(), 'Panel', D.rectShape(at(step.x, step.y), size, 60)),
      );
    case 2:
      return (
        part &&
        D.addCutOut(part.id, fresh(), {
          kind: 'shape',
          shape: D.rectShape(at(step.x / 4, step.y / 4), 10, 5),
        })
      );
    case 3:
      return part && feature && D.addStitchLine(part.id, fresh(), feature.id);
    case 4:
      return part && feature && D.addStitchHoles(part.id, fresh(), feature.id);
    case 5:
      return (
        part &&
        D.addFoldLine(part.id, fresh(), {
          kind: 'path',
          path: PathOps.polyline([at(step.x / 4, 0), at(step.x / 4, 60)], false),
        })
      );
    case 6:
      return (
        feature &&
        other &&
        D.addMeasurement(
          fresh(),
          'aligned',
          { kind: 'anchor', featureId: feature.id, anchor: step.a % 4 },
          { kind: 'anchor', featureId: other.id, anchor: step.c % 4 },
        )
      );
    case 7:
      return part && D.addTextLabel(part.id, fresh(), at(step.x / 4, step.y / 4), 'Keeper');
    case 8:
      return part && D.addHardwareHole(part.id, fresh(), at(step.x / 4, step.y / 4), 2);
    case 9:
      return D.addAllowancePart(fresh(), fresh(), fresh(), {
        kind: 'shape',
        shape: D.rectShape(at(step.x, step.y), size, 50),
      });
    case 10:
      return feature && D.deleteFeatures([feature.id], 'freeze-dependents');
    case 11:
      return feature && D.deleteFeatures([feature.id], 'delete-dependents');
    case 12:
      return (
        part && D.deletePart(part.id, step.c % 2 === 0 ? 'freeze-dependents' : 'delete-dependents')
      );
    case 13:
      return (
        part &&
        D.duplicatePart(
          part.id,
          fresh(),
          part.features.map(() => fresh()),
        )
      );
    case 14:
    case 15: {
      if (feature === undefined) return null;
      const axis = D.mirrorAxisFor(
        project,
        [feature.id],
        step.kind % 2 === 0 ? 'horizontal' : 'vertical',
      );
      return axis && D.mirrorFeatures([feature.id], [fresh()], axis, [fresh()]);
    }
    case 16:
      return feature && other && D.mirrorAcrossFold([feature.id], [fresh()], other.id);
    case 17:
      return feature && other && D.setSource(feature.id, other.id);
    case 18:
      return feature && D.translateFeatures([feature.id], at(step.x / 10, step.y / 10));
    case 19:
      return (
        feature &&
        D.transformFeatures([feature.id], MatOps.fromRotationAround(at(step.x, step.y), step.c / 7))
      );
    case 20:
      return feature && D.flipFeatures([feature.id], step.c % 2 === 0 ? 'horizontal' : 'vertical');
    case 21:
      return (
        feature && D.setShape(feature.id, D.rectShape(at(step.x, step.y), size, 40, step.c % 6))
      );
    case 22:
      return feature && D.setFeatureVisible(feature.id, step.c % 2 === 0);
    case 23:
      return part && D.setPartVisible(part.id, step.c % 2 === 0);
    case 24:
      return feature && D.setFeatureLocked(feature.id, step.c % 3 === 0);
    default:
      return part && D.setPartQuantity(part.id, 1 + (step.c % 3));
  }
}

/** Plays the steps, keeping every document along the way. */
function play(steps: readonly Step[]): Project[] {
  let n = 0;
  const fresh = () => `id-${String(n++).padStart(4, '0')}`;
  let document = D.emptyDocument('fuzz' as string, 'Fuzz');
  const seen: Project[] = [];
  for (const step of steps) {
    const command = commandFor(step, document.project, fresh);
    if (command === null || command === undefined) continue;
    document = command.apply(document);
    seen.push(document.project);
  }
  return seen;
}

describe('every document the commands make', () => {
  it('saves, reopens to the same file, and paginates', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 14 }), (steps) => {
        for (const project of play(steps)) {
          const saved = saveProject(project, SAVE);
          const reopened = loadProject(saved).project;
          // Byte-equal after a second save: the file is a fixed point, which
          // is "reopens identically" without depending on in-memory rounding.
          expect(saveProject(reopened, SAVE)).toEqual(saved);
          expect(() =>
            paginate(
              buildExportScene(evaluate(reopened), reopened.name),
              pageSetupFor(reopened.settings),
            ),
          ).not.toThrow();
        }
      }),
      { numRuns: 300 },
    );
  });

  it('includes the two gestures that once did not (Q8, Q9)', () => {
    // Pinned as examples as well, so a change to the arbitrary above cannot
    // quietly stop reaching them.
    const outline = 'o' as FeatureId;
    let document = D.addPart(
      D.rectanglePart('p' as PartId, outline, 'Side', D.rectShape(at(0, 0), 80, 50)),
    ).apply(D.emptyDocument('qa'));
    document = D.addMeasurement(
      'm' as FeatureId,
      'aligned',
      { kind: 'anchor', featureId: outline, anchor: 3 },
      { kind: 'anchor', featureId: outline, anchor: 0 },
    ).apply(document);

    for (const ids of [[outline], ['m' as FeatureId]]) {
      const axis = D.mirrorAxisFor(document.project, ids, 'horizontal')!;
      const next = D.mirrorFeatures(ids, ['n' as FeatureId], axis, ['q' as PartId]).apply(document);
      expect(() => loadProject(saveProject(next.project, SAVE))).not.toThrow();
    }
  });
});
