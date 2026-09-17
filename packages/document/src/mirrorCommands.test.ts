import { evaluate, type FeatureId, type PartId, type Project } from '@leathercad/domain';
import { MatOps, PathOps, glideMatrix } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addPart,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  mirrorAxisFor,
  mirrorFeatures,
  mirrorRefusal,
  rectShape,
  rectanglePart,
  refusedTransforms,
  setFeatureLocked,
  setShape,
  transformFeatures,
  translateFeatures,
} from './commands.js';
import type { Document } from './document.js';

const PART = 'part-1' as PartId;
const CUT = 'cut-1' as FeatureId;
const COPY = 'copy-1' as FeatureId;

/** A 100 × 60 panel at the origin. */
function panel(): Document {
  return addPart(rectanglePart(PART, CUT, 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))).apply(
    emptyDocument('proj'),
  );
}

/** That panel, with a counterpart mirrored across its right edge. */
function pair(): Document {
  const document = panel();
  return mirrorFeatures([CUT], [COPY], mirrorAxisFor(document.project, [CUT], 'horizontal')!).apply(
    document,
  );
}

const boxOf = (project: Project, id: string) => {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id);
  if (entry?.ok !== true) throw new Error(`${id} did not resolve`);
  return PathOps.bbox(entry.path)!;
};

const pathOf = (project: Project, id: string) => {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id);
  if (entry?.ok !== true) throw new Error(`${id} did not resolve`);
  return entry.path;
};

const featureIn = (project: Project, id: string) =>
  project.parts.flatMap((p) => p.features).find((f) => f.id === id);

describe('mirroring a feature', () => {
  it('puts the counterpart beside the original, in the same part', () => {
    const next = pair();

    // One part, two features: a paired pair of slots belongs to the panel they
    // are cut in.
    expect(next.project.parts).toHaveLength(1);
    expect(boxOf(next.project, COPY)).toMatchObject({ minX: 100, maxX: 200 });
    expect(boxOf(next.project, CUT)).toMatchObject({ minX: 0, maxX: 100 });
  });

  it('keeps the kind and the role', () => {
    const copy = featureIn(pair().project, COPY)!;

    expect(copy.kind).toBe('cut-contour');
    expect(copy.kind === 'cut-contour' && copy.role).toBe('outer');
  });

  it('follows the original when the original is reshaped', () => {
    const next = setShape(CUT, rectShape({ x: 0, y: 0 }, 140, 60)).apply(pair());

    // The axis stays at x = 100, so growing the original to the right pushes
    // its reflection out to the left.
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(60, 6);
  });

  it('refuses, changing nothing, when there is nothing to take an axis from', () => {
    const empty = emptyDocument('proj');

    expect(mirrorAxisFor(empty.project, [], 'horizontal')).toBeNull();
    expect(mirrorRefusal(empty.project, [])).toMatchObject({ code: 'MIRROR_NO_AXIS' });
  });
});

describe('moving a counterpart', () => {
  it('moves it, and leaves the original alone', () => {
    const before = pair();
    const was = boxOf(before.project, CUT);

    const next = translateFeatures([COPY], { x: 30, y: 10 }).apply(before);

    expect(boxOf(next.project, COPY)).toMatchObject({ minX: 130 });
    expect(boxOf(next.project, COPY).minY).toBeCloseTo(10, 6);
    // Untouched: this is how the gap between a left and a right piece is set.
    expect(boxOf(next.project, CUT)).toEqual(was);
  });

  it('keeps it linked, so the original still reaches it afterwards', () => {
    const moved = translateFeatures([COPY], { x: 30, y: 0 }).apply(pair());

    const next = setShape(CUT, rectShape({ x: 0, y: 0 }, 140, 60)).apply(moved);

    // Still a mirror, still following: the width change reaches it.
    expect(boxOf(next.project, COPY).maxX - boxOf(next.project, COPY).minX).toBeCloseTo(140, 6);
  });

  it('comes back where it started when the move is undone', () => {
    const before = pair();
    const there = translateFeatures([COPY], { x: 30, y: 10 }).apply(before);
    const back = translateFeatures([COPY], { x: -30, y: -10 }).apply(there);

    expect(boxOf(back.project, COPY).minX).toBeCloseTo(boxOf(before.project, COPY).minX, 6);
    expect(boxOf(back.project, COPY).minY).toBeCloseTo(boxOf(before.project, COPY).minY, 6);
  });

  it('moves the pair rigidly when both are dragged together', () => {
    // The case that would be wrong if the counterpart simply re-parameterised:
    // selecting a whole symmetric panel and moving it must not slide its
    // halves apart.
    const before = pair();
    const wasApart = boxOf(before.project, COPY).minX - boxOf(before.project, CUT).minX;

    const next = translateFeatures([CUT, COPY], { x: 25, y: 5 }).apply(before);

    expect(boxOf(next.project, CUT).minX).toBeCloseTo(25, 6);
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(125, 6);
    // Same distance apart, so the assembly is rigid.
    expect(boxOf(next.project, COPY).minX - boxOf(next.project, CUT).minX).toBeCloseTo(wasApart, 6);
  });

  it('moves the counterpart the opposite way when the original moves alone', () => {
    // The behaviour the panel has to explain rather than let the user find:
    // the mirror line is fixed, so the pair opens and closes symmetrically.
    const next = translateFeatures([CUT], { x: 20, y: 0 }).apply(pair());

    expect(boxOf(next.project, CUT).minX).toBeCloseTo(20, 6);
    expect(boxOf(next.project, COPY).minX).toBeCloseTo(80, 6);
  });

  it('turns where it is put, and stays linked', () => {
    const next = transformFeatures(
      [COPY],
      MatOps.fromRotationAround({ x: 150, y: 30 }, Math.PI / 2),
    ).apply(pair());

    const box = boxOf(next.project, COPY);
    // A quarter turn about its own centre: 100 × 60 becomes 60 × 100.
    expect(box.maxX - box.minX).toBeCloseTo(60, 6);
    expect(box.maxY - box.minY).toBeCloseTo(100, 6);
    expect(featureIn(next.project, COPY)!.source.kind).toBe('derived');
  });
});

describe('what a counterpart refuses', () => {
  it('refuses to be scaled, changing nothing, and says whose size it is', () => {
    const before = pair();

    const next = transformFeatures([COPY], MatOps.fromScale(2, 2)).apply(before);

    expect(next.project).toBe(before.project);
    expect(
      refusedTransforms(before.project, [COPY], MatOps.fromScale(2, 2))[0]?.problem,
    ).toMatchObject({
      code: 'MIRROR_WOULD_SCALE',
      facts: { featureId: COPY, sourceName: 'Outline' },
    });
  });

  it('scales the pair when the original is selected too, the counterpart following', () => {
    // Not a refusal: the original takes the scale and its counterpart follows,
    // which is what resizing a whole symmetric panel has to do. Only a
    // counterpart scaled *alone* has nowhere to put the change.
    const before = pair();

    const next = transformFeatures([CUT, COPY], MatOps.fromScale(2, 2)).apply(before);

    expect(next.project).not.toBe(before.project);
    expect(boxOf(next.project, CUT).maxX - boxOf(next.project, CUT).minX).toBeCloseTo(200, 6);
    // Still the same size as its original, because it is still a mirror of it.
    expect(boxOf(next.project, COPY).maxX - boxOf(next.project, COPY).minX).toBeCloseTo(200, 6);
    expect(refusedTransforms(before.project, [CUT, COPY], MatOps.fromScale(2, 2))).toEqual([]);
  });

  it('refuses to be reshaped: it has no shape of its own', () => {
    const before = pair();

    // X3: a derived feature is never silently converted into a drawn one.
    expect(setShape(COPY, rectShape({ x: 0, y: 0 }, 10, 10)).apply(before).project).toBe(
      before.project,
    );
  });

  it('refuses to move while locked, like anything else (S7)', () => {
    const locked = setFeatureLocked(COPY, true).apply(pair());

    expect(translateFeatures([COPY], { x: 10, y: 0 }).apply(locked).project).toBe(locked.project);
  });

  it('still follows its original while locked', () => {
    // Its dependents follow it; it simply cannot change itself.
    const locked = setFeatureLocked(COPY, true).apply(pair());

    const next = setShape(CUT, rectShape({ x: 0, y: 0 }, 140, 60)).apply(locked);

    expect(boxOf(next.project, COPY).minX).toBeCloseTo(60, 6);
  });
});

describe('the axis Mirror ↔ and Mirror ↕ choose (§8)', () => {
  it('runs along the right edge for a horizontal mirror', () => {
    const axis = mirrorAxisFor(panel().project, [CUT], 'horizontal')!;

    expect(axis.origin.x).toBeCloseTo(100, 9);
    // Vertical line: a quarter turn from the x axis.
    expect(Math.abs(Math.cos(axis.angleRad))).toBeCloseTo(0, 9);
  });

  it('runs along the bottom edge for a vertical mirror', () => {
    const next = mirrorFeatures(
      [CUT],
      [COPY],
      mirrorAxisFor(panel().project, [CUT], 'vertical')!,
    ).apply(panel());

    // The panel is 0..60 in y, so its reflection below is -60..0.
    expect(boxOf(next.project, COPY).maxY).toBeCloseTo(0, 6);
    expect(boxOf(next.project, COPY).minY).toBeCloseTo(-60, 6);
  });

  it('measures the world box, not the piece, for rotated geometry', () => {
    // Stated as a test because it is the interpretation §8 chose: "↔" means
    // left-and-right in the drawing, so the axis is world-aligned even when
    // the piece is not. A snug fit on a turned piece is what mirroring across
    // a fold line is for.
    const turned = transformFeatures([CUT], MatOps.fromRotationAround({ x: 50, y: 30 }, 0.4)).apply(
      panel(),
    );
    const box = boxOf(turned.project, CUT);

    const axis = mirrorAxisFor(turned.project, [CUT], 'horizontal')!;

    expect(axis.origin.x).toBeCloseTo(box.maxX, 6);
  });

  it('mirrors a whole chain of features about one axis', () => {
    let document = panel();
    document = addStitchLine(PART, 'stitch-1' as FeatureId, CUT).apply(document);
    document = addStitchHoles(PART, 'holes-1' as FeatureId, 'stitch-1' as FeatureId).apply(
      document,
    );

    const ids = [CUT, 'stitch-1' as FeatureId, 'holes-1' as FeatureId];
    const axis = mirrorAxisFor(document.project, ids, 'horizontal')!;
    const next = mirrorFeatures(ids, ['m-0', 'm-1', 'm-2'] as FeatureId[], axis).apply(document);

    // Each counterpart mirrors its own original, so the holes are the
    // original's holes reflected and the counts match by construction.
    const holes = (id: string) => {
      const entry = evaluate(next.project)
        .parts.flatMap((part) => part.features)
        .find((e) => e.feature.id === id);
      return entry?.ok === true ? entry.holes?.count : undefined;
    };

    expect(holes('m-2')).toBe(holes('holes-1'));
    expect(holes('holes-1')).toBeGreaterThan(20);
  });
});

/**
 * The user's contract, walked end to end.
 *
 * The tests above pin the algebra a piece at a time. This one pins the promise
 * the panel makes: **the counterpart is the original, reflected, placed here.**
 * One panel, one counterpart, and then everything a maker would do to the pair
 * — move it, turn it, resize it, move the counterpart, try to resize the
 * counterpart — each checked against that sentence rather than against a
 * formula.
 */
describe('the contract: the counterpart is the original, reflected, placed here', () => {
  /** A panel with stitching and holes, and a counterpart of each. */
  function stitchedPair(): Document {
    let document = panel();
    document = addStitchLine(PART, 'stitch-1' as FeatureId, CUT).apply(document);
    document = addStitchHoles(PART, 'holes-1' as FeatureId, 'stitch-1' as FeatureId).apply(
      document,
    );

    const ids = [CUT, 'stitch-1' as FeatureId, 'holes-1' as FeatureId];
    return mirrorFeatures(
      ids,
      ['m-cut', 'm-stitch', 'm-holes'] as FeatureId[],
      mirrorAxisFor(document.project, ids, 'horizontal')!,
    ).apply(document);
  }

  /** The mirror transform the counterpart captured, read back from the op. */
  function capturedMirror(project: Project, id: string) {
    const feature = featureIn(project, id)!;
    if (feature.kind === 'text-label' || feature.source.kind !== 'derived') {
      throw new Error('not derived');
    }
    const op = feature.source.op;
    if (op.type !== 'mirror') throw new Error('not a mirror');
    if (op.axis.kind !== 'line') throw new Error('not a captured axis');
    return glideMatrix(op.axis.origin, op.axis.angleRad, op.glideMm);
  }

  /**
   * Whether the counterpart really is its original put through that transform.
   *
   * Compared as geometry rather than as parameters: this is the sentence the
   * panel promises, so it is what the test should ask.
   */
  function isReflectionOf(project: Project, sourceId: string, imageId: string): boolean {
    const expected = PathOps.transform(pathOf(project, sourceId), capturedMirror(project, imageId));
    const a = PathOps.bbox(expected)!;
    const b = PathOps.bbox(pathOf(project, imageId))!;

    return (
      Math.abs(a.minX - b.minX) < 1e-6 &&
      Math.abs(a.maxX - b.maxX) < 1e-6 &&
      Math.abs(a.minY - b.minY) < 1e-6 &&
      Math.abs(a.maxY - b.maxY) < 1e-6 &&
      Math.abs(PathOps.length(expected) - PathOps.length(pathOf(project, imageId))) < 1e-6
    );
  }

  const holeCount = (project: Project, id: string): number | undefined => {
    const entry = evaluate(project)
      .parts.flatMap((part) => part.features)
      .find((e) => e.feature.id === id);
    return entry?.ok === true ? entry.holes?.count : undefined;
  };

  it('holds through a move, a turn and a resize of the original', () => {
    let document = stitchedPair();
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);

    // 3. Move the original.
    document = translateFeatures([CUT], { x: 17, y: -9 }).apply(document);
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);

    // 4. Turn it.
    document = transformFeatures([CUT], MatOps.fromRotationAround({ x: 40, y: 20 }, 0.37)).apply(
      document,
    );
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);

    // 5. Resize it.
    document = setShape(CUT, rectShape({ x: 0, y: 0 }, 137, 42)).apply(document);
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);

    // 6. And the whole chain followed, not only the outline.
    expect(isReflectionOf(document.project, 'stitch-1', 'm-stitch')).toBe(true);
  });

  it('keeps the holes paired through all of it', () => {
    // 7. The property the design exists for: two pieces sewn together have to
    // have the same number of holes, whatever has been done to the original.
    let document = stitchedPair();
    expect(holeCount(document.project, 'm-holes')).toBe(holeCount(document.project, 'holes-1'));
    expect(holeCount(document.project, 'holes-1')).toBeGreaterThan(20);

    for (const change of [
      () => translateFeatures([CUT], { x: 17, y: -9 }),
      () => transformFeatures([CUT], MatOps.fromRotationAround({ x: 40, y: 20 }, 0.37)),
      () => setShape(CUT, rectShape({ x: 0, y: 0 }, 137, 42)),
      () => setShape(CUT, rectShape({ x: 0, y: 0 }, 61, 61)),
    ]) {
      document = change().apply(document);
      expect(holeCount(document.project, 'm-holes')).toBe(holeCount(document.project, 'holes-1'));
    }
  });

  it('stays a valid relationship after the counterpart is moved and turned', () => {
    // 8. The supported manipulation path: the counterpart is placed by hand and
    // is still its original reflected — through the *new* captured transform.
    let document = stitchedPair();

    document = translateFeatures(['m-cut' as FeatureId], { x: 24, y: 11 }).apply(document);
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);

    document = transformFeatures(
      ['m-cut' as FeatureId],
      MatOps.fromRotationAround({ x: 150, y: 30 }, -0.8),
    ).apply(document);
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);

    // Still following: a change to the original still reaches it.
    document = setShape(CUT, rectShape({ x: 0, y: 0 }, 90, 90)).apply(document);
    expect(isReflectionOf(document.project, CUT, 'm-cut')).toBe(true);
  });

  it('refuses to scale or reshape the counterpart, changing nothing', () => {
    // 9. The two gestures a reflection-and-slide has nowhere to put.
    const document = stitchedPair();

    expect(
      transformFeatures(['m-cut' as FeatureId], MatOps.fromScale(1.5, 1.5)).apply(document).project,
    ).toBe(document.project);
    expect(
      setShape('m-cut' as FeatureId, rectShape({ x: 0, y: 0 }, 10, 10)).apply(document).project,
    ).toBe(document.project);
  });

  it('lets the pair overlap when the original outgrows the axis, on purpose', () => {
    // **Protected from later "cleanup".** The axis is captured once and stays
    // put, so growing the original pushes its reflection the other way and the
    // two can cross. That is the fixed-axis rule doing exactly what it says,
    // and it is what keeps the pair predictable — an axis that chased the
    // original's box would move the counterpart by twice as much for reasons
    // nobody could see.
    //
    // Anyone "fixing" this overlap by making the axis track the source will
    // fail here, and should read the design's §8 before deciding it is a bug.
    // The answer for a panel that must *stay* symmetric is mirroring across a
    // fold line (4.8b), whose axis is a thing in the drawing rather than a
    // measurement of it.
    const document = stitchedPair();
    const axisAt = boxOf(document.project, CUT).maxX;

    const grown = setShape(CUT, rectShape({ x: 0, y: 0 }, 160, 60)).apply(document);

    // The original now reaches past where the mirror line was left.
    expect(boxOf(grown.project, CUT).maxX).toBeGreaterThan(axisAt);
    // So its reflection reaches back past the line, and they overlap.
    expect(boxOf(grown.project, 'm-cut').minX).toBeLessThan(axisAt);
    expect(boxOf(grown.project, 'm-cut').minX).toBeLessThan(boxOf(grown.project, CUT).maxX);
    // Concretely: the axis stayed at 100, the original grew to 0..160, so its
    // reflection is 40..200 and the two share 40..160. An axis that tracked the
    // source would have moved to 160 and put the counterpart at 160..320 —
    // which is what the assertions above would catch.
    expect(boxOf(grown.project, 'm-cut').minX).toBeCloseTo(40, 6);
    expect(boxOf(grown.project, 'm-cut').maxX).toBeCloseTo(200, 6);
    // Still a faithful reflection: overlapping is not the same as broken.
    expect(isReflectionOf(grown.project, CUT, 'm-cut')).toBe(true);
  });
});
