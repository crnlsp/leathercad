import { ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { RectOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SETUP, pageSetupOf, sheetSizeMm } from './paper.js';
import { PRINT_STYLES, type ExportPart, type ExportScene } from './scene.js';
import { planSheets } from './sheetPlan.js';
import { layoutSheets, pieceAt, sheetAt } from './sheetsLayout.js';

function part(id: string, widthMm: number, heightMm: number): ExportPart {
  return {
    id,
    name: id,
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x: 0, y: 0 }, { x: widthMm, y: heightMm }),
    paths: [{ role: 'cut', style: PRINT_STYLES.cut, path: { segments: [], closed: true } }],
    texts: [],
  };
}
const scene = (parts: ExportPart[]): ExportScene => ({ projectName: 'Test', parts });
const SETUPS = PAPER_NAMES.flatMap((paper) =>
  ORIENTATIONS.map((orientation) => pageSetupOf(paper, orientation)),
);
const sizes = fc.array(
  fc.record({
    w: fc.double({ min: 5, max: 700, noNaN: true }),
    h: fc.double({ min: 5, max: 600, noNaN: true }),
  }),
  { maxLength: 7 },
);

describe('where the sheets sit on the Sheets view (7.4c)', () => {
  it('gives every sheet one frame, in PDF order, at the paper size', () => {
    fc.assert(
      fc.property(sizes, fc.constantFrom(...SETUPS), (list, setup) => {
        const plan = planSheets(
          scene(list.map(({ w, h }, i) => part(`p${String(i)}`, w, h))),
          setup,
        );
        const layout = layoutSheets(plan);
        const sheet = sheetSizeMm(setup);
        expect(layout.frames.map((f) => f.index)).toEqual(plan.sheets.map((s) => s.index));
        for (const frame of layout.frames) {
          expect(frame.widthMm).toBe(sheet.widthMm);
          expect(frame.heightMm).toBe(sheet.heightMm);
        }
      }),
    );
  });

  it('never overlaps two sheets, and keeps every sheet inside its extent', () => {
    fc.assert(
      fc.property(sizes, fc.constantFrom(...SETUPS), (list, setup) => {
        const plan = planSheets(
          scene(list.map(({ w, h }, i) => part(`p${String(i)}`, w, h))),
          setup,
        );
        const { frames, extent } = layoutSheets(plan);
        const box = (f: (typeof frames)[number]) =>
          RectOps.fromCorners(f.origin, { x: f.origin.x + f.widthMm, y: f.origin.y + f.heightMm });
        frames.forEach((a, i) => {
          const r = box(a);
          expect(r.minX).toBeGreaterThanOrEqual(extent.minX - 1e-9);
          expect(r.maxX).toBeLessThanOrEqual(extent.maxX + 1e-9);
          expect(r.minY).toBeGreaterThanOrEqual(extent.minY - 1e-9);
          expect(r.maxY).toBeLessThanOrEqual(extent.maxY + 1e-9);
          for (const b of frames.slice(i + 1)) {
            const q = box(b);
            const apart =
              r.maxX <= q.minX || q.maxX <= r.minX || r.maxY <= q.minY || q.maxY <= r.minY;
            expect(apart, `sheets ${String(a.index)} and ${String(b.index)}`).toBe(true);
          }
        });
      }),
    );
  });

  it('lays a taped piece in its grid, numbered row by row as the PDF numbers it', () => {
    // 400 × 300 on A4 portrait: three columns, two rows.
    const plan = planSheets(scene([part('panel', 400, 300)]), DEFAULT_PAGE_SETUP);
    const layout = layoutSheets(plan);
    const [group] = layout.groups;
    expect(group).toMatchObject({ partId: 'panel', rows: 2, columns: 3 });
    expect(group!.sheets).toEqual([1, 2, 3, 4, 5, 6]);
    const frame = (n: number) => layout.frames[n - 1]!;
    // Same row, same height; same column, same x; the second row below the first.
    expect(frame(2).origin.y).toBe(frame(1).origin.y);
    expect(frame(3).origin.y).toBe(frame(1).origin.y);
    expect(frame(4).origin.x).toBe(frame(1).origin.x);
    expect(frame(4).origin.y).toBeLessThan(frame(1).origin.y);
    expect(frame(2).origin.x).toBeGreaterThan(frame(1).origin.x);
  });

  it('is the same whatever the window: a function of the plan alone', () => {
    const plan = planSheets(scene([part('a', 100, 80), part('b', 250, 30)]), DEFAULT_PAGE_SETUP);
    expect(layoutSheets(plan)).toEqual(layoutSheets(plan));
  });

  it('finds the sheet under a point, and none in the gap between sheets', () => {
    const plan = planSheets(scene([part('a', 150, 150), part('b', 150, 150)]), DEFAULT_PAGE_SETUP);
    const layout = layoutSheets(plan);
    const [first, second] = layout.frames;
    expect(sheetAt(layout, { x: first!.origin.x + 10, y: first!.origin.y + 10 })?.index).toBe(0);
    expect(sheetAt(layout, { x: second!.origin.x + 10, y: second!.origin.y + 10 })?.index).toBe(1);
    const gap = (first!.origin.x + first!.widthMm + second!.origin.x) / 2;
    expect(sheetAt(layout, { x: gap, y: first!.origin.y + 10 })).toBeNull();
  });
});

describe('what is under the pointer on the Sheets view (7.4d)', () => {
  it('finds the piece where it is placed, and nothing beside it', () => {
    const plan = planSheets(
      scene([part('panel', 100, 70), part('pocket', 90, 60)]),
      DEFAULT_PAGE_SETUP,
    );
    const layout = layoutSheets(plan);
    const frame = layout.frames[0]!;
    for (const placement of plan.sheets[0]!.placements) {
      const b = placement.part.boundsMm;
      const centre = {
        x: frame.origin.x + placement.offsetMm.x + (b.minX + b.maxX) / 2,
        y: frame.origin.y + placement.offsetMm.y + (b.minY + b.maxY) / 2,
      };
      expect(pieceAt(plan, layout, centre)).toEqual({ sheet: 0, partId: placement.part.id });
    }
    // The sheet's corner, in the margin: the sheet, but no piece.
    expect(pieceAt(plan, layout, { x: frame.origin.x + 2, y: frame.origin.y + 2 })).toEqual({
      sheet: 0,
      partId: null,
    });
    expect(pieceAt(plan, layout, { x: frame.origin.x - 5, y: frame.origin.y })).toBeNull();
  });

  it('finds a taped piece on each of its sheets, but not in the margin it is cropped from', () => {
    const plan = planSheets(scene([part('strap', 250, 20)]), DEFAULT_PAGE_SETUP);
    const layout = layoutSheets(plan);
    for (const frame of layout.frames) {
      const placement = plan.sheets[frame.index]!.placements[0]!;
      const window = plan.sheets[frame.index]!.tile!.windowMm;
      // The middle of what this sheet shows of the strap.
      const x = Math.max(window.minX, 0) + 5;
      const at = {
        x: frame.origin.x + placement.offsetMm.x + x,
        y: frame.origin.y + placement.offsetMm.y + 10,
      };
      expect(pieceAt(plan, layout, at)).toEqual({ sheet: frame.index, partId: 'strap' });
    }
  });
});
