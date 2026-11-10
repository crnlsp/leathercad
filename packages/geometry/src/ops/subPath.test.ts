import { EPS_LENGTH } from '@leathercad/core';
import { circle, roundedRect } from '../shapes.js';
import { length as segmentLength } from '../segment/index.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { length, polyline } from '../path/index.js';
import { vec } from '../vec2.js';
import { subPath } from './subPath.js';

describe('subPath', () => {
  it('does not leave a rounding-error fragment at the card-holder pocket corner', () => {
    const p = roundedRect(vec(0, -60), 105, 45, {
      bottomLeft: 4,
      bottomRight: 4,
      topLeft: 0,
      topRight: 0,
    });
    const run = subPath(p, 249.2831853071796, 144.2831853071796);
    expect(run.segments.length).toBeGreaterThan(0);
    for (const segment of run.segments) expect(segmentLength(segment)).toBeGreaterThan(EPS_LENGTH);
  });
  it('drops the boundary remnant on the shrunk 20 × 20 pocket regression', () => {
    const p = roundedRect(vec(0, 0), 20, 20, {
      bottomLeft: 4,
      bottomRight: 4,
      topLeft: 0,
      topRight: 0,
    });
    const run = subPath(p, 54.283185307179586, 34.283185307179586);
    for (const segment of run.segments) expect(segmentLength(segment)).toBeGreaterThan(EPS_LENGTH);
  });
  it('preserves real boundary fragments when their parameter is small but their length is not', () => {
    const p = polyline([vec(0, 0), vec(1000, 0), vec(1000, 1000)], false);
    expect(length(subPath(p, 0, 1000.00001))).toBeCloseTo(1000.00001, 9);
    expect(length(subPath(p, 999.99999, 1000))).toBeCloseTo(0.00001, 9);
  });
  it('keeps nondegenerate runs at rounded-pocket boundaries across the working range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 1000 }),
        fc.integer({ min: 20, max: 1000 }),
        (width, height) => {
          const p = roundedRect(vec(0, 0), width, height, {
            bottomLeft: 4,
            bottomRight: 4,
            topLeft: 0,
            topRight: 0,
          });
          const lengths = p.segments.map(segmentLength);
          const from = lengths.slice(0, 4).reduce((a, b) => a + b, 0);
          const to = lengths.slice(0, 3).reduce((a, b) => a + b, 0);
          const run = subPath(p, from, to);
          const expected = length(p) - from + to;
          expect(Math.abs(length(run) - expected)).toBeLessThanOrEqual(EPS_LENGTH);
          for (const segment of run.segments)
            expect(segmentLength(segment)).toBeGreaterThan(EPS_LENGTH);
        },
      ),
    );
  });
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
    const rounded = circle(vec(0, 0), 10);
    const run = subPath(rounded, 5, 15);
    expect(run.segments).toHaveLength(1);
    expect(run.segments[0]?.kind).toBe('arc');
    expect(Math.abs(length(run) - 10)).toBeLessThanOrEqual(EPS_LENGTH);
  });
});
