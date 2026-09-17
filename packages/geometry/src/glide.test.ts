import { EPS_POINT, approxEq } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decomposeGlide, glideMatrix } from './glide.js';
import * as MatOps from './mat2x3.js';
import { dist, type Vec2 } from './vec2.js';

const finite = (min: number, max: number) => fc.double({ min, max, noNaN: true });
const point = (): fc.Arbitrary<Vec2> => fc.record({ x: finite(-500, 500), y: finite(-500, 500) });

/** An axis and a glide, the way the mirror op stores them. */
const glideReflection = () =>
  fc.record({
    origin: point(),
    angleRad: finite(-Math.PI * 2, Math.PI * 2),
    glideMm: finite(-200, 200),
  });

describe('glideMatrix', () => {
  it('reflects a point across the axis when there is no glide', () => {
    // The x axis: (3, 4) goes to (3, -4).
    const m = glideMatrix({ x: 0, y: 0 }, 0, 0);

    const there = MatOps.apply(m, { x: 3, y: 4 });
    expect(there.x).toBeCloseTo(3, 9);
    expect(there.y).toBeCloseTo(-4, 9);
  });

  it('slides along the axis, not across it', () => {
    const m = glideMatrix({ x: 0, y: 0 }, 0, 10);

    const there = MatOps.apply(m, { x: 3, y: 4 });
    expect(there.x).toBeCloseTo(13, 9);
    expect(there.y).toBeCloseTo(-4, 9);
  });

  it('is orientation-reversing, whatever the axis', () => {
    fc.assert(
      fc.property(glideReflection(), ({ origin, angleRad, glideMm }) => {
        const m = glideMatrix(origin, angleRad, glideMm);
        return MatOps.isMirrored(m) && approxEq(MatOps.determinant(m), -1, 1e-9);
      }),
    );
  });

  it('is its own inverse when there is no glide', () => {
    // Reflecting twice about the same line is doing nothing — the property
    // that makes "mirror the mirror back" mean what it says.
    fc.assert(
      fc.property(point(), finite(-Math.PI, Math.PI), point(), (origin, angleRad, p) => {
        const m = glideMatrix(origin, angleRad, 0);
        const back = MatOps.apply(m, MatOps.apply(m, p));
        return dist(back, p) < 1e-6;
      }),
    );
  });
});

describe('decomposeGlide', () => {
  it('recovers the axis and glide it was built from', () => {
    // The round trip that matters: whatever the maker's gesture composes to,
    // the parameters that come back build the same transform. Compared as
    // transforms, not as numbers, because a line has two equal descriptions.
    fc.assert(
      fc.property(glideReflection(), ({ origin, angleRad, glideMm }) => {
        const m = glideMatrix(origin, angleRad, glideMm);
        const parts = decomposeGlide(m);
        if (parts === null) return false;

        const rebuilt = glideMatrix(parts.origin, parts.angleRad, parts.glideMm);
        return MatOps.equals(rebuilt, m, 1e-6);
      }),
    );
  });

  it('normalises the axis direction to half a turn', () => {
    // A line at θ and at θ + π is the same line. Storing both would make two
    // equal mirrors compare unequal and round-trip differently.
    fc.assert(
      fc.property(glideReflection(), ({ origin, angleRad, glideMm }) => {
        const parts = decomposeGlide(glideMatrix(origin, angleRad, glideMm));
        return parts !== null && parts.angleRad >= 0 && parts.angleRad < Math.PI;
      }),
    );
  });

  it('gives the same answer for an axis described either way round', () => {
    const a = decomposeGlide(glideMatrix({ x: 5, y: 0 }, 0.3, 7));
    const b = decomposeGlide(glideMatrix({ x: 5, y: 0 }, 0.3 + Math.PI, -7));

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.angleRad).toBeCloseTo(b!.angleRad, 9);
    expect(a!.glideMm).toBeCloseTo(b!.glideMm, 9);
    expect(dist(a!.origin, b!.origin)).toBeLessThan(EPS_POINT);
  });

  it('puts the axis origin at the foot of the perpendicular, so equal mirrors compare equal', () => {
    // Two descriptions of one line — (0,0) and (10,0) both lie on the x axis —
    // must come back as the same stored parameters.
    const a = decomposeGlide(glideMatrix({ x: 0, y: 0 }, 0, 0));
    const b = decomposeGlide(glideMatrix({ x: 10, y: 0 }, 0, 0));

    expect(dist(a!.origin, b!.origin)).toBeLessThan(EPS_POINT);
    expect(a!.angleRad).toBeCloseTo(b!.angleRad, 9);
  });

  it('refuses anything that is not an orientation-reversing isometry', () => {
    // This is how scaling a counterpart is refused: not by a special case for
    // scale, but because a scaled reflection is not one of these at all.
    expect(decomposeGlide(MatOps.fromScale(2, 2))).toBeNull();
    expect(decomposeGlide(MatOps.fromScale(-2, 2))).toBeNull();
    expect(decomposeGlide(MatOps.fromRotation(0.5))).toBeNull();
    expect(decomposeGlide(MatOps.IDENTITY)).toBeNull();
    expect(decomposeGlide(MatOps.fromTranslation({ x: 3, y: 4 }))).toBeNull();
    expect(decomposeGlide({ a: 1, b: 0, c: 1, d: -1, e: 0, f: 0 })).toBeNull();
  });

  describe('the gestures it has to absorb', () => {
    /** Moving the counterpart alone: the axis takes the gesture. */
    const movedAlone = (m: MatOps.Mat2x3, by: Vec2) =>
      MatOps.compose(m, MatOps.fromTranslation(by));

    it('absorbs a move, leaving a transform that still mirrors', () => {
      fc.assert(
        fc.property(glideReflection(), point(), ({ origin, angleRad, glideMm }, by) => {
          const moved = movedAlone(glideMatrix(origin, angleRad, glideMm), by);
          const parts = decomposeGlide(moved);
          if (parts === null) return false;
          return MatOps.equals(
            glideMatrix(parts.origin, parts.angleRad, parts.glideMm),
            moved,
            1e-6,
          );
        }),
      );
    });

    it('absorbs a rotation', () => {
      fc.assert(
        fc.property(
          glideReflection(),
          point(),
          finite(-Math.PI, Math.PI),
          ({ origin, angleRad, glideMm }, pivot, turn) => {
            const turned = MatOps.compose(
              glideMatrix(origin, angleRad, glideMm),
              MatOps.fromRotationAround(pivot, turn),
            );
            const parts = decomposeGlide(turned);
            if (parts === null) return false;
            return MatOps.equals(
              glideMatrix(parts.origin, parts.angleRad, parts.glideMm),
              turned,
              1e-6,
            );
          },
        ),
      );
    });

    it('comes back where it started when a move is undone', () => {
      // Drag it away, drag it back: the same mirror, not a drifted one.
      fc.assert(
        fc.property(glideReflection(), point(), ({ origin, angleRad, glideMm }, by) => {
          const m = glideMatrix(origin, angleRad, glideMm);
          const there = movedAlone(m, by);
          const back = movedAlone(there, { x: -by.x, y: -by.y });
          return MatOps.equals(back, m, 1e-6);
        }),
      );
    });

    it('moves the axis by half of a perpendicular nudge', () => {
      // Not a fudge: translating a mirror line across by t moves the image by
      // 2t, so absorbing a move of t into the axis means moving it by t / 2.
      const m = glideMatrix({ x: 0, y: 0 }, 0, 0);
      const moved = movedAlone(m, { x: 0, y: 6 });

      const parts = decomposeGlide(moved)!;
      expect(parts.origin.y).toBeCloseTo(3, 9);
      expect(parts.glideMm).toBeCloseTo(0, 9);
    });

    it('puts a nudge along the axis entirely into the glide', () => {
      const moved = movedAlone(glideMatrix({ x: 0, y: 0 }, 0, 0), { x: 6, y: 0 });

      const parts = decomposeGlide(moved)!;
      expect(parts.glideMm).toBeCloseTo(6, 9);
      expect(parts.origin.y).toBeCloseTo(0, 9);
    });

    it('carries the axis along when the whole pair moves', () => {
      // Conjugation rather than composition: selecting a symmetric panel and
      // dragging it must move it rigidly, not slide its halves apart.
      fc.assert(
        fc.property(glideReflection(), point(), ({ origin, angleRad, glideMm }, by) => {
          const m = glideMatrix(origin, angleRad, glideMm);
          const t = MatOps.fromTranslation(by);
          const conjugated = MatOps.composeAll(MatOps.invert(t), m, t);

          const parts = decomposeGlide(conjugated);
          if (parts === null) return false;
          // The axis has moved with the pair, and the glide is untouched.
          return (
            approxEq(parts.glideMm, decomposeGlide(m)!.glideMm, 1e-6) &&
            MatOps.equals(
              glideMatrix(parts.origin, parts.angleRad, parts.glideMm),
              conjugated,
              1e-6,
            )
          );
        }),
      );
    });
  });
});
