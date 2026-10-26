import {
  MatOps,
  PathOps,
  SegmentOps,
  arc,
  closed,
  line,
  polyline,
  uniformRadii,
} from '@leathercad/geometry';
import { FONT } from '@leathercad/typography';
import { EPS_ANGLE, EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate } from './evaluate.js';
import {
  DEFAULT_SETTINGS,
  type Feature,
  type ExtentRef,
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
const withPrecision2 = (f: Feature): Feature =>
  ({ ...f, source: { ...f.source, precision: 2 } }) as Feature;

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

describe('a dimension to a rounded rectangle, at any radius (ADR 0010)', () => {
  const withPrecision = (f: Feature, precision: 0 | 1 | 2): Feature =>
    ({ ...f, source: { ...f.source, precision } }) as Feature;

  it('resolves on a square rounded all the way to a circle', () => {
    // Its corners are the middles of its four roundings: the top two are
    // 10 / √2 apart, and opposite ones a diameter.
    const circle = panel(10, 10, 5);

    expect(readsAs(project(circle, dimension('horizontal', 1, 2)))).toBe('7.1');
    expect(readsAs(project(circle, dimension('aligned', 0, 2)))).toBe('10.0');
  });

  it('reads between the middles of the roundings, from none up to a full one', () => {
    // What a corner anchor has always measured to (Q15 keeps it): the width
    // less 2·r·(1 − 1/√2), as the radius grows to half the shorter side.
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.oneof(fc.constant(0), fc.constant(0.5), fc.double({ min: 0, max: 0.5, noNaN: true })),
        (width, height, share) => {
          const radius = share * Math.min(width, height);
          const p = project(
            panel(width, height, radius),
            withPrecision(dimension('horizontal', 1, 2), 2),
          );
          const expected = width - 2 * radius * (1 - Math.SQRT1_2);
          return Math.abs(Number(readsAs(p)) - expected) <= 0.005 + 1e-9;
        },
      ),
    );
  });
});

/** A corner of what it measures' bounding box on the sheet. */
const extent = (x: 'min' | 'max', y: 'min' | 'max', featureId = 'cut-1'): ExtentRef => ({
  kind: 'extent',
  featureId,
  x,
  y,
});
/** The overall width, above the piece, or the overall height, left of it. */
const overall = (axis: 'width' | 'height', of = 'cut-1', precision: 0 | 1 | 2 = 1): Feature => ({
  ...base(`overall-${axis}`, 'Dimension'),
  kind: 'measurement',
  source: {
    kind: 'measurement',
    ...(axis === 'width'
      ? { measure: 'horizontal', a: extent('min', 'max', of), b: extent('max', 'max', of) }
      : { measure: 'vertical', a: extent('min', 'min', of), b: extent('min', 'max', of) }),
    offsetMm: 8,
    precision,
  },
});

describe('an overall dimension reads the piece’s size (Q15)', () => {
  const width = (...features: Feature[]) => readsAs(project(...features), 'overall-width');
  const height = (...features: Feature[]) => readsAs(project(...features), 'overall-height');

  /** A 90 × 60 drawn stitch line, and an outline grown `distanceMm` out from it. */
  const seam: Feature = {
    ...base('seam-1', 'Stitch line'),
    kind: 'stitch-line',
    source: {
      kind: 'path',
      path: polyline(
        [
          { x: 0, y: 0 },
          { x: 90, y: 0 },
          { x: 90, y: 60 },
          { x: 0, y: 60 },
        ],
        true,
      ),
    },
  };
  const allowance = (distanceMm: number): Feature => ({
    ...base('cut-1', 'Outline'),
    kind: 'cut-contour',
    role: 'outer',
    source: {
      kind: 'derived',
      sourceId: 'seam-1',
      op: { type: 'offset', distanceMm, side: 'outward', run: { kind: 'whole' } },
    },
  });

  it('reads a 97 × 67 panel rounded at 5 mm as 97 × 67', () => {
    expect(width(panel(97, 67, 5), overall('width'))).toBe('97.0');
    expect(height(panel(97, 67, 5), overall('height'))).toBe('67.0');
  });

  it('reads the band a 3.5 mm seam allowance grows round a 90 × 60 stitch line as 97 × 67', () => {
    // The allowance rounds every corner at its own width; its outline is still
    // 97 × 67 across, which is the leather to cut.
    expect(width(seam, allowance(3.5), overall('width'))).toBe('97.0');
    expect(height(seam, allowance(3.5), overall('height'))).toBe('67.0');
  });

  it('leaves a dimension between two corners reading what it always did', () => {
    // The finding was right about the number and wrong about the fix: the
    // middles of two 5 mm roundings are 94.1 apart, and an existing dimension
    // between them keeps saying so. The piece's size is asked for, not
    // inferred.
    expect(readsAs(project(panel(97, 67, 5), dimension('horizontal', 1, 2)))).toBe('94.1');
    expect(readsAs(project(seam, allowance(3.5), dimension('horizontal', 1, 2)))).toBe('94.9');
  });

  it('starts its extension lines at the corners of the piece’s box', () => {
    const entry = entryOf(project(panel(97, 67, 5), overall('width')), 'overall-width');
    if (!entry.ok) throw new Error(entry.problem.code);
    const [from, , to] = entry.path.segments;

    expect(SegmentOps.start(from!)).toEqual({ x: 0, y: 67 });
    expect(SegmentOps.end(to!)).toEqual({ x: 97, y: 67 });
  });

  it('reads the outline’s extent on the sheet, whatever its size, rounding and turn', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.oneof(fc.constant(0), fc.constant(0.5), fc.double({ min: 0, max: 0.5, noNaN: true })),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (w, h, share, turn) => {
          const outline: Feature = {
            ...panel(),
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin: { x: 0, y: 0 },
                width: w,
                height: h,
                radii: uniformRadii(share * Math.min(w, h)),
                rotation: turn,
              },
            },
          } as Feature;
          const drawn = entryOf(project(outline), 'cut-1');
          if (!drawn.ok) return false;
          const box = PathOps.bbox(drawn.path)!;
          const read = (axis: 'width' | 'height') =>
            Number(readsAs(project(outline, overall(axis, 'cut-1', 2)), `overall-${axis}`));
          return (
            Math.abs(read('width') - (box.maxX - box.minX)) <= 0.005 + 1e-9 &&
            Math.abs(read('height') - (box.maxY - box.minY)) <= 0.005 + 1e-9
          );
        },
      ),
    );
  });

  it('reads an unturned rounded rectangle as its width and height at any radius', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.oneof(fc.constant(0), fc.constant(0.5), fc.double({ min: 0, max: 0.5, noNaN: true })),
        (w, h, share) => {
          const outline = panel(w, h, share * Math.min(w, h));
          return (
            Math.abs(Number(width(outline, overall('width', 'cut-1', 2))) - w) <= 0.005 + 1e-9 &&
            Math.abs(Number(height(outline, overall('height', 'cut-1', 2))) - h) <= 0.005 + 1e-9
          );
        },
      ),
    );
  });

  it('follows the piece when it is resized, as every dimension does', () => {
    expect(width(panel(97, 67, 5), overall('width'))).toBe('97.0');
    expect(width(panel(120, 67, 5), overall('width'))).toBe('120.0');
  });

  it('reads a strap with a round end to the tip of the end', () => {
    // A half-turn end has no corner: the strap is 60 long, to the end of its
    // rounding.
    const strap: Feature = {
      ...base('cut-1', 'Strap'),
      kind: 'cut-contour',
      role: 'outer',
      source: {
        kind: 'path',
        path: closed([
          line({ x: 0, y: 0 }, { x: 50, y: 0 }),
          arc({ x: 50, y: 10 }, 10, -Math.PI / 2, Math.PI),
          line({ x: 50, y: 20 }, { x: 0, y: 20 }),
          line({ x: 0, y: 20 }, { x: 0, y: 0 }),
        ]),
      },
    };

    expect(width(strap, overall('width'))).toBe('60.0');
    expect(height(strap, overall('height'))).toBe('20.0');
  });

  it('measures nothing when what it names is not in the drawing', () => {
    const entry = entryOf(project(overall('width', 'nobody')), 'overall-width');

    expect(entry.ok === false && entry.problem.code).toBe('MEASURE_REF_MISSING');
  });
});

describe('a rounding near a half turn (Q15)', () => {
  /**
   * A hairpin: a straight, a rounding of `sweep` tangent to it, a straight on
   * from the rounding's end, and back to the start. Anchors: the rounding's
   * middle, and the two sharp corners.
   */
  function hairpin(sweep: number): Feature {
    const radius = 5;
    const rounding = arc({ x: 50, y: radius }, radius, -Math.PI / 2, sweep);
    const end = SegmentOps.end(rounding);
    const onward = SegmentOps.tangentAt(rounding, 1);
    const far = { x: end.x + onward.x * 40, y: end.y + onward.y * 40 };
    return {
      ...base('cut-1', 'Outline'),
      kind: 'cut-contour',
      role: 'outer',
      source: {
        kind: 'path',
        path: closed([
          line({ x: 0, y: 0 }, { x: 50, y: 0 }),
          rounding,
          line(end, far),
          line(far, { x: 0, y: 0 }),
        ]),
      },
    };
  }
  const outline = (f: Feature) => {
    const entry = entryOf(project(f), 'cut-1');
    if (!entry.ok) throw new Error(entry.problem.code);
    return entry.path;
  };
  const turns = fc.oneof(
    fc.constantFrom(Math.PI - 0.5, Math.PI - 1e-3, Math.PI - 1e-6, Math.PI - EPS_ANGLE, Math.PI),
    fc.double({ min: Math.PI - 0.5, max: Math.PI, noNaN: true }),
    // Past a half turn: the straights either side would meet behind it.
    fc.double({ min: Math.PI, max: 1.5 * Math.PI, noNaN: true }),
  );

  it('measures to the middle of the rounding, a point on the leather, however near a half turn', () => {
    // Nothing is measured to where the two straights would meet: as the
    // rounding nears a half turn that point runs off towards infinity, and
    // past one it is behind the piece. The anchor is on the outline itself.
    fc.assert(
      fc.property(turns, (sweep) => {
        const piece = hairpin(sweep);
        const box = PathOps.bbox(outline(piece))!;
        const p = project(piece, withPrecision2(dimension('aligned', 0, 1)));
        const entry = entryOf(p, 'dim-1');
        if (!entry.ok) return false;
        const start = SegmentOps.start(entry.path.segments[0]!);
        const middle = SegmentOps.pointAt(outline(piece).segments[1]!, 0.5);
        return (
          Math.hypot(start.x - middle.x, start.y - middle.y) <= EPS_POINT &&
          start.x >= box.minX - EPS_POINT &&
          start.x <= box.maxX + EPS_POINT &&
          Number.isFinite(Number(readsAs(p)))
        );
      }),
    );
  });

  it('reads the overall size as the outline’s own box, never past it', () => {
    fc.assert(
      fc.property(turns, (sweep) => {
        const piece = hairpin(sweep);
        const box = PathOps.bbox(outline(piece))!;
        const read = (axis: 'width' | 'height') =>
          Number(readsAs(project(piece, overall(axis, 'cut-1', 2)), `overall-${axis}`));
        return (
          Math.abs(read('width') - (box.maxX - box.minX)) <= 0.005 + 1e-9 &&
          Math.abs(read('height') - (box.maxY - box.minY)) <= 0.005 + 1e-9
        );
      }),
    );
  });

  it('reads a hairpin a millionth of a radian short of a half turn as 55 long', () => {
    // 50 of straight and a 5 mm rounding, whose tip is 55 from the start; the
    // meeting of its straights would be about 10 km away.
    expect(readsAs(project(hairpin(Math.PI - 1e-6), overall('width')), 'overall-width')).toBe(
      '55.0',
    );
  });
});

describe('the number on paper breaks the dimension line (4.10b)', () => {
  it('sits centred on the line, turned along it, its figures across it', () => {
    const entry = entryOf(project(panel(100, 60), dimension('horizontal', 1, 2)), 'dim-1');
    if (!entry.ok || entry.text === undefined) throw new Error('did not resolve');

    const lineSegment = entry.path.segments[1]!;
    const middle = SegmentOps.pointAt(lineSegment, 0.5);
    const { origin, rotationRad, layout } = entry.text;
    // Back into the run's own frame: along it from its left end, and up from
    // its baseline.
    const d = { x: middle.x - origin.x, y: middle.y - origin.y };
    const alongRun = d.x * Math.cos(rotationRad) + d.y * Math.sin(rotationRad);
    const upRun = -d.x * Math.sin(rotationRad) + d.y * Math.cos(rotationRad);
    const capital = (FONT.capHeight / FONT.unitsPerEm) * layout.sizeMm;

    expect(alongRun).toBeCloseTo(layout.widthMm / 2, 9);
    expect(upRun).toBeCloseTo(capital / 2, 9);
  });
});
