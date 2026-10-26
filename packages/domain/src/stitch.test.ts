import { PathOps, Shapes, offsetPath, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MIN_PITCH_MM, distributeHoles } from './stitch.js';
import type { Derivation } from './feature.js';

type HoleOp = Omit<Extract<Derivation, { type: 'stitch-holes' }>, 'type'>;

/** A stitch line: a rounded rectangle, inset. */
function rectStitchLine(w: number, h: number, radius: number, insetMm: number) {
  const outline = Shapes.roundedRect({ x: 0, y: 0 }, w, h, uniformRadii(radius));
  const [inset] = offsetPath(outline, insetMm, { join: 'round' });
  if (inset === undefined) throw new Error('the fixture itself collapsed');
  return inset;
}

const straightRun = (mm: number) =>
  PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: mm, y: 0 },
    ],
    false,
  );

const holesOn = (path: Parameters<typeof distributeHoles>[0], op: HoleOp) =>
  distributeHoles(path, op);

const CONTINUOUS: HoleOp = { pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' };
const AT_CORNERS: HoleOp = { pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' };

describe('stitch holes', () => {
  it('distributes a whole number of holes round a closed line', () => {
    const line = rectStitchLine(105, 75, 8, 3.5);
    const holes = holesOn(line, CONTINUOUS);

    expect(holes.count).toBeGreaterThan(80);
    // fit-whole divides the run into whole intervals, so the achieved spacing
    // is the perimeter over the count — no leftover gap at the join.
    expect(holes.achievedPitchMm).toBeCloseTo(PathOps.length(line) / holes.count, 6);
  });

  it('reports the spacing it achieved, not the pitch it was asked for', () => {
    const holes = holesOn(rectStitchLine(100, 100, 0, 3.5), CONTINUOUS);

    expect(holes.achievedPitchMm).not.toBe(3.85);
    expect(Math.abs(holes.achievedPitchMm - 3.85)).toBeLessThan(3.85 / 2);
  });

  it('puts a hole exactly on each corner, without doubling it', () => {
    const holes = holesOn(rectStitchLine(100, 60, 0, 3.5), AT_CORNERS);

    // Four runs, four shared corner points, each appearing once. A doubled
    // corner hole is invisible until someone punches it.
    expect(holes.runs).toHaveLength(4);
    const gaps: number[] = [];
    for (let i = 1; i < holes.holes.length; i++) {
      const a = holes.holes[i - 1]!.point;
      const b = holes.holes[i]!.point;
      gaps.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    expect(Math.min(...gaps)).toBeGreaterThan(1);
  });

  it('reports the spacing of the ring, not of the runs it was cut into', () => {
    // With a hole on every corner the line is distributed run by run, but the
    // spacing the user is told about is the one around the whole loop: holes
    // and gaps are equal on a closed ring, so it is simply the perimeter over
    // the count. Summing each run's own intervals undercounts, because the
    // gap from one run's last hole to the next run's first belongs to neither.
    const line = rectStitchLine(113, 77, 0, 3.5);
    const holes = holesOn(line, AT_CORNERS);

    expect(holes.achievedPitchMm).toBeCloseTo(PathOps.length(line) / holes.count, 9);
  });

  it('reports each run separately, so the odd spacing is attributable', () => {
    const holes = holesOn(rectStitchLine(100, 60, 0, 3.5), AT_CORNERS);

    expect(holes.runs.every((r) => r.count >= 2)).toBe(true);
    expect(holes.runs.reduce((n, r) => n + r.count, 0)).toBeGreaterThanOrEqual(holes.count);
  });

  // U.17: a run is the holes along one side, the corner holes at both its ends
  // included — what a maker counts along that edge with the iron, and what
  // two edges are matched by. A corner hole is on two runs, so the runs add up
  // to more than the set, by one per corner they share. Before, the first
  // corner was counted in the first run and the last, every other corner in
  // one run only: the sample's equal short sides read 24 and 23, beside 146
  // holes that the runs added up to 147.
  it('counts a corner hole in both runs it joins, so equal sides read equal (U.17)', () => {
    // The sample's outer: 200 × 95 mm, 5 mm corners, stitched 3 mm in.
    const holes = holesOn(rectStitchLine(200, 95, 5, 3), AT_CORNERS);

    expect(holes.count).toBe(146);
    expect(holes.runs.map((run) => run.count)).toEqual([24, 51, 24, 51]);
  });

  it('adds up to the set and one more per shared corner, on any rectangle (U.17)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 2, max: 5, noNaN: true }),
        (w, h, inset) => {
          const holes = holesOn(rectStitchLine(w, h, 0, inset), AT_CORNERS);
          const counts = holes.runs.map((run) => run.count);
          expect(counts).toHaveLength(4);
          // Opposite sides are the same length, so they hold the same holes.
          expect(counts[0]).toBe(counts[2]);
          expect(counts[1]).toBe(counts[3]);
          // Four corners, each on two runs, each punched once.
          expect(counts.reduce((sum, n) => sum + n, 0)).toBe(holes.count + 4);
        },
      ),
    );
  });

  it('counts the corners an open line turns at in both runs, and its ends once (U.17)', () => {
    // A pocket stitched down three sides: two corners, so two shared holes.
    const line = PathOps.polyline(
      [
        { x: 0, y: 60 },
        { x: 0, y: 0 },
        { x: 95, y: 0 },
        { x: 95, y: 60 },
      ],
      false,
    );
    const holes = holesOn(line, AT_CORNERS);
    const counts = holes.runs.map((run) => run.count);

    expect(counts).toHaveLength(3);
    expect(counts[0]).toBe(counts[2]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(holes.count + 2);
  });

  it('gives a run shorter than one pitch two holes, not none', () => {
    const holes = holesOn(straightRun(2), CONTINUOUS);
    expect(holes.count).toBe(2);
  });

  it('reports the spacing a run too short for the iron actually achieved', () => {
    // A 2 mm run asked to hold a 3.85 mm pitch gets two holes 2 mm apart.
    // Whether that is worth a warning is HOLE_SPACING_DEVIATION's call
    // (validate.test.ts); distribution only reports the number.
    const holes = holesOn(straightRun(2), CONTINUOUS);
    expect(holes.count).toBe(2);
    expect(holes.achievedPitchMm).toBeCloseTo(2, 9);
  });

  it('computes positions from the index, so they do not drift', () => {
    const holes = holesOn(straightRun(4000), { ...CONTINUOUS, mode: 'exact-pitch' });
    const last = holes.holes[holes.holes.length - 1]!;

    expect(last.point.x).toBeCloseTo((holes.count - 1) * 3.85, 6);
  });

  it('numbers holes within their run, so a hole can be named without an id', () => {
    const holes = holesOn(rectStitchLine(100, 60, 0, 3.5), AT_CORNERS);

    expect(holes.holes[0]).toMatchObject({ runIndex: 0, ordinal: 0 });
    expect(holes.holes.every((h) => Number.isInteger(h.ordinal))).toBe(true);
  });

  it('never places holes closer together than half the pitch', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 40, max: 300, noNaN: true }),
        fc.double({ min: 2.5, max: 6, noNaN: true }),
        (size, pitch) => {
          const holes = holesOn(rectStitchLine(size, size, 0, 3.5), {
            pitchMm: pitch,
            mode: 'fit-whole',
            corners: 'hole-at-corner',
          });

          for (let i = 1; i < holes.holes.length; i++) {
            const a = holes.holes[i - 1]!.point;
            const b = holes.holes[i]!.point;
            // A doubled corner hole shows up here as a gap of zero.
            expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(pitch / 2);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('the pitch floor, at the one place holes are made (5.6)', () => {
  it('refuses to generate holes below the floor, at once, whoever the caller is', () => {
    // evaluate checks first and reports the hole set by name; this is the
    // precondition behind that check, so no other caller can reach the
    // ~10³⁰² holes a raw 1e-300 asks for.
    const started = performance.now();
    expect(() => holesOn(straightRun(100), { ...CONTINUOUS, pitchMm: 1e-300 })).toThrow(RangeError);
    expect(() => holesOn(straightRun(100), { ...CONTINUOUS, pitchMm: 0 })).toThrow(RangeError);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('generates at the floor', () => {
    expect(holesOn(straightRun(100), { ...CONTINUOUS, pitchMm: MIN_PITCH_MM }).count).toBe(201);
  });
});
