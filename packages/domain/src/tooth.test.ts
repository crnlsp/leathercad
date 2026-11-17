import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EPS_LENGTH, approxEq } from '@leathercad/core';
import { PathOps, type Vec2 } from '@leathercad/geometry';

import type { Tooth } from './feature.js';
import { MIN_PITCH_MM } from './stitch.js';
import { IRON_STYLES, toothOfStyle, toothOutline } from './tooth.js';

/** Where a maker's hole can be: anywhere on a bench-sized board. */
const arbPoint: fc.Arbitrary<Vec2> = fc.record({
  x: fc.double({ min: -2000, max: 2000, noNaN: true }),
  y: fc.double({ min: -2000, max: 2000, noNaN: true }),
});

/** Any direction, at any length a distribution or a mirror could hand over. */
const arbTangent: fc.Arbitrary<Vec2> = fc
  .record({
    angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    length: fc.double({ min: 1e-3, max: 10, noNaN: true }),
  })
  .map(({ angle, length }) => ({ x: Math.cos(angle) * length, y: Math.sin(angle) * length }));

const arbSlit = fc.record({
  kind: fc.constant('slit' as const),
  lengthMm: fc.double({ min: 0.05, max: 10, noNaN: true }),
  widthMm: fc.double({ min: 0.05, max: 3, noNaN: true }),
  slantDeg: fc.double({ min: -89, max: 89, noNaN: true }),
});

const arbRound = fc.record({
  kind: fc.constant('round' as const),
  diameterMm: fc.double({ min: 0.05, max: 10, noNaN: true }),
});

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Coordinates of 2000 mm carry about 1e-12 of rounding; well inside EPS_LENGTH. */
const near = (a: number, b: number): boolean => approxEq(a, b, EPS_LENGTH);

describe('toothOutline, a slit', () => {
  it('is a lozenge centred on the hole', () => {
    fc.assert(
      fc.property(arbPoint, arbTangent, arbSlit, (point, tangent, tooth) => {
        const corners = PathOps.vertices(toothOutline({ point, tangent }, tooth));
        expect(corners).toHaveLength(4);
        const x = corners.reduce((sum, c) => sum + c.x, 0) / 4;
        const y = corners.reduce((sum, c) => sum + c.y, 0) / 4;
        expect(near(x, point.x) && near(y, point.y)).toBe(true);
      }),
    );
  });

  it('is as long and as wide as the tooth, and closed', () => {
    fc.assert(
      fc.property(arbPoint, arbTangent, arbSlit, (point, tangent, tooth) => {
        const outline = toothOutline({ point, tangent }, tooth);
        const [tip, side, otherTip, otherSide] = PathOps.vertices(outline) as [
          Vec2,
          Vec2,
          Vec2,
          Vec2,
        ];
        expect(outline.closed).toBe(true);
        expect(near(distance(tip, otherTip), tooth.lengthMm)).toBe(true);
        expect(near(distance(side, otherSide), tooth.widthMm)).toBe(true);
      }),
    );
  });

  it('leans at the slant to the stitch line, counter-clockwise from its direction', () => {
    fc.assert(
      fc.property(arbPoint, arbTangent, arbSlit, (point, tangent, tooth) => {
        const [tip, , otherTip] = PathOps.vertices(toothOutline({ point, tangent }, tooth)) as [
          Vec2,
          Vec2,
          Vec2,
        ];
        const axis = { x: tip.x - otherTip.x, y: tip.y - otherTip.y };
        // The long axis is a line, not a ray: its angle to the tangent is the
        // slant up to a half turn.
        const turn =
          Math.atan2(axis.y, axis.x) -
          Math.atan2(tangent.y, tangent.x) -
          (tooth.slantDeg * Math.PI) / 180;
        expect(Math.abs(Math.sin(turn))).toBeLessThan(1e-9);
      }),
    );
  });

  it('is the same outline whichever way the line was drawn', () => {
    fc.assert(
      fc.property(arbPoint, arbTangent, arbSlit, (point, tangent, tooth) => {
        const forward = PathOps.vertices(toothOutline({ point, tangent }, tooth));
        const back = PathOps.vertices(
          toothOutline({ point, tangent: { x: -tangent.x, y: -tangent.y } }, tooth),
        );
        for (const corner of forward) {
          expect(back.some((other) => distance(corner, other) < EPS_LENGTH)).toBe(true);
        }
      }),
    );
  });

  it('leans the other way for an inverse iron', () => {
    const standard = PathOps.vertices(
      toothOutline(
        { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } },
        { kind: 'slit', lengthMm: 2, widthMm: 0.4, slantDeg: 45 },
      ),
    );
    const inverse = PathOps.vertices(
      toothOutline(
        { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } },
        { kind: 'slit', lengthMm: 2, widthMm: 0.4, slantDeg: -45 },
      ),
    );
    // `/` along a line drawn left to right, Y up; `\` for the inverse.
    expect(standard[0]!.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(standard[0]!.y).toBeCloseTo(Math.SQRT1_2, 12);
    expect(inverse[0]!.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(inverse[0]!.y).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});

describe('toothOutline, a round tooth', () => {
  it('is a circle of the diameter, centred on the hole: every point at the radius', () => {
    fc.assert(
      fc.property(arbPoint, arbTangent, arbRound, (point, tangent, tooth) => {
        const outline = toothOutline({ point, tangent }, tooth);
        expect(outline.closed).toBe(true);
        for (const on of PathOps.flattenPath(outline)) {
          expect(near(distance(on, point), tooth.diameterMm / 2)).toBe(true);
        }
      }),
    );
  });
});

describe('toothOutline, a hole with no direction', () => {
  it('never answers NaN for a zero tangent', () => {
    fc.assert(
      fc.property(arbPoint, fc.oneof<fc.Arbitrary<Tooth>[]>(arbSlit, arbRound), (point, tooth) => {
        for (const corner of PathOps.flattenPath(
          toothOutline({ point, tangent: { x: 0, y: 0 } }, tooth),
        )) {
          expect(Number.isFinite(corner.x) && Number.isFinite(corner.y)).toBe(true);
        }
      }),
    );
  });
});

describe('toothOfStyle', () => {
  it('fills F.7’s French tooth: half the pitch, the 0.4 mm blade, 45°', () => {
    expect(toothOfStyle('french', 3.85)).toEqual({
      kind: 'slit',
      lengthMm: 1.925,
      widthMm: 0.4,
      slantDeg: 45,
    });
  });

  it('fills a Japanese tooth longer than a French one at the same pitch', () => {
    const japanese = toothOfStyle('japanese', 3.85);
    const french = toothOfStyle('french', 3.85);
    expect(japanese.kind === 'slit' && french.kind === 'slit').toBe(true);
    if (japanese.kind !== 'slit' || french.kind !== 'slit') return;
    expect(japanese.lengthMm).toBe(2.387);
    expect(japanese.lengthMm).toBeGreaterThan(french.lengthMm);
  });

  it('fills a round prong of 1.2 mm, whatever the pitch', () => {
    expect(toothOfStyle('round', 3.0)).toEqual({ kind: 'round', diameterMm: 1.2 });
    expect(toothOfStyle('round', 5.0)).toEqual({ kind: 'round', diameterMm: 1.2 });
  });

  it('gives every style, at every pitch an iron can have, a slit no longer than the pitch', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...IRON_STYLES),
        fc.double({ min: MIN_PITCH_MM, max: 50, noNaN: true }),
        (style, pitchMm) => {
          const tooth = toothOfStyle(style, pitchMm);
          if (tooth.kind === 'slit') expect(tooth.lengthMm).toBeLessThanOrEqual(pitchMm);
          const sizes =
            tooth.kind === 'slit' ? [tooth.lengthMm, tooth.widthMm] : [tooth.diameterMm];
          for (const size of sizes) expect(size).toBeGreaterThan(0);
        },
      ),
    );
  });
});
