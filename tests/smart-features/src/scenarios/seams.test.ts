import { deleteFeatures } from '@leathercad/document';
import { seamVerdict, type Project, type Seam } from '@leathercad/domain';
import { QUANTUM_MM } from '@leathercad/core';
import { describe, expect, it } from 'vitest';

import {
  drawRectangle,
  holesOf,
  punchHoles,
  resize,
  setHoles,
  sew,
  stitchAllRound,
} from '../harness/actions.js';
import { Bench, type Action } from '../harness/bench.js';
import { checkMatrixClaims } from '../harness/coverage.js';
import { within, type Expected } from '../harness/expectDiagnostics.js';
import { cardPocket } from './support.js';

/**
 * Pieces sewn together (G). Two panels, each stitched 3 mm in all round at the
 * default 3.85 mm iron with a hole at every corner, sewn along their bottoms
 * (corner 4 to corner 1, as Properties numbers them). A bottom of width W
 * stitches W − 6 mm, divided into round((W − 6) / 3.85) equal gaps:
 * - W 100 → 94 mm, 24 gaps of 3.9167 mm, 25 holes;
 * - W 97 → 91 mm, 24 gaps of 3.7917 mm, 25 holes: the last pair 3 mm apart;
 * - W 99.5 → 93.5 mm, 24 gaps: the last pair 0.5 mm apart, the limit (D4);
 * - W 80 → 74 mm, 19 gaps, 20 holes.
 */

checkMatrixClaims();

const BOTTOM = { kind: 'between', fromAnchor: 3, toAnchor: 0 } as const;

const panel = (piece: string, width: number, x = 0): Action[] => [
  drawRectangle(piece, { x, y: 0, width, height: 60 }),
  stitchAllRound(piece, 3),
  punchHoles(piece),
];

const bottoms: Seam = {
  id: 'bottom-seam',
  a: { holeSetId: holesOf('back'), stretch: BOTTOM },
  b: { holeSetId: holesOf('front'), stretch: BOTTOM },
};

const sewn = (frontWidth: number) =>
  new Bench().do(...panel('back', 100), ...panel('front', frontWidth, 120), sew(bottoms));

const verdictOf = (project: Project) => seamVerdict(project, project.seams![0]!);

/** Side a names the diagnostic; side b is the related feature (domain-model §8.6). */
const onTheSeam = {
  on: holesOf('back'),
  related: [holesOf('front')],
} as const;

describe('G — pieces sewn together', () => {
  it('SF-G1 · two panels sewn along matching bottoms say nothing, their pairing kept as a note', () => {
    const bench = sewn(100).expect([]);
    expect(verdictOf(bench.project)).toMatchObject({
      ok: true,
      countA: 25,
      countB: 25,
      severity: 'info',
    });
  });

  it('SF-G2 · a front 20 mm narrower cannot pair its holes: an error naming both sides and their counts', () => {
    sewn(80).expect([
      {
        code: 'SEAM_HOLE_COUNT_MISMATCH',
        severity: 'error',
        ...onTheSeam,
        facts: {
          seamId: 'bottom-seam',
          a: { partId: 'back', count: 25, lengthMm: 94 },
          b: { partId: 'front', count: 20, lengthMm: 74 },
        },
      },
    ]);
  });

  it('SF-G3 · equal counts drifting 3 mm apart by the last pair warn, and widening the front to match clears it', () => {
    const drift: Expected = {
      code: 'SEAM_HOLES_DRIFT',
      severity: 'warning',
      ...onTheSeam,
      facts: {
        seamId: 'bottom-seam',
        a: { count: 25, lengthMm: 94 },
        b: { count: 25, lengthMm: 91 },
        worstPair: 25,
        driftMm: 3,
      },
    };
    sewn(97)
      .expect([drift], 'with a 97 mm front')
      .do(resize('front', { width: 100 }))
      .expect([], 'with fronts matched')
      .undo()
      .expect([drift], 'after undo');
  });

  it('SF-G9 · pricking one piece with a finer iron breaks the pairing, and going back to the first iron mends it', () => {
    // At a 3.00 mm iron the front's 94 mm takes 31 gaps: 32 holes against the back's 25.
    sewn(100)
      .do(setHoles(holesOf('front'), { pitchMm: 3 }))
      .expect(
        [
          {
            code: 'SEAM_HOLE_COUNT_MISMATCH',
            severity: 'error',
            ...onTheSeam,
            facts: { a: { count: 25 }, b: { count: 32 } },
          },
        ],
        'with a 3 mm iron on the front',
      )
      .do(setHoles(holesOf('front'), { pitchMm: 3.85 }))
      .expect([], 'with the same iron on both');
  });

  it('SF-G4 · a drift of exactly 0.5 mm is within the limit; a storage step more is not', () => {
    sewn(99.5).expect([], 'at the limit');
    sewn(99.5 - QUANTUM_MM).expect([
      {
        code: 'SEAM_HOLES_DRIFT',
        severity: 'warning',
        ...onTheSeam,
        facts: { driftMm: within(0.5 + QUANTUM_MM, 1e-6) },
      },
    ]);
  });

  it('SF-G5 · a side whose length changes elsewhere — the panels’ heights — leaves the seam as it was', () => {
    sewn(97)
      .do(resize('front', { height: 80 }), resize('back', { height: 45 }))
      .expect([
        {
          code: 'SEAM_HOLES_DRIFT',
          severity: 'warning',
          ...onTheSeam,
          facts: { driftMm: 3 },
        },
      ]);
  });

  it('SF-G6 · deleting a sewn side’s holes, confirmed, takes the seam with them, and undo brings both back', () => {
    // The delete dialog lists the seam first and the maker confirms (X2); a
    // delete that is not confirmed changes nothing.
    const bench = sewn(80).do(deleteFeatures([holesOf('front')], 'delete-dependents'));
    bench.expect([], 'once the front’s holes are gone');
    expect(bench.project.seams ?? []).toEqual([]);
    bench.undo().expect([{ code: 'SEAM_HOLE_COUNT_MISMATCH', severity: 'error', ...onTheSeam }]);
  });

  it('SF-G7 · a seam whose side was deleted by an older version is kept and said to be missing', () => {
    // 1.6 keeps a seam it does not know, and its own delete leaves it behind (plan D2).
    const project = sewn(100).project;
    const edited: Project = {
      ...project,
      parts: project.parts.map((part) => ({
        ...part,
        features: part.features.filter((f) => f.id !== holesOf('front')),
      })),
    };
    new Bench(edited).saveAndReopen().expect([
      {
        code: 'SEAM_SIDE_MISSING',
        severity: 'error',
        ...onTheSeam,
        facts: { seamId: 'bottom-seam', holeSetId: holesOf('front') },
      },
    ]);
  });

  it('SF-G8 · a side that follows the other’s length past the end of its own line is an error, not clamped', () => {
    // The back's 300 mm all round, followed from the start of an open pocket
    // stitching 54 + 94 + 54 = 202 mm long.
    new Bench()
      .do(
        ...panel('back', 100),
        ...cardPocket('pocket', { width: 100, height: 60, x: 120 }),
        sew({
          id: 'too-long',
          a: { holeSetId: holesOf('back'), stretch: { kind: 'whole' } },
          b: {
            holeSetId: holesOf('pocket'),
            stretch: { kind: 'from', anchor: 'start', toward: 'next' },
          },
        }),
      )
      .expect([
        {
          code: 'SEAM_RUNS_OFF_THE_LINE',
          severity: 'error',
          on: holesOf('back'),
          related: [holesOf('pocket')],
          facts: {
            seamId: 'too-long',
            holeSetId: holesOf('pocket'),
            lengthMm: 296,
            availableMm: 202,
          },
        },
      ]);
  });
});
