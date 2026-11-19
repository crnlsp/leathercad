import {
  addCutOut,
  addHoleRow,
  addMarkingLine,
  rectShape,
  setDerivation,
  translateFeatures,
} from '@leathercad/document';
import { findFeature } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  at,
  drawRectangle,
  holdsCard,
  holesOf,
  punchHoles,
  resize,
  setHoles,
  setInset,
  sew,
  stitchAllRound,
  statesNothing,
  stitchOf,
} from '../harness/actions.js';
import { Bench } from '../harness/bench.js';
import { checkMatrixClaims } from '../harness/coverage.js';
import { cardPocket } from './support.js';

/**
 * When something a check reads cannot be built (X), and the universal rules
 * where pieces meet a cut-out or a row of holes (A, J). A check that cannot
 * run must leave its cause said and its requirement kept, never a silent pass
 * that outlives the fix.
 */

checkMatrixClaims();

describe('X — what a check reads cannot be built', () => {
  it('SF-X1 · stitching inset past its piece fails at the root, its requirement waits unchecked, is checked again once it builds, and can be taken away while it fails', () => {
    // 90 mm wide: a 46 mm inset meets itself. The holes follow the line that
    // failed. The requirement is not judged while there is no line to judge,
    // and is not lost: brought back to 3 mm, the pocket is too narrow again.
    const collapsed = [
      {
        code: 'OFFSET_COLLAPSED',
        severity: 'error',
        on: stitchOf('pocket'),
        facts: { distanceMm: 46 },
      },
      {
        code: 'SOURCE_FAILED',
        severity: 'error',
        on: holesOf('pocket'),
        related: [stitchOf('pocket')],
      },
    ] as const;
    const bench = new Bench()
      .do(...cardPocket('pocket', { width: 90, height: 60 }), holdsCard(stitchOf('pocket'), 2))
      .do(setInset('pocket', 46))
      .expect(collapsed, 'with the stitching collapsed');
    expect(findFeature(bench.project, stitchOf('pocket'))?.feature).toMatchObject({
      holds: { content: { kind: 'id-1' }, easeMm: 2 },
    });
    bench.do(setInset('pocket', 3)).expect(
      [
        {
          code: 'POCKET_TOO_NARROW',
          severity: 'warning',
          on: stitchOf('pocket'),
          facts: { widthMm: 84, neededMm: 87.6 },
        },
      ],
      'with the stitching back',
    );

    // L3 (Q49): Properties keeps *Holds* while the line fails, so the maker can
    // take it away there, in one undo step. Undone, it is back and still
    // waiting; taken away again and the line rebuilt, nothing is checked.
    bench
      .do(setInset('pocket', 46))
      .do(statesNothing(stitchOf('pocket')))
      .expect(collapsed, 'taken away while the stitching is collapsed');
    expect(findFeature(bench.project, stitchOf('pocket'))?.feature).not.toHaveProperty('holds');
    bench.undo().expect(collapsed, 'taking it away undone');
    expect(findFeature(bench.project, stitchOf('pocket'))?.feature).toMatchObject({
      holds: { content: { kind: 'id-1' }, easeMm: 2 },
    });
    bench.redo().do(setInset('pocket', 3)).expect([], 'the stitching back, with nothing stated');
  });

  it('SF-X2 · a tooth longer than the iron’s pitch fails its hole set, its seam says the side is missing, and a true tooth mends both', () => {
    const bench = new Bench().do(
      drawRectangle('back', { x: 0, y: 0, width: 100, height: 60 }),
      stitchAllRound('back', 3),
      punchHoles('back'),
      drawRectangle('front', { x: 120, y: 0, width: 100, height: 60 }),
      stitchAllRound('front', 3),
      punchHoles('front'),
      sew({
        id: 'bottoms',
        a: { holeSetId: holesOf('back'), stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
        b: {
          holeSetId: holesOf('front'),
          stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 },
        },
      }),
    );
    bench
      .do(
        setHoles(holesOf('front'), {
          tooth: { kind: 'slit', lengthMm: 5, widthMm: 0.4, slantDeg: 45 },
        }),
      )
      .expect(
        [
          {
            code: 'SEAM_SIDE_MISSING',
            severity: 'error',
            on: holesOf('back'),
            related: [holesOf('front')],
            facts: { seamId: 'bottoms', holeSetId: holesOf('front') },
          },
          {
            code: 'PARAMETER_INVALID',
            severity: 'error',
            on: holesOf('front'),
            facts: { parameter: 'tooth length', value: 5, maximum: 3.85 },
          },
        ],
        'with a 5 mm slit on a 3.85 mm iron',
      )
      .do(
        setHoles(holesOf('front'), {
          tooth: { kind: 'slit', lengthMm: 1.925, widthMm: 0.4, slantDeg: 45 },
        }),
      )
      .expect([], 'with the French tooth of that iron');
  });
});

describe('A — card slots and the stitching around them', () => {
  /** A lining with a card slot: 86 × 3 mm, wholly inside it. */
  const lined = () =>
    new Bench().do(
      drawRectangle('lining', { x: 0, y: 0, width: 100, height: 60, name: 'Lining' }),
      addCutOut('lining', 'slot', { kind: 'shape', shape: rectShape(at(7, 40), 86, 3) }),
    );

  it('SF-A10 · a card slot inside its piece says nothing; dragged across the edge it cuts nothing, an error; undo clears it', () => {
    lined()
      .expect([], 'inside')
      .do(translateFeatures(['slot'], at(0, 19)))
      .expect(
        [{ code: 'CUT_OUT_OUTSIDE_PART', severity: 'error', on: 'slot', location: 'path' }],
        'across the top edge',
      )
      .undo()
      .expect([], 'after undo');
  });

  it('SF-A11 · stitching that runs over a card slot has its holes there off the leather, and its line warned of', () => {
    // The slot moved to y 55–58 lies under the top stitch line at y 57. The
    // top run is 94 mm in 24 gaps, holes at x = 3 + 3.9167 k: those from k = 2
    // (10.83) to k = 22 (89.17) fall in the slot's 7–93 mm, 21 holes.
    lined()
      .do(stitchAllRound('lining', 3), punchHoles('lining'))
      .expect([], 'clear of the slot')
      .do(translateFeatures(['slot'], at(0, 15)))
      .expect(
        [
          {
            code: 'OUTSIDE_PART',
            severity: 'warning',
            on: stitchOf('lining'),
            facts: { what: 'line' },
            location: 'path',
          },
          {
            code: 'OUTSIDE_PART',
            severity: 'error',
            on: holesOf('lining'),
            facts: { what: 'holes' },
            location: { points: 21 },
          },
        ],
        'with the slot under the stitching',
      )
      .undo()
      .expect([], 'after undo');
  });
});

describe('J — a strap and a belt', () => {
  it('SF-J5 · a strap 13 mm wide notes its short ends spaced unlike its sides; at 14 mm they agree', () => {
    // Stitched 3 mm in at 3.85: the sides 94 mm in 24 gaps (3.917 mm). The ends
    // are 7 mm, 2 gaps of 3.5 mm — 0.42 mm apart, over 5 % of the pitch (0.19);
    // at 14 mm wide, 8 mm in 2 gaps of 4.0, 0.08 mm apart.
    new Bench()
      .do(
        drawRectangle('strap', { x: 0, y: 0, width: 100, height: 13, name: 'Strap' }),
        stitchAllRound('strap', 3),
        punchHoles('strap'),
      )
      .expect(
        [
          {
            code: 'HOLE_SPACING_UNEVEN',
            severity: 'info',
            on: holesOf('strap'),
            facts: { narrowestMm: 3.5, widestMm: 94 / 24 },
          },
        ],
        '13 mm wide',
      )
      .do(resize('strap', { height: 14 }))
      .expect([], '14 mm wide');
  });

  it('SF-J6 · a belt’s buckle holes punched closer than their size run together; spaced out again they do not', () => {
    // A row of 4 mm holes along the belt's centre line, at 25 mm and then 3 mm.
    const row = { type: 'hole-row', radiusMm: 2 } as const;
    new Bench()
      .do(
        drawRectangle('belt', { x: 0, y: 0, width: 300, height: 30, radius: 15, name: 'Belt' }),
        addMarkingLine('belt', 'holes-line', {
          kind: 'path',
          path: PathOps.polyline([at(200, 15), at(275, 15)], false),
        }),
        addHoleRow('belt', 'buckle-holes', 'holes-line'),
      )
      .expect([], 'at 25 mm')
      .do(setDerivation('buckle-holes', { ...row, pitchMm: 3 }))
      .expect(
        [
          {
            code: 'HOLES_OVERLAP',
            severity: 'warning',
            on: 'buckle-holes',
            facts: { spacingMm: 3, diameterMm: 4 },
          },
        ],
        'at 3 mm',
      )
      .do(setDerivation('buckle-holes', { ...row, pitchMm: 25 }))
      .expect([], 'at 25 mm again');
  });
});
