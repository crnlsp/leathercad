import type { Ulid } from '@leathercad/core';
import { evaluate, pathForShape, type Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addStitchLine,
  addTextLabel,
  circleShape,
  emptyDocument,
  flipFeatures,
  flipRefusal,
  rectShape,
  rectanglePart,
  refusedTransforms,
  shapePart,
} from './commands.js';
import { DocumentStore } from './store.js';

const PANEL = 'part-1' as Ulid;

/** A 100 × 60 panel at (10, 20), with one rounded corner at its bottom left. */
function storeWithPanel() {
  const store = new DocumentStore(emptyDocument('doc' as Ulid));
  const shape = {
    ...rectShape({ x: 10, y: 20 }, 100, 60),
    radii: { bottomLeft: 8, bottomRight: 0, topLeft: 0, topRight: 0 },
  };
  store.dispatch({
    label: 'Add part',
    apply: (document) => ({
      project: {
        ...document.project,
        parts: [rectanglePart(PANEL, 'feat-0' as Ulid, 'Panel', shape)],
      },
    }),
  });
  return store;
}

const shapeOf = (project: Project) => {
  const feature = project.parts[0]!.features[0]!;
  if (feature.source.kind !== 'shape' || feature.source.shape.type !== 'rect') {
    throw new Error('expected a rectangle');
  }
  return feature.source.shape;
};

const boundsOf = (project: Project) => PathOps.bbox(pathForShape(shapeOf(project)))!;

describe('flipFeatures, corner by corner', () => {
  /** A panel at (10, 20), 100 × 60, with every corner a different radius. */
  function storeWithFourRadii() {
    const store = new DocumentStore(emptyDocument('doc' as Ulid));
    const shape = {
      ...rectShape({ x: 10, y: 20 }, 100, 60),
      radii: { bottomLeft: 2, bottomRight: 4, topLeft: 6, topRight: 8 },
    };
    store.dispatch({
      label: 'Add part',
      apply: (document) => ({
        project: {
          ...document.project,
          parts: [rectanglePart(PANEL, 'feat-0' as Ulid, 'Panel', shape)],
        },
      }),
    });
    return store;
  }

  const CORNERS = {
    bottomLeft: { x: 10, y: 20 },
    bottomRight: { x: 110, y: 20 },
    topLeft: { x: 10, y: 80 },
    topRight: { x: 110, y: 80 },
  } as const;

  /**
   * The radius of the corner arc nearest a place on the page.
   *
   * Asked of the drawn path rather than of the radii record, so this checks
   * where each corner actually **is** after the flip. Asserting the record
   * would only restate the mapping the code already chose.
   */
  function radiusAt(project: Project, corner: { x: number; y: number }): number {
    let nearest = Number.POSITIVE_INFINITY;
    let radius = Number.NaN;

    for (const segment of pathForShape(shapeOf(project)).segments) {
      if (segment.kind !== 'arc') continue;
      const distance = Math.hypot(segment.centre.x - corner.x, segment.centre.y - corner.y);
      if (distance < nearest) {
        nearest = distance;
        radius = segment.radius;
      }
    }
    return radius;
  }

  it('starts with each radius on its own corner', () => {
    const project = storeWithFourRadii().getState().document.project;

    expect(radiusAt(project, CORNERS.bottomLeft)).toBeCloseTo(2, 9);
    expect(radiusAt(project, CORNERS.bottomRight)).toBeCloseTo(4, 9);
    expect(radiusAt(project, CORNERS.topLeft)).toBeCloseTo(6, 9);
    expect(radiusAt(project, CORNERS.topRight)).toBeCloseTo(8, 9);
  });

  it('sends each radius across the vertical axis, to the corner facing it', () => {
    // 2/4/6/8, all different, so a mapping that merely preserved the set — or
    // sent them diagonally, which is what the defect did — cannot pass.
    const store = storeWithFourRadii();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));
    const project = store.getState().document.project;

    expect(radiusAt(project, CORNERS.bottomRight)).toBeCloseTo(2, 9);
    expect(radiusAt(project, CORNERS.bottomLeft)).toBeCloseTo(4, 9);
    expect(radiusAt(project, CORNERS.topRight)).toBeCloseTo(6, 9);
    expect(radiusAt(project, CORNERS.topLeft)).toBeCloseTo(8, 9);
  });

  it('sends each radius across the horizontal axis, to the corner above or below it', () => {
    const store = storeWithFourRadii();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'vertical'));
    const project = store.getState().document.project;

    expect(radiusAt(project, CORNERS.topLeft)).toBeCloseTo(2, 9);
    expect(radiusAt(project, CORNERS.topRight)).toBeCloseTo(4, 9);
    expect(radiusAt(project, CORNERS.bottomLeft)).toBeCloseTo(6, 9);
    expect(radiusAt(project, CORNERS.bottomRight)).toBeCloseTo(8, 9);
  });

  it('puts all four back where they started when flipped twice', () => {
    const store = storeWithFourRadii();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));
    const project = store.getState().document.project;

    expect(shapeOf(project).radii).toEqual({
      bottomLeft: 2,
      bottomRight: 4,
      topLeft: 6,
      topRight: 8,
    });
  });
});

describe('flipFeatures', () => {
  it('mirrors a panel about its own centre, leaving it where it was', () => {
    const store = storeWithPanel();
    const before = boundsOf(store.getState().document.project);

    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));
    const after = boundsOf(store.getState().document.project);

    // A flip is not a move: the piece stays on its own footprint.
    expect(after.minX).toBeCloseTo(before.minX, 9);
    expect(after.maxX).toBeCloseTo(before.maxX, 9);
    expect(after.minY).toBeCloseTo(before.minY, 9);
    expect(after.maxY).toBeCloseTo(before.maxY, 9);
  });

  it('takes the rounded corner to the other side', () => {
    // Defect D2 in the form a user meets it: before the fix the corner ended
    // up diagonally opposite, and the panel stayed the same way round.
    const store = storeWithPanel();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));

    expect(shapeOf(store.getState().document.project).radii).toEqual({
      bottomLeft: 0,
      bottomRight: 8,
      topLeft: 0,
      topRight: 0,
    });
  });

  it('takes it to the top when flipped the other way', () => {
    const store = storeWithPanel();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'vertical'));

    expect(shapeOf(store.getState().document.project).radii).toEqual({
      bottomLeft: 0,
      bottomRight: 0,
      topLeft: 8,
      topRight: 0,
    });
  });

  it('leaves the panel lying the way it was, not turned half round', () => {
    const store = storeWithPanel();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));

    // Either parameterisation draws the same rectangle, but the one a person
    // expects keeps the rotation they set.
    expect(shapeOf(store.getState().document.project).rotation).toBeCloseTo(0, 9);
  });

  it.each(['horizontal', 'vertical'] as const)(
    'comes back to exactly where it started when flipped twice, %s',
    (axis) => {
      const store = storeWithPanel();
      const before = shapeOf(store.getState().document.project);

      store.dispatch(flipFeatures(['feat-0' as Ulid], axis));
      store.dispatch(flipFeatures(['feat-0' as Ulid], axis));
      const after = shapeOf(store.getState().document.project);

      expect(after.origin.x).toBeCloseTo(before.origin.x, 9);
      expect(after.origin.y).toBeCloseTo(before.origin.y, 9);
      expect(after.width).toBeCloseTo(before.width, 9);
      expect(after.height).toBeCloseTo(before.height, 9);
      expect(after.rotation).toBeCloseTo(before.rotation, 9);
      expect(after.radii).toEqual(before.radii);
    },
  );

  it.each(['horizontal', 'vertical'] as const)('keeps the panel the size it was, %s', (axis) => {
    const store = storeWithPanel();
    const before = shapeOf(store.getState().document.project);

    store.dispatch(flipFeatures(['feat-0' as Ulid], axis));
    const after = shapeOf(store.getState().document.project);

    expect(after.width).toBeCloseTo(before.width, 9);
    expect(after.height).toBeCloseTo(before.height, 9);
    // The same four radii, moved rather than resized or lost.
    expect(Object.values(after.radii).sort()).toEqual(Object.values(before.radii).sort());
  });

  it.each(['horizontal', 'vertical'] as const)(
    'leaves a turned panel turned the way it was, %s',
    (axis) => {
      // A panel at 30° mirrored across a vertical axis lies at −30°: the same
      // amount of turn, the other way. What it must never do is acquire a half
      // turn on top, which is how the defect looked from the panel.
      const store = storeWithPanel();
      store.dispatch({
        label: 'Turn it',
        apply: (document) => ({
          project: {
            ...document.project,
            parts: document.project.parts.map((part) => ({
              ...part,
              features: part.features.map((feature) =>
                feature.kind === 'cut-contour' && feature.source.kind === 'shape'
                  ? {
                      ...feature,
                      source: {
                        kind: 'shape' as const,
                        shape: { ...feature.source.shape, rotation: Math.PI / 6 },
                      },
                    }
                  : feature,
              ),
            })),
          },
        }),
      });

      store.dispatch(flipFeatures(['feat-0' as Ulid], axis));
      const turn = shapeOf(store.getState().document.project).rotation;

      expect(Math.abs(turn)).toBeCloseTo(Math.PI / 6, 9);
      // Within a quarter turn of where it was: no unintended half turn.
      expect(Math.abs(turn - Math.PI / 6)).toBeLessThan(Math.PI / 2);
    },
  );

  it('records one undoable step, named for what it did', () => {
    const store = storeWithPanel();
    store.dispatch(flipFeatures(['feat-0' as Ulid], 'horizontal'));

    expect(store.getState().undoLabel).toBe('Flip horizontal');
    store.undo();
    expect(shapeOf(store.getState().document.project).radii.bottomLeft).toBe(8);
  });

  it('changes nothing when nothing named has any geometry', () => {
    const store = storeWithPanel();
    const before = store.getState().document;

    store.dispatch(flipFeatures(['nothing-here' as Ulid], 'horizontal'));

    expect(store.getState().document).toBe(before);
  });

  it('refuses a derived feature, which follows its source instead', () => {
    const store = storeWithPanel();
    store.dispatch(addStitchLine(PANEL, 'stitch-1' as Ulid, 'feat-0' as Ulid, 3.5));
    const project = store.getState().document.project;

    const refused = refusedTransforms(
      project,
      ['stitch-1' as Ulid],
      // The same mirror the command would build for this selection.
      { a: -1, b: 0, c: 0, d: 1, e: 120, f: 0 },
    );

    expect(refused[0]?.problem.code).toBe('DERIVED_MOVED_ALONE');
  });

  it('refuses a label rather than quietly turning it round, and changes nothing', () => {
    const store = new DocumentStore(emptyDocument('doc' as Ulid));
    store.dispatch({
      label: 'Add part',
      apply: (document) => ({
        project: {
          ...document.project,
          parts: [shapePart(PANEL, 'feat-0' as Ulid, 'Disc', circleShape({ x: 0, y: 0 }, 20))],
        },
      }),
    });
    store.dispatch(addTextLabel(PANEL, 'label-1' as Ulid, { x: 0, y: 0 }, 'Glue here'));
    const project = store.getState().document.project;

    const refused = refusedTransforms(project, ['label-1' as Ulid], {
      a: -1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    });

    // Mirrored text reads backwards. A mirror is a similarity, so without this
    // it would have slipped through and come out rotated — the words the right
    // way round in the wrong place.
    expect(refused[0]?.problem.code).toBe('TEXT_WOULD_READ_BACKWARDS');

    // The same answer through the query the panel asks before offering the
    // gesture at all — one check, not two that could disagree (X1).
    expect(flipRefusal(project, ['label-1' as Ulid], 'horizontal')).toEqual({
      code: 'TEXT_WOULD_READ_BACKWARDS',
      facts: {},
    });
    expect(flipRefusal(project, ['label-1' as Ulid], 'vertical')?.code).toBe(
      'TEXT_WOULD_READ_BACKWARDS',
    );

    const before = store.getState().document;
    store.dispatch(flipFeatures(['label-1' as Ulid], 'horizontal'));

    // Identity: the label is untouched, down to the object — and a refusal
    // that changed nothing leaves nothing in the undo history either.
    expect(store.getState().document).toBe(before);
    expect(store.getState().undoLabel).not.toBe('Flip horizontal');

    const label = store
      .getState()
      .document.project.parts[0]!.features.find((f) => f.kind === 'text-label');
    expect(label?.source.kind === 'text' && label.source.rotationRad).toBe(0);
    expect(label?.source.kind === 'text' && label.source.text).toBe('Glue here');
  });

  it('offers no refusal for a panel, which can be flipped', () => {
    const store = storeWithPanel();

    expect(
      flipRefusal(store.getState().document.project, ['feat-0' as Ulid], 'horizontal'),
    ).toBeNull();
  });

  it('explains a derived feature through the same query, and changes nothing', () => {
    const store = storeWithPanel();
    store.dispatch(addStitchLine(PANEL, 'stitch-1' as Ulid, 'feat-0' as Ulid, 3.5));
    const project = store.getState().document.project;

    expect(flipRefusal(project, ['stitch-1' as Ulid], 'horizontal')?.code).toBe(
      'DERIVED_MOVED_ALONE',
    );

    const before = store.getState().document;
    store.dispatch(flipFeatures(['stitch-1' as Ulid], 'horizontal'));
    expect(store.getState().document).toBe(before);
  });

  it('flips a group about the group’s centre, not each piece’s own', () => {
    const store = storeWithPanel();
    store.dispatch({
      label: 'Add second part',
      apply: (document) => ({
        project: {
          ...document.project,
          parts: [
            ...document.project.parts,
            rectanglePart(
              'part-2' as Ulid,
              'feat-1' as Ulid,
              'Far',
              rectShape({ x: 200, y: 20 }, 40, 60),
            ),
          ],
        },
      }),
    });

    store.dispatch(flipFeatures(['feat-0' as Ulid, 'feat-1' as Ulid], 'horizontal'));
    const project = store.getState().document.project;
    const near = PathOps.bbox(
      pathForShape(
        (project.parts[0]!.features[0]!.source as { shape: Parameters<typeof pathForShape>[0] })
          .shape,
      ),
    )!;

    // The pieces swap sides: the left one is now on the right.
    expect(near.minX).toBeGreaterThan(100);
    expect(evaluate(project).parts).toHaveLength(2);
  });
});
