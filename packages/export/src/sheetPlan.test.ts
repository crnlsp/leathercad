import { ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { RectOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SETUP, pageSetupOf, type PageSetup } from './paper.js';
import { exportPdf } from './pdf/writer.js';
import { PRINT_STYLES, type ExportPart, type ExportScene } from './scene.js';
import {
  describeSheetNumbers,
  describeSheets,
  describeTaped,
  isScaleCheckOnly,
  planEveryPaper,
  planSheets,
  sheetLabel,
} from './sheetPlan.js';

/** A part of the given size whose bounds start at (x, y): where it sits on the board. */
function part(id: string, widthMm: number, heightMm: number, x = 0, y = 0): ExportPart {
  return {
    id,
    name: id,
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x, y }, { x: x + widthMm, y: y + heightMm }),
    paths: [
      {
        role: 'cut',
        style: PRINT_STYLES.cut,
        path: { segments: [], closed: true },
      },
    ],
    texts: [],
  };
}

const scene = (parts: ExportPart[]): ExportScene => ({ projectName: 'Test', parts });

/** The print test's pieces: a panel, a pocket, and a strap too long for A4 portrait. */
const PRINT_TEST = scene([
  part('Outer panel', 100, 78),
  part('Pocket', 96, 60),
  part('Strap', 250, 25),
]);

const SETUPS: PageSetup[] = PAPER_NAMES.flatMap((paper) =>
  ORIENTATIONS.map((orientation) => pageSetupOf(paper, orientation)),
);

/** Where each part ends up on paper: its sheets, and its bounds as placed. */
function placedFootprint(plan: ReturnType<typeof planSheets>) {
  return plan.sheets.flatMap((sheet) =>
    sheet.placements.map((placement) => ({
      sheet: sheet.index,
      id: placement.part.id,
      minX: placement.part.boundsMm.minX + placement.offsetMm.x,
      minY: placement.part.boundsMm.minY + placement.offsetMm.y,
      tile: sheet.tile?.label ?? null,
    })),
  );
}

describe('the sheet plan (7.4a)', () => {
  it('is the pagination: sheet n is page n, and each part knows its sheets', () => {
    const plan = planSheets(PRINT_TEST, DEFAULT_PAGE_SETUP);
    expect(plan.sheets).toBe(plan.pagination.pages);
    expect(plan.sheets.map((sheet) => sheet.index)).toEqual([0, 1, 2]);

    expect(plan.parts.get('Outer panel')).toEqual({
      partId: 'Outer panel',
      sheets: [1],
      taped: false,
      rows: 1,
      columns: 1,
    });
    expect(plan.parts.get('Pocket')?.sheets).toEqual([1]);
    expect(plan.parts.get('Strap')).toEqual({
      partId: 'Strap',
      sheets: [2, 3],
      taped: true,
      rows: 1,
      columns: 2,
    });
  });

  it('turning the paper changes the plan: the print test is one sheet of A4 landscape', () => {
    const plan = planSheets(PRINT_TEST, pageSetupOf('A4', 'landscape'));
    expect(plan.sheets).toHaveLength(1);
    expect([...plan.parts.values()].every((entry) => entry.sheets[0] === 1 && !entry.taped)).toBe(
      true,
    );
  });

  it('holds one scale-check sheet when nothing prints, as the PDF does', async () => {
    const plan = planSheets(scene([]), DEFAULT_PAGE_SETUP);
    expect(plan.sheets).toHaveLength(1);
    expect(plan.sheets[0]!.placements).toEqual([]);
    expect(isScaleCheckOnly(plan)).toBe(true);
    expect(plan.parts.size).toBe(0);
    expect(describeSheets(plan)).toBe('1 sheet of A4, portrait, scale check only');

    const { bytes } = await exportPdf(plan, { now: () => new Date(0) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('gives the PDF exactly as many pages as it has sheets, on every paper', async () => {
    // The promise the sheet count makes: the number the maker reads before
    // exporting is the number of sheets the printer will take.
    await fc.assert(
      fc.asyncProperty(
        // Up to two sheets' worth of tiles either way on the smallest paper:
        // enough to mix packed, taped and empty, without writing dozens of
        // pages per run.
        fc.array(
          fc.record({
            w: fc.double({ min: 5, max: 320, noNaN: true }),
            h: fc.double({ min: 5, max: 260, noNaN: true }),
          }),
          { maxLength: 4 },
        ),
        fc.constantFrom(...SETUPS),
        async (sizes, setup) => {
          const plan = planSheets(
            scene(sizes.map(({ w, h }, i) => part(`p${String(i)}`, w, h))),
            setup,
          );
          const { bytes } = await exportPdf(plan, { now: () => new Date(0) });
          expect((await PDFDocument.load(bytes)).getPageCount()).toBe(plan.sheets.length);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('puts every printed part on a sheet, and every sheet carries something', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            w: fc.double({ min: 5, max: 600, noNaN: true }),
            h: fc.double({ min: 5, max: 500, noNaN: true }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.constantFrom(...SETUPS),
        (sizes, setup) => {
          const parts = sizes.map(({ w, h }, i) => part(`p${String(i)}`, w, h));
          const plan = planSheets(scene(parts), setup);
          expect([...plan.parts.keys()].sort()).toEqual(parts.map((p) => p.id).sort());
          const used = new Set([...plan.parts.values()].flatMap((entry) => entry.sheets));
          expect([...used].sort((a, b) => a - b)).toEqual(plan.sheets.map((_, i) => i + 1));
          for (const entry of plan.parts.values()) {
            // A taped part's sheets are contiguous, and as many as its grid.
            expect(entry.sheets).toHaveLength(entry.rows * entry.columns);
            expect(entry.sheets.at(-1)! - entry.sheets[0]! + 1).toBe(entry.sheets.length);
            expect(entry.taped).toBe(entry.sheets.length > 1 || entry.rows * entry.columns > 1);
          }
        },
      ),
    );
  });

  it('is the same for the same scene and paper, however often it is asked', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SETUPS), (setup) => {
        expect(planSheets(PRINT_TEST, setup)).toEqual(planSheets(PRINT_TEST, setup));
      }),
    );
  });

  it('does not depend on where the pieces sit on the board', () => {
    // Moving a piece on the board translates its geometry, and so its bounds.
    // The paper is the same: the same sheets, and each piece placed on paper
    // at the same spot.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: -2000, max: 2000, noNaN: true }),
            y: fc.double({ min: -2000, max: 2000, noNaN: true }),
          }),
          { minLength: 3, maxLength: 3 },
        ),
        fc.constantFrom(...SETUPS),
        (moves, setup) => {
          const moved = scene(
            PRINT_TEST.parts.map((original, i) =>
              part(
                original.id,
                RectOps.width(original.boundsMm),
                RectOps.height(original.boundsMm),
                moves[i]!.x,
                moves[i]!.y,
              ),
            ),
          );
          const before = placedFootprint(planSheets(PRINT_TEST, setup));
          const after = placedFootprint(planSheets(moved, setup));
          expect(after.length).toBe(before.length);
          after.forEach((placed, i) => {
            expect(placed.sheet).toBe(before[i]!.sheet);
            expect(placed.id).toBe(before[i]!.id);
            expect(placed.tile).toBe(before[i]!.tile);
            expect(placed.minX).toBeCloseTo(before[i]!.minX, 6);
            expect(placed.minY).toBeCloseTo(before[i]!.minY, 6);
          });
        },
      ),
    );
  });

  it('plans every paper the maker can choose, in the order the list shows them', () => {
    const options = planEveryPaper(PRINT_TEST);
    expect(options.map((o) => `${o.paper} ${o.orientation}`)).toEqual(
      SETUPS.map((setup) => `${setup.paper.name} ${setup.orientation}`),
    );
    const counts = Object.fromEntries(
      options.map((o) => [`${o.paper} ${o.orientation}`, o.plan.sheets.length]),
    );
    expect(counts).toMatchObject({ 'A4 portrait': 3, 'A4 landscape': 1, 'A5 landscape': 5 });
  });
});

describe('what the plan is called', () => {
  it('counts sheets of a paper, as a maker says it', () => {
    expect(describeSheets(planSheets(PRINT_TEST, DEFAULT_PAGE_SETUP))).toBe(
      '3 sheets of A4, portrait',
    );
    expect(describeSheets(planSheets(PRINT_TEST, pageSetupOf('A4', 'landscape')))).toBe(
      '1 sheet of A4, landscape',
    );
  });

  it('names what is taped', () => {
    expect(describeTaped(planSheets(PRINT_TEST, DEFAULT_PAGE_SETUP))).toBe('Strap taped');
    expect(describeTaped(planSheets(PRINT_TEST, pageSetupOf('A5', 'landscape')))).toBe(
      'Outer panel and Strap taped',
    );
    expect(describeTaped(planSheets(PRINT_TEST, pageSetupOf('A4', 'landscape')))).toBeNull();
    const many = scene([part('a', 400, 20), part('b', 400, 20), part('c', 400, 20)]);
    expect(describeTaped(planSheets(many, DEFAULT_PAGE_SETUP))).toBe('3 pieces taped');
  });

  it('numbers sheets one way, on screen and on paper', () => {
    expect(describeSheetNumbers([1])).toBe('Sheet 1');
    expect(describeSheetNumbers([2, 3])).toBe('Sheets 2–3');
    expect(describeSheetNumbers([2, 4])).toBe('Sheets 2, 4');
    expect(sheetLabel(2, 3)).toBe('Sheet 2 of 3');
  });
});
