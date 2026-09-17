import { MatOps, PathOps, SegmentOps, polyline, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate } from './evaluate.js';
import {
  DEFAULT_SETTINGS,
  type Feature,
  type MeasureKind,
  type Part,
  type Project,
} from './feature.js';
import { dependentsOf, graphProblems } from './graph.js';
import { transformShape } from './transformShape.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

/** A rectangle — a **parametric** shape, whose anchors come from parameters. */
const panel = (width = 100, height = 60, radius = 0): Feature => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width,
      height,
      radii: uniformRadii(radius),
      rotation: 0,
    },
  },
});

/** The same four corners, **drawn** — anchors from corner order, not parameters. */
const drawnPanel = (width = 100, height = 60): Feature => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'path',
    path: polyline(
      [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      true,
    ),
  },
});

const dimension = (measure: MeasureKind, a = 0, b = 1, id = 'dim-1', onto = 'cut-1'): Feature => ({
  ...base(id, 'Dimension'),
  kind: 'measurement',
  source: {
    kind: 'measurement',
    measure,
    a: { kind: 'anchor', featureId: onto, anchor: a },
    b: { kind: 'anchor', featureId: onto, anchor: b },
    offsetMm: 8,
    precision: 1,
  },
});

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const entryOf = (p: Project, id: string) =>
  evaluate(p)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id)!;

/** The number the dimension is showing, read off its generated text. */
const readsAs = (p: Project, id = 'dim-1'): string => {
  const entry = entryOf(p, id);
  if (!entry.ok) throw new Error(entry.problem.code);
  return entry.text?.layout.text ?? '';
};

/** Where the anchors of a resolved feature actually are. */
const anchorPoints = (p: Project, id: string) => {
  const entry = entryOf(p, id);
  if (!entry.ok) throw new Error(entry.problem.code);
  const measure = PathOps.measure(entry.path);
  return entry.anchors.map((at) => {
    if (at === null) return null;
    const found = measure.locate(at);
    return SegmentOps.pointAt(entry.path.segments[found.segmentIndex]!, found.t);
  });
};

describe('a dimension reads the drawing', () => {
  it('measures the distance between two corners', () => {
    // A 100 × 60 rectangle: corner 0 to corner 1 is one short side... whichever
    // pair anchors 0 and 1 are, the value is what the geometry says.
    const p = project(panel(), dimension('aligned'));
    const entry = entryOf(p, 'dim-1');

    expect(entry.ok).toBe(true);
    expect(Number(readsAs(p))).toBeGreaterThan(0);
  });

  it('numbers a rectangle’s corners from the first after the path’s start', () => {
    // Pinned because every test below names a pair, and because it is the
    // durable ordering ADR 0010 promises: a rectangle has these four corners
    // whatever its size or radii.
    const corners = anchorPoints(project(panel(100, 60)), 'cut-1');

    expect(corners).toHaveLength(4);
    expect(corners.map((c) => (c === null ? null : [Math.round(c.x), Math.round(c.y)]))).toEqual([
      [100, 0],
      [100, 60],
      [0, 60],
      [0, 0],
    ]);
  });

  it('reads |Δx| horizontally and |Δy| vertically', () => {
    // Corners 0 and 1 are (100, 0) and (100, 60): the same x, 60 apart in y.
    expect(Number(readsAs(project(panel(100, 60), dimension('horizontal', 0, 1))))).toBeCloseTo(
      0,
      6,
    );
    expect(Number(readsAs(project(panel(100, 60), dimension('vertical', 0, 1))))).toBeCloseTo(
      60,
      6,
    );
    // And 1 to 2 is the 100 mm side, the other way round.
    expect(Number(readsAs(project(panel(100, 60), dimension('horizontal', 1, 2))))).toBeCloseTo(
      100,
      6,
    );
  });

  it('shows the value at the precision it was given', () => {
    const one = project(panel(95.44, 60), dimension('horizontal', 1, 2));
    const zero = project(panel(95.44, 60), {
      ...dimension('horizontal', 0, 1),
      source: {
        kind: 'measurement',
        measure: 'horizontal',
        a: { kind: 'anchor', featureId: 'cut-1', anchor: 1 },
        b: { kind: 'anchor', featureId: 'cut-1', anchor: 2 },
        offsetMm: 8,
        precision: 0,
      },
    } as Feature);

    expect(readsAs(one)).toBe('95.4');
    expect(readsAs(zero)).toBe('95');
  });

  it('stores no value: the number is read on every evaluation (X6)', () => {
    const feature = dimension('horizontal');

    expect(JSON.stringify(feature)).not.toContain('100');
  });

  it('draws a dimension line with two extension lines', () => {
    const entry = entryOf(project(panel(), dimension('horizontal')), 'dim-1');
    if (!entry.ok) throw new Error('did not resolve');

    expect(entry.path.segments).toHaveLength(3);
    expect(entry.path.closed).toBe(false);
    expect(entry.role).toBe('annotation');
  });

  it('offers no anchors of its own: nothing measures a measurement', () => {
    const entry = entryOf(project(panel(), dimension('horizontal')), 'dim-1');

    expect(entry.ok === true && entry.anchors).toEqual([]);
  });
});

describe('the number follows the geometry', () => {
  it('changes when the shape is resized', () => {
    const before = readsAs(project(panel(100, 60), dimension('horizontal', 1, 2)));
    const after = readsAs(project(panel(140, 60), dimension('horizontal', 1, 2)));

    expect(before).not.toBe(after);
    expect(Number(after) - Number(before)).toBeCloseTo(40, 1);
  });

  it('is unchanged by moving the shape, because a length is not a position', () => {
    const here = project(panel(100, 60), dimension('aligned', 0, 1));
    const moved = project(
      {
        ...panel(100, 60),
        source: {
          kind: 'shape',
          shape: {
            type: 'rect',
            origin: { x: 37, y: -12 },
            width: 100,
            height: 60,
            radii: uniformRadii(0),
            rotation: 0,
          },
        },
      } as Feature,
      dimension('aligned', 0, 1),
    );

    expect(readsAs(moved)).toBe(readsAs(here));
  });

  it('survives a change of corner radii, which moves every segment', () => {
    // The durability anchors were built for: a rectangle has four corners
    // whatever its radii, so the dimension still names the same two.
    const square = readsAs(project(panel(100, 60, 0), dimension('aligned', 0, 1)));
    const rounded = readsAs(project(panel(100, 60, 12), dimension('aligned', 0, 1)));

    expect(Number(rounded)).toBeGreaterThan(0);
    expect(Number(square)).toBeGreaterThan(0);
  });
});

describe('the two reference cases', () => {
  /**
   * Both kinds of anchor must work, and their durability differs — a
   * difference the implementation must not paper over.
   */
  it('works on a parametric shape', () => {
    expect(entryOf(project(panel(), dimension('aligned')), 'dim-1').ok).toBe(true);
  });

  it('works on a drawn path', () => {
    expect(entryOf(project(drawnPanel(), dimension('aligned')), 'dim-1').ok).toBe(true);
  });

  it('reads the same number on either, for the same rectangle', () => {
    const parametric = readsAs(project(panel(100, 60), dimension('vertical', 0, 1)));
    const drawn = readsAs(project(drawnPanel(100, 60), dimension('vertical', 0, 1)));

    expect(drawn).toBe(parametric);
  });

  it('follows a parametric shape through a rotation', () => {
    const turned = transformShape(
      {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width: 100,
        height: 60,
        radii: uniformRadii(0),
        rotation: 0,
      },
      MatOps.fromRotationAround({ x: 50, y: 30 }, 0.4),
    );
    if (!turned.ok) throw new Error('could not turn it');

    const p = project(
      { ...panel(), source: { kind: 'shape', shape: turned.value } } as Feature,
      dimension('aligned', 0, 1),
    );

    // An aligned dimension measures the side, which a rotation does not change.
    expect(Number(readsAs(p))).toBeCloseTo(
      Number(readsAs(project(panel(100, 60), dimension('aligned', 0, 1)))),
      6,
    );
  });
});

describe('when a reference goes', () => {
  it('fails with ANCHOR_MISSING rather than sliding to a neighbour (E4)', () => {
    // A circle has no corners, so anchor 0 is not there to name.
    const round: Feature = {
      ...base('cut-1', 'Outline'),
      kind: 'cut-contour',
      role: 'outer',
      source: { kind: 'shape', shape: { type: 'circle', centre: { x: 50, y: 30 }, radius: 30 } },
    };

    const entry = entryOf(project(round, dimension('aligned')), 'dim-1');

    expect(entry.ok).toBe(false);
    expect(entry.ok === false && entry.problem.code).toBe('ANCHOR_MISSING');
  });

  it('fails when the feature it names is gone', () => {
    const entry = entryOf(project(dimension('aligned', 0, 1, 'dim-1', 'nobody')), 'dim-1');

    expect(entry.ok === false && entry.problem.code).toBe('MEASURE_REF_MISSING');
  });

  it('is refused by the loader’s graph check too (S2)', () => {
    const codes = graphProblems(project(dimension('aligned', 0, 1, 'dim-1', 'nobody'))).map(
      (problem) => problem.code,
    );

    expect(codes).toContain('MEASURE_REF_MISSING');
  });

  it('counts as a dependent, so deleting what it measures shows it', () => {
    expect(dependentsOf(project(panel(), dimension('aligned')), ['cut-1'])).toEqual(['dim-1']);
  });

  it('says nothing when both ends are there', () => {
    expect(graphProblems(project(panel(), dimension('aligned')))).toEqual([]);
  });
});

describe('the value, whatever the rectangle', () => {
  it('equals the distance between the corners it names', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.double({ min: 10, max: 400, noNaN: true }),
        (width, height) => {
          const p = project(panel(width, height), {
            ...dimension('aligned', 0, 1),
            source: {
              kind: 'measurement',
              measure: 'aligned',
              a: { kind: 'anchor', featureId: 'cut-1', anchor: 0 },
              b: { kind: 'anchor', featureId: 'cut-1', anchor: 1 },
              offsetMm: 8,
              precision: 2,
            },
          } as Feature);

          const points = anchorPoints(p, 'cut-1');
          if (points[0] === null || points[1] === null) return true;

          const entry = entryOf(p, 'dim-1');
          if (!entry.ok) return false;

          // Corners 0 and 1 are the ends of the right-hand side, so an
          // aligned dimension between them is the rectangle's height.
          return Math.abs(Number(readsAs(p)) - height) < 0.02;
        },
      ),
    );
  });
});
