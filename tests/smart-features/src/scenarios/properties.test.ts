import { EPS_LENGTH } from '@leathercad/core';
import {
  seamVerdict,
  type Diagnostic,
  type PocketRequirement,
  type Seam,
} from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  at,
  drawRectangle,
  drawStitching,
  holdsCard,
  holds,
  holesOf,
  movePiece,
  FROM_THE_VERY_ENDS,
  punchHoles,
  resize,
  setInset,
  sew,
  statesNothing,
  stitchAllRound,
  stitchLeavingOpen,
  stitchOf,
  turnPiece,
  type Side,
} from '../harness/actions.js';
import { Bench } from '../harness/bench.js';
import { cardPocket, depthFromOpening, stitchReading } from './support.js';

/**
 * What holds across every project of a kind, not one example (§3.5 of
 * docs/smart-features.md). Each property says its assumptions: these hold for
 * the constructions named, and some are not true in general.
 *
 * Sizes are what a maker types, to a tenth of a millimetre.
 */

const STITCH = stitchOf('pocket');
const tenths = (min: number, max: number) =>
  fc.integer({ min: min * 10, max: max * 10 }).map((t) => t / 10);

const requirement: fc.Arbitrary<PocketRequirement> = fc.record({
  content: fc.oneof(
    fc.constant({ kind: 'id-1' as const }),
    fc.record({
      kind: fc.constant('size' as const),
      widthMm: tenths(40, 130),
      heightMm: tenths(30, 100),
    }),
  ),
  easeMm: tenths(0, 8),
  fully: fc.boolean(),
});

/** A turn that turns: a few thousandths of a degree and up, either way. */
const turn = fc
  .double({ min: -Math.PI, max: Math.PI, noNaN: true })
  .filter((angle) => Math.abs(angle) > 1e-4);

const pocketSize = fc.record({ width: tenths(60, 130), height: tenths(30, 90) });

const pocket = (size: { width: number; height: number }, wanted?: PocketRequirement) =>
  new Bench().do(
    ...cardPocket('pocket', size),
    ...(wanted === undefined ? [] : [holds(STITCH, wanted)]),
  );

/** The rules that say where a hole stands against the cut edge (DR2). */
const EDGE_CODES: readonly string[] = ['OUTSIDE_PART', 'HOLE_TOO_CLOSE_TO_EDGE'];

const said = (bench: Bench, code: string) => bench.diagnostics.some((d) => d.problem.code === code);

/**
 * Two diagnostic lists say the same thing: the same problems, in the same
 * order, at the same severity, on the same features, with every measurement
 * within `EPS_LENGTH` — the tolerance the rules themselves compare with.
 */
function expectSameVerdicts(a: readonly Diagnostic[], b: readonly Diagnostic[]) {
  const shape = (list: readonly Diagnostic[]) =>
    list.map((d) => `${d.problem.code} ${d.severity} ${d.featureId ?? d.partId}`);
  expect(shape(b)).toEqual(shape(a));
  a.forEach((d, i) => expectSameFacts(d.problem.facts, b[i]!.problem.facts));
}

function expectSameFacts(a: unknown, b: unknown) {
  if (typeof a === 'number') {
    expect(Math.abs(a - (b as number))).toBeLessThanOrEqual(EPS_LENGTH);
  } else if (a !== null && typeof a === 'object') {
    for (const key of Object.keys(a)) {
      expectSameFacts((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
    }
  } else {
    expect(b).toBe(a);
  }
}

describe('properties of a pocket that holds what it must', () => {
  it('a requirement the pocket meets at one width it meets at every greater width', () => {
    // Assumes the pocket is `cardPocket`: its width between stitch lines grows
    // with its width, everything else fixed.
    fc.assert(
      fc.property(pocketSize, tenths(0.1, 30), requirement, (size, wider, wanted) => {
        const passes = !said(pocket(size, wanted), 'POCKET_TOO_NARROW');
        const widened = pocket({ ...size, width: size.width + wider }, wanted);
        if (passes) expect(said(widened, 'POCKET_TOO_NARROW')).toBe(false);
      }),
    );
  });

  it('more ease never makes a narrow pocket wide enough', () => {
    fc.assert(
      fc.property(pocketSize, requirement, tenths(0.1, 10), (size, wanted, more) => {
        const narrow = said(pocket(size, wanted), 'POCKET_TOO_NARROW');
        const eased = pocket(size, { ...wanted, easeMm: wanted.easeMm + more });
        if (narrow) expect(said(eased, 'POCKET_TOO_NARROW')).toBe(true);
      }),
    );
  });

  it('moving and turning the pocket changes nothing it is told', () => {
    // Assumes `cardPocket`, whose holes stand 3 mm clear of every edge; the
    // next property is the pocket with square corners, its end holes on one.
    fc.assert(
      fc.property(
        pocketSize,
        requirement,
        turn,
        tenths(-500, 500),
        tenths(-500, 500).filter((dy) => dy !== 0),
        (size, wanted, angle, dx, dy) => {
          const bench = pocket(size, wanted);
          const before = bench.diagnostics;
          bench.do(turnPiece('pocket', angle, at(17, 23)), movePiece('pocket', at(dx, dy)));
          expectSameVerdicts(before, bench.diagnostics);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('a square-cornered pocket, open on any side, turned and moved, is told one thing about its end holes on the edge', () => {
    // Its end holes are on the cut edge (SF-K2). Within a storage quantum of
    // an edge is on the leather (D29): one 0 mm warning, whichever side is
    // open, however the piece is turned (Q44).
    const squarePocket = (size: { width: number; height: number }, open: Side) =>
      new Bench().do(
        drawRectangle('pocket', { x: 0, y: 0, ...size }),
        stitchLeavingOpen('pocket', open, 3),
        punchHoles('pocket', FROM_THE_VERY_ENDS),
      );
    fc.assert(
      fc.property(
        pocketSize,
        fc.constantFrom<Side>('top', 'right', 'bottom', 'left'),
        turn,
        tenths(-500, 500),
        tenths(-500, 500).filter((dy) => dy !== 0),
        (size, open, angle, dx, dy) => {
          // Across sides, the edge rules alone: a side's length decides how
          // evenly its holes fall, which is DR4's and no part of this.
          const edge = (list: readonly Diagnostic[]) =>
            list.filter((d) => EDGE_CODES.includes(d.problem.code));
          const reference = edge(squarePocket(size, 'bottom').diagnostics);
          expect(reference.map((d) => d.problem.code)).toEqual(['HOLE_TOO_CLOSE_TO_EDGE']);
          const bench = squarePocket(size, open);
          const before = bench.diagnostics;
          expectSameVerdicts(reference, edge(before));
          bench.do(turnPiece('pocket', angle, at(17, 23)), movePiece('pocket', at(dx, dy)));
          expectSameVerdicts(before, bench.diagnostics);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('depth below the opening never grows as the piece’s edge comes down, so too shallow is never wrong', () => {
    // Why POCKET_TOO_SHALLOW is sound and a pass is only an upper bound (limit
    // L1, SF-E4): a pocket's real opening is at or below the edge of the piece
    // its stitching is on. Assumes stitching drawn as an open U well inside the
    // piece, its ends below the edge.
    fc.assert(
      fc.property(
        tenths(40, 100),
        tenths(20, 60),
        tenths(1, 80),
        tenths(0.1, 40),
        (width, depth, above, lower) => {
          const edge = 5 + depth + above;
          const drawn = (height: number) =>
            new Bench().do(
              drawRectangle('pocket', { x: 0, y: 0, width: width + 10, height }),
              drawStitching('pocket', [
                at(5, 5 + depth),
                at(5, 5),
                at(5 + width, 5),
                at(5 + width, 5 + depth),
              ]),
              holdsCard(STITCH, 0, true),
            );
          const tall = drawn(edge);
          const short = drawn(Math.max(5 + depth + 0.1, edge - lower));
          const deep = depthFromOpening(tall.project, 'pocket', STITCH)!;
          const shallow = depthFromOpening(short.project, 'pocket', STITCH)!;
          expect(shallow).toBeLessThanOrEqual(deep + EPS_LENGTH);
          if (said(tall, 'POCKET_TOO_SHALLOW'))
            expect(said(short, 'POCKET_TOO_SHALLOW')).toBe(true);
        },
      ),
    );
  });

  it('stitching drawn in either direction gives the same reading and the same verdict', () => {
    fc.assert(
      fc.property(tenths(40, 110), tenths(30, 70), requirement, (width, depth, wanted) => {
        const u = [at(5, 5 + depth), at(5, 5), at(5 + width, 5), at(5 + width, 5 + depth)];
        const drawn = (points: typeof u) =>
          new Bench().do(
            drawRectangle('pocket', { x: 0, y: 0, width: width + 10, height: depth + 10 }),
            drawStitching('pocket', points),
            holds(STITCH, wanted),
          );
        const forward = drawn(u);
        const backward = drawn([...u].reverse());
        expect(stitchReading(backward.project, STITCH)).toEqual(
          stitchReading(forward.project, STITCH),
        );
        expectSameVerdicts(forward.diagnostics, backward.diagnostics);
      }),
    );
  });

  it('taking a requirement away leaves exactly what the pocket said before it had one', () => {
    fc.assert(
      fc.property(pocketSize, requirement, (size, wanted) => {
        const never = pocket(size).diagnostics;
        expect(pocket(size, wanted).do(statesNothing(STITCH)).diagnostics).toEqual(never);
      }),
    );
  });

  it('a pocket requirement only ever speaks about its own stitching', () => {
    fc.assert(
      fc.property(pocketSize, requirement, (size, wanted) => {
        const without = pocket(size).diagnostics;
        const added = pocket(size, wanted).diagnostics.filter(
          (d) => !d.problem.code.startsWith('POCKET_'),
        );
        expect(added).toEqual(without);
        for (const d of pocket(size, wanted).diagnostics) {
          if (d.problem.code.startsWith('POCKET_')) expect(d.featureId).toBe(STITCH);
        }
      }),
    );
  });

  it('editing another piece never changes what the pocket is told', () => {
    fc.assert(
      fc.property(
        pocketSize,
        requirement,
        // Never the size and inset it already has: an edit that changes nothing is no edit.
        pocketSize.filter((o) => o.width !== 80 || o.height !== 50),
        tenths(1, 8).filter((inset) => inset !== 3),
        (size, wanted, other, inset) => {
          const bench = pocket(size, wanted).do(
            drawRectangle('other', { x: 300, y: 0, width: 80, height: 50 }),
            stitchAllRound('other', 3),
            punchHoles('other'),
          );
          const ofPocket = () => bench.diagnostics.filter((d) => d.partId === 'pocket');
          const before = ofPocket();
          bench.do(resize('other', other), setInset('other', inset));
          expect(ofPocket()).toEqual(before);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('saved and opened again, a requirement and everything said about it come back', () => {
    fc.assert(
      fc.property(pocketSize, requirement, (size, wanted) => {
        const bench = pocket(size, wanted);
        const reopened = bench.saveAndReopen();
        expect(reopened.project).toEqual(bench.project);
        expect(reopened.diagnostics).toEqual(bench.diagnostics);
      }),
      { numRuns: 60 },
    );
  });

  it('undoing a run of requirement edits restores what was said before them, and redoing restores the rest', () => {
    fc.assert(
      fc.property(
        pocketSize,
        fc.array(requirement, { minLength: 1, maxLength: 5 }),
        (size, edits) => {
          const bench = pocket(size);
          const start = bench.diagnostics;
          const applied = edits.filter(
            (wanted, i) => i === 0 || !sameRequirement(wanted, edits[i - 1]!),
          );
          for (const wanted of applied) bench.do(holds(STITCH, wanted));
          const end = bench.diagnostics;
          expect(bench.undo(applied.length).diagnostics).toEqual(start);
          expect(bench.redo(applied.length).diagnostics).toEqual(end);
        },
      ),
    );
  });
});

describe('properties of pieces sewn together', () => {
  const sewnPanels = (backWidth: number, frontWidth: number) => {
    const seam: Seam = {
      id: 'seam',
      a: { holeSetId: holesOf('back'), stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
      b: { holeSetId: holesOf('front'), stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
    };
    return new Bench().do(
      drawRectangle('back', { x: 0, y: 0, width: backWidth, height: 60 }),
      stitchAllRound('back', 3),
      punchHoles('back'),
      drawRectangle('front', { x: 0, y: 100, width: frontWidth, height: 60 }),
      stitchAllRound('front', 3),
      punchHoles('front'),
      sew(seam),
    );
  };
  const panelWidth = tenths(60, 140);

  it('moving and turning either piece leaves the seam’s verdict as it was', () => {
    fc.assert(
      fc.property(
        panelWidth,
        panelWidth,
        fc.constantFrom('back', 'front'),
        turn,
        tenths(-300, 300).filter((d) => d !== 0),
        (back, front, piece, angle, d) => {
          const bench = sewnPanels(back, front);
          const before = bench.diagnostics;
          bench.do(turnPiece(piece, angle, at(d, -d)), movePiece(piece, at(d, d / 2)));
          expectSameVerdicts(before, bench.diagnostics);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('a seam’s pairing is the same read from either side', () => {
    fc.assert(
      fc.property(panelWidth, panelWidth, (back, front) => {
        const { project } = sewnPanels(back, front);
        const seam = project.seams![0]!;
        const one = seamVerdict(project, seam);
        const other = seamVerdict(project, { ...seam, id: 'swapped', a: seam.b, b: seam.a });
        if (!one.ok || !other.ok) throw new Error('both sides resolve');
        expect([other.countA, other.countB]).toEqual([one.countB, one.countA]);
        expect(Math.abs(other.driftMm - one.driftMm)).toBeLessThanOrEqual(EPS_LENGTH);
        expect(other.severity).toBe(one.severity);
      }),
    );
  });
});

/** A requirement that changes nothing is not an edit (the bench refuses those). */
function sameRequirement(a: PocketRequirement, b: PocketRequirement): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
