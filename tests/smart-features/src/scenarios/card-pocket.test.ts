import { QUANTUM_MM } from '@leathercad/core';
import { describe, expect, it } from 'vitest';

import {
  at,
  drawRectangle,
  drawStitching,
  holdsCard,
  holdsSize,
  openStitching,
  punchHoles,
  resize,
  statesNothing,
  stitchAllRound,
  stitchOf,
} from '../harness/actions.js';
import { Bench } from '../harness/bench.js';
import type { Expected } from '../harness/expectDiagnostics.js';
import { cardPocket, depthFromOpening, stitchReading } from './support.js';

/**
 * A card pocket, from a blank project (scenarios B, C, E and F).
 *
 * The pocket is `cardPocket`: width between stitch lines = width − 6, depth
 * below the opening = height − 3. A payment card is 85.60 × 53.98 mm; with
 * 2 mm of ease its width needs 87.60 mm between the stitch lines.
 */

const STITCH = stitchOf('pocket');

const tooNarrow = (widthMm: number, neededMm: number, easeMm: number): Expected => ({
  code: 'POCKET_TOO_NARROW',
  severity: 'warning',
  on: STITCH,
  related: [],
  facts: { featureId: STITCH, content: 'id-1', widthMm, neededMm, easeMm },
});

describe('B — a card pocket that is too narrow', () => {
  it('SF-B1 · a pocket wide enough for a card with its ease says nothing', () => {
    new Bench()
      .do(...cardPocket('pocket', { width: 100, height: 60 }), holdsCard(STITCH, 2))
      .expect([]);
  });

  it('SF-B2 · a pocket too narrow for a card says so once, on its stitching, with both widths', () => {
    new Bench()
      .do(...cardPocket('pocket', { width: 90, height: 60 }), holdsCard(STITCH, 2))
      .expect([tooNarrow(84, 87.6, 2)]);
  });

  it('SF-B3 · widening the pocket clears the warning, and undo and redo bring it back and take it away', () => {
    const bench = new Bench()
      .do(...cardPocket('pocket', { width: 90, height: 60 }), holdsCard(STITCH, 2))
      .expect([tooNarrow(84, 87.6, 2)], 'before widening')
      .do(resize('pocket', { width: 100 }))
      .expect([], 'after widening');
    bench.undo().expect([tooNarrow(84, 87.6, 2)], 'after undoing the widening');
    bench.redo().expect([], 'after redoing the widening');
  });

  it('SF-B4 · a pocket exactly as wide as the card and its ease passes; one storage step narrower does not', () => {
    // 93.6 − 6 = 87.6 = 85.6 + 2: the boundary itself is enough (approxGte).
    new Bench()
      .do(...cardPocket('pocket', { width: 93.6, height: 60 }), holdsCard(STITCH, 2))
      .expect([]);
    new Bench()
      .do(...cardPocket('pocket', { width: 93.6 - QUANTUM_MM, height: 60 }), holdsCard(STITCH, 2))
      .expect([tooNarrow(87.6 - QUANTUM_MM, 87.6, 2)]);
  });

  it('SF-B5 · more ease can make a pocket too narrow, and never judges its depth', () => {
    // 94 mm across: enough for a card with 8 mm of ease, not with 9.
    new Bench()
      .do(...cardPocket('pocket', { width: 100, height: 60 }), holdsCard(STITCH, 8, true))
      .expect([], 'with 8 mm of ease')
      .do(holdsCard(STITCH, 9, true))
      .expect([tooNarrow(94, 94.6, 9)], 'with 9 mm of ease');
  });

  it('SF-B6 · a typed size is checked by its own width, and says it is not a card', () => {
    // A 110 × 70 notebook with 2 mm of ease needs 112 mm; the pocket has 94.
    new Bench()
      .do(
        ...cardPocket('pocket', { width: 100, height: 60 }),
        holdsSize(STITCH, { widthMm: 110, heightMm: 70 }, 2),
      )
      .expect([
        {
          code: 'POCKET_TOO_NARROW',
          severity: 'warning',
          on: STITCH,
          facts: { content: 'size', widthMm: 94, neededMm: 112, easeMm: 2 },
        },
      ]);
  });
});

describe('C — the same pocket, with nothing said about what it holds', () => {
  it('SF-C1 · says nothing about cards, while its measurements stay available', () => {
    const bench = new Bench().do(...cardPocket('pocket', { width: 90, height: 60 })).expect([]);
    expect(stitchReading(bench.project, STITCH)).toEqual({ widthMm: 84, depthMm: 54 });
    expect(depthFromOpening(bench.project, 'pocket', STITCH)).toBe(57);
  });

  it('SF-C2 · taking the requirement away removes exactly its warning and nothing else', () => {
    new Bench()
      .do(...cardPocket('pocket', { width: 90, height: 60 }), holdsCard(STITCH, 2))
      .expect([tooNarrow(84, 87.6, 2)], 'while it holds a card')
      .do(statesNothing(STITCH))
      .expect([], 'once nothing is stated');
  });
});

describe('E — a requirement on stitching that makes no measurable pocket', () => {
  const notMeasurable = (reading: 'width' | 'opening'): Expected => ({
    code: 'POCKET_NOT_MEASURABLE',
    severity: 'warning',
    on: STITCH,
    facts: { featureId: STITCH, reading },
  });

  it('SF-E1 · stitched all round, a card requirement is said to be unchecked, never passed', () => {
    new Bench()
      .do(
        drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 60 }),
        stitchAllRound('pocket', 3),
        punchHoles('pocket'),
        holdsCard(STITCH, 2),
      )
      .expect([notMeasurable('width')]);
  });

  it('SF-E2 · V-shaped stitching has no sides to measure between, so it is unchecked, and not called narrow', () => {
    new Bench()
      .do(
        drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 60 }),
        drawStitching('pocket', [at(5, 55), at(50, 5), at(95, 55)]),
        punchHoles('pocket'),
        holdsCard(STITCH, 2),
      )
      .expect([notMeasurable('width')]);
  });

  it('SF-E3 · held fully with its stitch ends off the leather, the depth is unchecked and the width still judged', () => {
    // The stitching overshoots the top edge by 10 mm, so no opening lies above
    // its ends. 94 mm across is enough for the card; the line off the leather
    // is said as well, as a warning, because it is a line and not holes.
    new Bench()
      .do(
        drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 60 }),
        drawStitching('pocket', [at(3, 70), at(3, 3), at(97, 3), at(97, 70)]),
        holdsCard(STITCH, 2, true),
      )
      .expect([
        { code: 'OUTSIDE_PART', severity: 'warning', on: STITCH, facts: { what: 'line' } },
        notMeasurable('opening'),
      ]);
  });

  it('SF-E5 · an unchecked requirement becomes a real check once the stitching is opened into a U', () => {
    // *Stitched sides › Between corners* on the all-round line of SF-E1: 84 mm
    // across, too narrow for a card with 2 mm of ease, and now said so.
    new Bench()
      .do(
        drawRectangle('pocket', { x: 0, y: 0, width: 90, height: 60, radius: 3 }),
        stitchAllRound('pocket', 3),
        punchHoles('pocket'),
        holdsCard(STITCH, 2),
      )
      .expect([notMeasurable('width')], 'stitched all round')
      .do(openStitching('pocket', 'top'))
      .expect([tooNarrow(84, 87.6, 2)], 'opened at the top');
  });

  /**
   * KNOWN DEFECT SF-D2 (docs/smart-features.md §7). A pocket sewn onto a
   * larger panel, its U of stitching drawn on the panel and its top edge
   * marked at 45 mm: 41 mm below the pocket's own top, too shallow for a card
   * held fully. DR8 reads the opening from the panel's outline, 120 mm up, and
   * passes it. Plan D21 names this limit for a slit; it holds for any pocket
   * whose opening is not on the outline of the piece its stitching is in, and
   * the maker is told nothing. The correct outcome is not to claim the card
   * goes in: either too shallow, or not measurable.
   */
  it.fails(
    'SF-E4 · a pocket stitched onto a larger panel does not claim a card goes in fully',
    () => {
      const bench = new Bench().do(
        drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 120 }),
        drawStitching('pocket', [at(4, 42), at(4, 4), at(96, 4), at(96, 42)]),
        punchHoles('pocket'),
        holdsCard(STITCH, 2, true),
      );
      const said = bench.diagnostics.map((d) => d.problem.code);
      expect(
        said.some((code) => code === 'POCKET_TOO_SHALLOW' || code === 'POCKET_NOT_MEASURABLE'),
      ).toBe(true);
    },
  );
});

describe('F — a card meant to stand proud of its pocket', () => {
  const tooShallow = (depthMm: number): Expected => ({
    code: 'POCKET_TOO_SHALLOW',
    severity: 'warning',
    on: STITCH,
    facts: { featureId: STITCH, content: 'id-1', depthMm, neededMm: 53.98 },
  });

  it('SF-F1 · a shallow pocket that leaves the card standing proud says nothing about depth', () => {
    // The card holder's pocket: 44.3487 mm below the opening for a 53.98 mm card.
    new Bench()
      .do(...cardPocket('pocket', { width: 105, height: 47.3487 }), holdsCard(STITCH, 4))
      .expect([]);
  });

  it('SF-F2 · asking for the card to go in fully says it is too shallow, and clearing it says nothing again', () => {
    new Bench()
      .do(...cardPocket('pocket', { width: 105, height: 47.3487 }), holdsCard(STITCH, 4))
      .do(holdsCard(STITCH, 4, true))
      .expect([tooShallow(44.3487)], 'held fully')
      .do(holdsCard(STITCH, 4, false))
      .expect([], 'allowed to stand proud');
  });

  it('SF-F3 · a pocket deep enough below its opening holds the card fully, its ease counted only across', () => {
    // 57 mm below the opening for a 53.98 mm card; 4 mm of ease is not added to depth (D22).
    new Bench()
      .do(...cardPocket('pocket', { width: 100, height: 60 }), holdsCard(STITCH, 4, true))
      .expect([]);
  });

  it('SF-F4 · the depth limit is the card’s height exactly: at it passes, a storage step under it does not', () => {
    // Height 56.98 → 53.98 below the opening.
    new Bench()
      .do(...cardPocket('pocket', { width: 100, height: 56.98 }), holdsCard(STITCH, 0, true))
      .expect([]);
    new Bench()
      .do(
        ...cardPocket('pocket', { width: 100, height: 56.98 - QUANTUM_MM }),
        holdsCard(STITCH, 0, true),
      )
      .expect([tooShallow(53.98 - QUANTUM_MM)]);
  });
});
