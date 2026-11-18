import { IRON_STYLES, evaluate, toothOfStyle, toothOutline, type Tooth } from '@leathercad/domain';
import { intersectPaths } from '@leathercad/geometry';
import { STARTER_IRONS } from '@leathercad/platform';
import { describe, expect, it } from 'vitest';

import {
  at,
  drawRectangle,
  holesOf,
  outlineOf,
  punchHardware,
  punchHoles,
  stitchAllRound,
  stitchLeavingOpen,
  stitchOf,
  type Side,
} from '../harness/actions.js';
import { Bench } from '../harness/bench.js';
import { checkMatrixClaims } from '../harness/coverage.js';
import { cardPocket, stitchReading } from './support.js';

/**
 * Geometry that looks like something it is not (D), and where a hole meets
 * the cut edge (K): on it, or with its tooth across it.
 */

checkMatrixClaims();

describe('D — geometry that resembles a pocket, or a seam, and is not one', () => {
  it('SF-D1 · a strap end stitched in a U reads as a U and invents no card requirement', () => {
    // A keeper loop's end: stitched round three sides, open where it joins the
    // strap. Narrower than any card: still nothing is said, because nothing
    // was asked.
    const bench = new Bench()
      .do(...cardPocket('keeper', { width: 25, height: 40, open: 'right' }))
      .expect([]);
    expect(stitchReading(bench.project, stitchOf('keeper'))).toEqual({ widthMm: 34, depthMm: 19 });
  });

  it('SF-D2 · two pieces laid exactly over each other, stitched with different counts, are never taken as sewn', () => {
    // 94 mm and 74 mm along their bottoms: 25 and 20 holes. A seam is checked
    // only when the maker declares one.
    new Bench()
      .do(
        drawRectangle('back', { x: 0, y: 0, width: 100, height: 60 }),
        stitchAllRound('back', 3),
        punchHoles('back'),
        drawRectangle('front', { x: 0, y: 0, width: 80, height: 60 }),
        stitchAllRound('front', 3),
        punchHoles('front'),
      )
      .expect([]);
  });

  it('SF-D3 · a piece the size of a card slot, stitched as a pocket, is not told what it holds', () => {
    // 90 × 60, the size of a card pocket and too narrow for a card with ease:
    // nothing about cards until the maker says it holds one (SF-B2).
    new Bench().do(...cardPocket('slot', { width: 90, height: 60 })).expect([]);
  });
});

describe('K — holes on, and teeth across, the cut edge', () => {
  const sides: readonly Side[] = ['top', 'bottom', 'left', 'right'];

  /** The pocket a maker draws first: square corners, stitched 3 mm in, open on one side. */
  const squarePocket = (open: Side) =>
    new Bench().do(
      drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 60 }),
      stitchLeavingOpen('pocket', open, 3),
      punchHoles('pocket'),
    );

  it('SF-K1 · with 3 mm corners, the same pocket says nothing whichever side is open', () => {
    for (const open of sides) {
      new Bench().do(...cardPocket('pocket', { width: 100, height: 60, open })).expect([], open);
    }
  });

  it('SF-K2 · (evidence for SF-K3) with square corners, the two end holes sit on the cut edge, wherever the opening is', () => {
    // Stitched between two corners of a square-cornered piece, the stitching
    // runs out to the edge it leaves open, so its first and last holes are on
    // the cut line itself: some rule must speak, about those two holes.
    for (const open of sides) {
      const found = squarePocket(open).diagnostics;
      expect(found, open).toHaveLength(1);
      expect(found[0]?.featureId, open).toBe(holesOf('pocket'));
      expect(found[0]?.location, open).toMatchObject({ kind: 'points' });
      expect(found[0]?.location?.kind === 'points' && found[0].location.points, open).toHaveLength(
        2,
      );
    }
  });

  /**
   * KNOWN DEFECT KD-1 (docs/smart-features.md §7). A stitch hole exactly on
   * the outline is asked `containsPoint`, which has no defined answer on the
   * boundary (geometry/path/contains.ts). Open at the top or the right it is
   * `OUTSIDE_PART`, an error; at the bottom or the left `HOLE_TOO_CLOSE_TO_EDGE`
   * with 0 mm clearance, a warning; turned by a few degrees, either, by
   * rounding. A hardware hole's rim on the edge is held to one answer within a
   * storage quantum (Q2, Q33); a stitch hole is not. Which answer is right is
   * the maintainer's; the defect is that they differ, so each orientation's
   * `correct` is the verdict the other half gets.
   */
  it('SF-K3 · KNOWN DEFECT KD-1 · holes on the edge are an error or a warning by which side is open', () => {
    const off = {
      code: 'OUTSIDE_PART',
      severity: 'error',
      on: holesOf('pocket'),
      facts: { what: 'holes' },
    } as const;
    const near = {
      code: 'HOLE_TOO_CLOSE_TO_EDGE',
      severity: 'warning',
      on: holesOf('pocket'),
      facts: { clearanceMm: 0, minimumMm: 1.5 },
    } as const;
    const ends = {
      top: [at(3, 60), at(97, 60)],
      right: [at(100, 57), at(100, 3)],
      bottom: [at(97, 0), at(3, 0)],
      left: [at(0, 3), at(0, 57)],
    };
    for (const open of ['top', 'right'] as const) {
      squarePocket(open).expectDefect('KD-1', {
        now: [{ ...off, location: { points: ends[open] } }],
        correct: [near],
      });
    }
    for (const open of ['bottom', 'left'] as const) {
      squarePocket(open).expectDefect('KD-1', {
        now: [{ ...near, location: { points: ends[open] } }],
        correct: [off],
      });
    }
  });

  /** A piece 100 × 60 stitched all round at an inset, with the iron's tooth said. */
  const toothed = (insetMm: number, tooth: Tooth) =>
    new Bench().do(
      drawRectangle('panel', { x: 0, y: 0, width: 100, height: 60 }),
      stitchAllRound('panel', insetMm),
      punchHoles('panel', { tooth }),
    );

  /** How many of the panel's teeth cut through its outline. */
  function teethAcrossTheEdge(bench: Bench): number {
    const part = evaluate(bench.project).parts[0]!;
    const holes = part.features.find((f) => f.feature.id === holesOf('panel'));
    const outline = part.features.find((f) => f.feature.id === outlineOf('panel'));
    if (holes?.ok !== true || outline?.ok !== true || holes.holes?.tooth === undefined) {
      throw new Error('the panel, its holes and their tooth must resolve');
    }
    const tooth = holes.holes.tooth;
    return holes.holes.holes.filter(
      (hole) => intersectPaths(toothOutline(hole, tooth), outline.path).length > 0,
    ).length;
  }

  const fourMillimetreProng: Tooth = { kind: 'round', diameterMm: 4 };

  it('SF-K5 · (evidence for SF-K4) a 4 mm prong 1.6 mm in cuts through the edge at every hole; the same punch for a rivet is an error', () => {
    expect(teethAcrossTheEdge(toothed(1.6, fourMillimetreProng))).toBe(80);
    new Bench()
      .do(
        drawRectangle('panel', { x: 0, y: 0, width: 100, height: 60 }),
        punchHardware('panel', 'rivet', at(50, 1.6), 4),
      )
      .expect([
        {
          code: 'OUTSIDE_PART',
          severity: 'error',
          on: 'rivet',
          facts: { what: 'holes' },
          location: { points: [at(50, 1.6)] },
        },
      ]);
  });

  /**
   * KNOWN DEFECT KD-3 (docs/smart-features.md §7). Since 9.26 a hole set
   * knows its tooth, and SVG and DXF cut its true outline (D27). The rules
   * still read each stitch hole as its centre: a typed 4 mm round prong 1.6 mm
   * in passes the 1.5 mm edge rule and cuts a notch out of the edge at all 80
   * holes, which the same punch placed as a rivet reports as off the leather
   * (SF-K5). A cut through the edge is a fact, not a clearance to choose: the
   * correct list is DR2's, as for hardware.
   */
  it('SF-K4 · KNOWN DEFECT KD-3 · stitch teeth that cut through the edge are not said to leave the leather', () => {
    toothed(1.6, fourMillimetreProng).expectDefect('KD-3', {
      now: [],
      correct: [
        {
          code: 'OUTSIDE_PART',
          severity: 'error',
          on: holesOf('panel'),
          facts: { what: 'holes' },
          location: { points: 80 },
        },
      ],
    });
  });

  it('SF-K6 · every tooth a maker can pick by style, at every starter iron, stays on the leather 1.5 mm in, and is told nothing', () => {
    // The contract today (domain-model §8.6): a stitch hole's edge clearance is
    // measured from its centre. These are the teeth the app fills in itself;
    // at the rule's own minimum their footprints still clear the edge, so the
    // contract holds for them. A typed tooth need not (SF-K4).
    for (const pitchMm of new Set(STARTER_IRONS.map((iron) => iron.pitchMm))) {
      for (const style of IRON_STYLES) {
        const bench = new Bench().do(
          drawRectangle('panel', { x: 0, y: 0, width: 100, height: 60 }),
          stitchAllRound('panel', 1.5),
          punchHoles('panel', { pitchMm, tooth: toothOfStyle(style, pitchMm) }),
        );
        bench.expect([], `${style} at ${pitchMm}`);
        expect(teethAcrossTheEdge(bench), `${style} at ${pitchMm}`).toBe(0);
      }
    }
  });
});
