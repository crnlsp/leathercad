import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { length, polyline } from '../path/index.js';
import { vec } from '../vec2.js';
import { subPath } from './subPath.js';

describe('subPath', () => {
  it('extracts a middle run and returns it open', () => {
    const p = polyline([vec(0, 0), vec(100, 0), vec(100, 50)], false);
    const run = subPath(p, 50, 120);

    expect(run.closed).toBe(false);
    expect(length(run)).toBeCloseTo(70, 9);
  });

  it('splits the boundary segments rather than snapping to vertices', () => {
    const p = polyline([vec(0, 0), vec(100, 0)], false);
    const run = subPath(p, 25, 75);

    expect(length(run)).toBeCloseTo(50, 9);
  });

  it('wraps through the start of a closed path', () => {
    // A 100 mm square, from 350 mm round to 50 mm: the last 50 mm of the
    // final edge plus the first 50 mm of the first. This is how a run that
    // spans the start point is expressed — three sides of a pocket, for
    // instance, when the open edge straddles the path's origin.
    const square = polyline([vec(0, 0), vec(100, 0), vec(100, 100), vec(0, 100)], true);
    const run = subPath(square, 350, 50);

    expect(run.closed).toBe(false);
    expect(length(run)).toBeCloseTo(100, 6);
  });

  it('returns an empty path for a zero-length run', () => {
    const p = polyline([vec(0, 0), vec(100, 0)], false);
    expect(subPath(p, 40, 40).segments).toHaveLength(0);
  });

  it('refuses to wrap on an open path, which has nothing to wrap through', () => {
    const p = polyline([vec(0, 0), vec(100, 0)], false);
    expect(() => subPath(p, 75, 25)).toThrow(/open/i);
  });

  it('clamps a run that runs past the end', () => {
    const p = polyline([vec(0, 0), vec(100, 0)], false);
    expect(length(subPath(p, 50, 500))).toBeCloseTo(50, 9);
  });

  it('preserves total length when split and rejoined', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 199, noNaN: true }), (cut) => {
        const p = polyline([vec(0, 0), vec(100, 0), vec(100, 100)], false);
        const a = length(subPath(p, 0, cut));
        const b = length(subPath(p, cut, 200));
        expect(a + b).toBeCloseTo(200, 6);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps arcs as arcs', () => {
    // A stitch line inset from a rounded corner must still be an arc, not a
    // polyline approximation of one.
    const rounded = polyline([vec(0, 0), vec(100, 0)], false);
    expect(subPath(rounded, 10, 90).segments.every((s) => s.kind === 'line')).toBe(true);
  });
});
