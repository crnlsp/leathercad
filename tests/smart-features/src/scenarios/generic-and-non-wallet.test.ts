import {
  addHoleRow,
  addMarkingLine,
  addTextLabel,
  deleteFeatures,
  translateFeatures,
  type Command,
} from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  at,
  drawOutline,
  drawRectangle,
  drawStitching,
  holesOf,
  outlineOf,
  punchHardware,
  punchHoles,
  setInset,
  stitchAllRound,
  stitchOf,
} from '../harness/actions.js';
import { Bench } from '../harness/bench.js';
import { stitchReading } from './support.js';

/**
 * Drawing with no purpose declared (A) and leatherwork that is not a wallet
 * (J). The universal rules apply wherever their geometry is; nothing about
 * pockets, cards or seams is said, because nothing was declared.
 */

const fourRectangles: Command[] = [0, 1, 2, 3].map((i) =>
  drawRectangle(`r${i}`, { x: (i % 2) * 120, y: Math.floor(i / 2) * 80, width: 100, height: 60 }),
);

describe('A — shapes drawn with no purpose declared', () => {
  it('SF-A1 · four rectangles on a blank project say nothing at all', () => {
    new Bench().do(...fourRectangles).expect([]);
  });

  it('SF-A2 · stitched all round with holes, they still say nothing, and none reads as a pocket', () => {
    const bench = new Bench().do(
      ...fourRectangles,
      ...[0, 1, 2, 3].flatMap((i) => [stitchAllRound(`r${i}`, 3), punchHoles(`r${i}`)]),
    );
    bench.expect([]);
    for (const i of [0, 1, 2, 3])
      expect(stitchReading(bench.project, stitchOf(`r${i}`))).toBeNull();
  });

  it('SF-A3 · a piece whose outline is deleted is noted as empty, and undo takes the note away', () => {
    new Bench()
      .do(...fourRectangles, deleteFeatures([outlineOf('r2')]))
      .expect([{ code: 'EMPTY_PART', severity: 'info', on: 'part:r2' }], 'with r2 emptied')
      .undo()
      .expect([], 'after undo');
  });

  it('SF-A4 · stitching 1 mm from the edge is too near it, on its holes alone; 3 mm in clears it', () => {
    new Bench()
      .do(fourRectangles[0]!, stitchAllRound('r0', 1), punchHoles('r0'))
      .expect(
        [
          {
            code: 'HOLE_TOO_CLOSE_TO_EDGE',
            severity: 'warning',
            on: holesOf('r0'),
            facts: { clearanceMm: 1, minimumMm: 1.5 },
          },
        ],
        'at 1 mm',
      )
      .do(setInset('r0', 3))
      .expect([], 'at 3 mm');
  });

  it('SF-A5 · a rivet whose rim comes within 1 mm of the edge is too near it, with no purpose declared', () => {
    // A 4 mm punch centred 3 mm in: its rim is 1 mm from the edge.
    new Bench().do(fourRectangles[0]!, punchHardware('r0', 'rivet', at(50, 3), 4)).expect([
      {
        code: 'HOLE_TOO_CLOSE_TO_EDGE',
        severity: 'warning',
        on: 'rivet',
        facts: { clearanceMm: 1, minimumMm: 1.5 },
      },
    ]);
  });

  it('SF-A6 · an outline drawn crossing itself is an error where it crosses, and nothing else', () => {
    new Bench().do(drawOutline('bow', [at(0, 0), at(60, 40), at(60, 0), at(0, 40)])).expect([
      {
        code: 'CONTOUR_SELF_INTERSECTS',
        severity: 'error',
        on: outlineOf('bow'),
        facts: { crossings: 1 },
      },
    ]);
  });

  it('SF-A7 · a run too short for its iron is a spacing warning, not a pocket or a seam', () => {
    // 5.5 mm takes one gap at a 3.85 mm iron: 5.5 mm apart, 43 % over the pitch.
    new Bench()
      .do(fourRectangles[0]!, drawStitching('r0', [at(20, 30), at(25.5, 30)]), punchHoles('r0'))
      .expect([
        {
          code: 'HOLE_SPACING_DEVIATION',
          severity: 'warning',
          on: holesOf('r0'),
          facts: { achievedMm: 5.5, pitchMm: 3.85 },
        },
      ]);
  });

  it('SF-A8 · a label too small to read on paper is a warning on the label', () => {
    new Bench()
      .do(fourRectangles[0]!, addTextLabel('r0', 'label', at(10, 10), 'Inside', 1))
      .expect([
        {
          code: 'TEXT_TOO_SMALL_TO_PRINT',
          severity: 'warning',
          on: 'label',
          facts: { minimumMm: 1.5 },
        },
      ]);
  });
  it('SF-A9 · deleting an outline but keeping its stitching as drawn leaves a piece with no edge: an error', () => {
    // The delete dialog's *Keep as drawn*: the stitching and holes stay, with
    // nothing left to cut them from (DR1). Nothing else is judged without an edge.
    new Bench()
      .do(
        fourRectangles[0]!,
        stitchAllRound('r0', 3),
        punchHoles('r0'),
        deleteFeatures([outlineOf('r0')], 'freeze-dependents'),
      )
      .expect([{ code: 'PART_HAS_NO_OUTER_CONTOUR', severity: 'error', on: 'part:r0' }])
      .undo()
      .expect([], 'after undo');
  });
});

describe('J — leatherwork that is not a wallet', () => {
  it('SF-J1 · a key fob as shipped says nothing, about pockets, seams or anything else', () => {
    Bench.open('key-fob').expect([]);
  });

  // The strap's round ends have a 13 mm radius about (13, 13) and (127, 13).
  // The rivet, 4 mm across at (14, 13), moved 11 mm left sits 3 mm from its
  // end: a 1 mm rim. Its fold mirror follows it to (137, 13), as near the other.
  const pushedToTheEnd = translateFeatures(['strap-rivet-a'], at(-11, 0));

  it('SF-J4 · (evidence for SF-J3) the fold mirror follows the rivet to 3 mm from the far end', () => {
    const bench = Bench.open('key-fob').do(pushedToTheEnd);
    const mirrored = evaluate(bench.project)
      .parts.flatMap((p) => p.features)
      .find((f) => f.feature.id === 'strap-rivet-b');
    if (mirrored?.ok !== true) throw new Error('the mirrored rivet must resolve');
    const box = PathOps.bbox(mirrored.path)!;
    expect((box.minX + box.maxX) / 2).toBeCloseTo(137, 9);
    expect(box.maxX - box.minX).toBeCloseTo(4, 9);
  });

  /**
   * KNOWN DEFECT SF-D3 (docs/smart-features.md §7). A hardware hole that is a
   * mirror — across a fold, as the key fob's second rivet is, or of a whole
   * piece — is never asked where it sits: `punchesOf` in validate.ts reads a
   * hardware hole only when its source is a drawn circle. So the mirrored rivet
   * 3 mm from the far end, or wholly off the leather, is not reported.
   */
  it.fails(
    'SF-J3 · a rivet pushed toward the end warns on both halves of the fold, and nothing else',
    () => {
      const nearTheEnd = {
        code: 'HOLE_TOO_CLOSE_TO_EDGE',
        severity: 'warning',
        facts: { clearanceMm: 1, minimumMm: 1.5 },
      } as const;
      Bench.open('key-fob')
        .do(pushedToTheEnd)
        .expect([
          { ...nearTheEnd, on: 'strap-rivet-a' },
          { ...nearTheEnd, on: 'strap-rivet-b' },
        ]);
    },
  );

  it('SF-J2 · a strap stitched all round with a row of buckle holes says nothing, and reads as no pocket', () => {
    const bench = new Bench().do(
      drawRectangle('strap', { x: 0, y: 0, width: 250, height: 20, radius: 10, name: 'Strap' }),
      stitchAllRound('strap', 3),
      punchHoles('strap'),
      addMarkingLine('strap', 'holes-line', {
        kind: 'path',
        path: PathOps.polyline([at(150, 10), at(225, 10)], false),
      }),
      addHoleRow('strap', 'buckle-holes', 'holes-line'),
    );
    bench.expect([]);
    expect(stitchReading(bench.project, stitchOf('strap'))).toBeNull();
  });
});
