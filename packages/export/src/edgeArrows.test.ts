import { DEFAULT_SETTINGS, ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { RectOps } from '@leathercad/geometry';
import { PAPER_FURNITURE } from '@leathercad/render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { edgeArrows, neighboursOf, type EdgeArrow } from './edgeArrows.js';
import type { Tile } from './paginate.js';
import { pageSetupFor } from './paper.js';
import { PRINT_STYLES, type ExportPart } from './scene.js';
import { planSheets, type SheetPlan } from './sheetPlan.js';

const SETUPS = PAPER_NAMES.flatMap((paper) =>
  ORIENTATIONS.map((orientation) => pageSetupFor({ ...DEFAULT_SETTINGS, paper, orientation })),
);

function part(widthMm: number, heightMm: number): ExportPart {
  return {
    id: 'p',
    name: 'Panel',
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x: -17, y: 23 }, { x: -17 + widthMm, y: 23 + heightMm }),
    paths: [{ role: 'cut', style: PRINT_STYLES.cut, path: { segments: [], closed: true } }],
    texts: [],
  };
}

/** A taped part on some paper, at random: its plan. */
const taped = fc
  .record({
    setup: fc.constantFrom(...SETUPS),
    widthMm: fc.double({ min: 30, max: 1600, noNaN: true }),
    heightMm: fc.double({ min: 30, max: 1600, noNaN: true }),
  })
  .map(({ setup, widthMm, heightMm }) =>
    planSheets({ projectName: 'Test', parts: [part(widthMm, heightMm)] }, setup),
  );

/** Every tiled sheet of the plan with its 1-based number and its arrows. */
function tiledSheets(plan: SheetPlan) {
  return plan.sheets.flatMap((sheet) =>
    sheet.tile === undefined
      ? []
      : [
          {
            number: sheet.index + 1,
            tile: sheet.tile,
            arrows: edgeArrows(sheet.tile, neighboursOf(plan, sheet.tile)),
          },
        ],
  );
}

/** The sheet printing the tile at (row, column), looked up afresh, numbered from 1. */
function sheetAt(plan: SheetPlan, row: number, column: number): number | undefined {
  const index = plan.sheets.findIndex((s) => s.tile?.row === row && s.tile.column === column);
  return index < 0 ? undefined : index + 1;
}

const OFFSETS = { above: [-1, 0], left: [0, -1], right: [0, 1], below: [1, 0] } as const;
const DIRECTION = {
  above: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  below: { x: 0, y: -1 },
};

/** The join an arrow points at, from the tile's own joins. */
function joinOf(tile: Tile, arrow: EdgeArrow): number {
  if (arrow.side === 'left') return tile.joinsMm.x[0]!;
  if (arrow.side === 'right') return tile.joinsMm.x.at(-1)!;
  if (arrow.side === 'above') return tile.joinsMm.y[0]!;
  return tile.joinsMm.y.at(-1)!;
}

describe('edge arrows on a taped sheet (7.2)', () => {
  it('points at every edge with a neighbour, naming that neighbour’s sheet, and at no other', () => {
    fc.assert(
      fc.property(taped, (plan) => {
        for (const { tile, arrows } of tiledSheets(plan)) {
          const expected = (['above', 'left', 'right', 'below'] as const).flatMap((side) => {
            const [dr, dc] = OFFSETS[side];
            const sheet = sheetAt(plan, tile.row + dr, tile.column + dc);
            return sheet === undefined ? [] : [{ side, sheet }];
          });
          expect(arrows.map(({ side, sheet }) => ({ side, sheet }))).toEqual(expected);
        }
      }),
    );
  });

  it('gives every shared edge exactly one pair, facing each other across the join', () => {
    fc.assert(
      fc.property(taped, (plan) => {
        const sheets = tiledSheets(plan);
        const on = (number: number) => sheets.find((s) => s.number === number)!;
        for (const { number, tile, arrows } of sheets) {
          for (const arrow of arrows) {
            const other = on(arrow.sheet);
            const opposite = { above: 'below', below: 'above', left: 'right', right: 'left' }[
              arrow.side
            ];
            const back = other.arrows.filter((a) => a.side === opposite);
            expect(back).toHaveLength(1);
            expect(back[0]!.sheet).toBe(number);
            // The same join on both sheets, one arrow either side of it.
            const join = joinOf(tile, arrow);
            expect(joinOf(other.tile, back[0]!)).toBe(join);
            const axis = arrow.side === 'left' || arrow.side === 'right' ? 'x' : 'y';
            expect(Math.sign(arrow.tip[axis] - join)).toBe(-Math.sign(back[0]!.tip[axis] - join));
          }
        }
      }),
    );
  });

  it('is square to its join, points at it, and stops short of it on its own side', () => {
    const { lengthMm, gapMm } = PAPER_FURNITURE.edgeArrow;
    fc.assert(
      fc.property(taped, (plan) => {
        for (const { tile, arrows } of tiledSheets(plan)) {
          for (const arrow of arrows) {
            const d = DIRECTION[arrow.side];
            const along = { x: arrow.tip.x - arrow.tail.x, y: arrow.tip.y - arrow.tail.y };
            expect(along.x).toBeCloseTo(d.x * lengthMm, 9);
            expect(along.y).toBeCloseTo(d.y * lengthMm, 9);
            const axis = d.x !== 0 ? 'x' : 'y';
            const sign = d.x + d.y;
            expect((joinOf(tile, arrow) - arrow.tip[axis]) * sign).toBeCloseTo(gapMm, 9);
            // Inside the sheet's window, which is what of the part it shows.
            for (const p of [arrow.tip, arrow.tail]) {
              expect(RectOps.containsPoint(tile.windowMm, p)).toBe(true);
            }
          }
        }
      }),
    );
  });

  it('keeps clear of every registration cross', () => {
    const arm = PAPER_FURNITURE.crossArmMm;
    const { headHalfWidthMm } = PAPER_FURNITURE.edgeArrow;
    fc.assert(
      fc.property(taped, (plan) => {
        for (const { tile, arrows } of tiledSheets(plan)) {
          const w = tile.windowMm;
          const crosses = [
            ...tile.joinsMm.x.flatMap((x) => [
              { x, y: (w.minY + w.maxY) / 2 },
              ...tile.joinsMm.y.map((y) => ({ x, y })),
            ]),
            ...tile.joinsMm.y.map((y) => ({ x: (w.minX + w.maxX) / 2, y })),
          ];
          for (const arrow of arrows) {
            const ink = RectOps.expand(RectOps.fromCorners(arrow.tip, arrow.tail), headHalfWidthMm);
            for (const c of crosses) {
              const cross = { minX: c.x - arm, minY: c.y - arm, maxX: c.x + arm, maxY: c.y + arm };
              expect(RectOps.intersects(ink, cross)).toBe(false);
            }
          }
        }
      }),
    );
  });

  it('draws none on a sheet printed whole', () => {
    const plan = planSheets({ projectName: 'Test', parts: [part(60, 40)] }, SETUPS[0]!);
    expect(tiledSheets(plan)).toEqual([]);
  });
});
