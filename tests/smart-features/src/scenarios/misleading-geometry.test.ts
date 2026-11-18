import type { Diagnostic } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import {
  drawRectangle,
  holesOf,
  punchHoles,
  stitchAllRound,
  stitchLeavingOpen,
  stitchOf,
  type Side,
} from '../harness/actions.js';
import { Bench } from '../harness/bench.js';
import { cardPocket, stitchReading } from './support.js';

/**
 * Geometry that looks like something it is not (D), and the one place the
 * rules' answer depends on which way a piece faces (K).
 */

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

describe('K — holes that land exactly on the cut edge', () => {
  const sides: readonly Side[] = ['top', 'bottom', 'left', 'right'];

  /** The pocket a maker draws first: square corners, stitched 3 mm in, open on one side. */
  const squarePocket = (open: Side): readonly Diagnostic[] =>
    new Bench().do(
      drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 60 }),
      stitchLeavingOpen('pocket', open, 3),
      punchHoles('pocket'),
    ).diagnostics;

  const verdict = (found: readonly Diagnostic[]) =>
    found.map((d) => `${d.problem.code} ${d.severity} on ${d.featureId ?? d.partId}`);

  it('SF-K1 · with 3 mm corners, the same pocket says nothing whichever side is open', () => {
    for (const open of sides) {
      new Bench().do(...cardPocket('pocket', { width: 100, height: 60, open })).expect([], open);
    }
  });

  it('SF-K2 · (evidence for SF-K3) with square corners, every end hole sits on the cut edge, wherever the opening is', () => {
    // Stitched between two corners of a square-cornered piece, the stitching
    // runs out to the edge it leaves open, so its first and last holes are on
    // the cut line itself: some rule must speak, whatever it is.
    for (const open of sides) {
      const found = squarePocket(open);
      expect(found, open).toHaveLength(1);
      expect(found[0]?.featureId, open).toBe(holesOf('pocket'));
    }
  });

  /**
   * KNOWN DEFECT SF-D1 (docs/smart-features.md §7). A stitch hole exactly on
   * the outline is asked `containsPoint`, which has no defined answer on the
   * boundary (geometry/path/contains.ts). Open at the top or the right it is
   * `OUTSIDE_PART`, an error; at the bottom or the left `HOLE_TOO_CLOSE_TO_EDGE`
   * with 0 mm clearance, a warning; turned by a few degrees, either, by
   * rounding. Which code and severity a maker sees depends on which way the
   * piece faces. A hardware hole's rim on the edge is already held to one
   * answer within a storage quantum (Q2, Q33); a stitch hole is not.
   */
  it.fails('SF-K3 · the verdict on holes on the edge is the same whichever side is open', () => {
    const top = verdict(squarePocket('top'));
    for (const open of sides) expect(verdict(squarePocket(open)), open).toEqual(top);
  });
});
