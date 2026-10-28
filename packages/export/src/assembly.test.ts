import { EPS_LENGTH } from '@leathercad/core';
import { DEFAULT_SETTINGS, ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { MatOps, RectOps, type Rect } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assemblyDiagram } from './assembly.js';
import { pageSetupFor } from './paper.js';
import { PRINT_STYLES, type ExportPart } from './scene.js';
import { planSheets } from './sheetPlan.js';

const SETUPS = PAPER_NAMES.flatMap((paper) =>
  ORIENTATIONS.map((orientation) => pageSetupFor({ ...DEFAULT_SETTINGS, paper, orientation })),
);

function part(widthMm: number, heightMm: number): ExportPart {
  return {
    id: 'p',
    name: 'Panel',
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x: 40, y: -60 }, { x: 40 + widthMm, y: -60 + heightMm }),
    paths: [{ role: 'cut', style: PRINT_STYLES.cut, path: { segments: [], closed: true } }],
    texts: [],
  };
}

/** A taped part's assembly, and a region on some sheet to draw it in. */
const mapped = fc
  .record({
    setup: fc.constantFrom(...SETUPS),
    widthMm: fc.double({ min: 30, max: 1600, noNaN: true }),
    heightMm: fc.double({ min: 30, max: 1600, noNaN: true }),
    region: fc.record({
      x: fc.double({ min: 0, max: 50, noNaN: true }),
      y: fc.double({ min: 0, max: 50, noNaN: true }),
      w: fc.double({ min: 40, max: 400, noNaN: true }),
      h: fc.double({ min: 40, max: 400, noNaN: true }),
    }),
  })
  .map(({ setup, widthMm, heightMm, region }) => {
    const plan = planSheets({ projectName: 'Test', parts: [part(widthMm, heightMm)] }, setup);
    const sheet = plan.sheets.find((s) => s.assembly !== undefined);
    const regionMm: Rect = RectOps.fromOriginSize({ x: region.x, y: region.y }, region.w, region.h);
    return { plan, assembly: sheet?.assembly, regionMm };
  })
  .filter(({ assembly }) => assembly !== undefined);

describe('the assembly sheet’s map of a taped part (7.2)', () => {
  it('has one cell per tile, named with the sheet the plan prints it on', () => {
    fc.assert(
      fc.property(mapped, ({ plan, assembly, regionMm }) => {
        const { cells } = assemblyDiagram(assembly!, regionMm);
        expect(cells.map((c) => c.sheet)).toEqual(plan.parts.get('p')!.sheets);
        for (const cell of cells) {
          const tile = plan.sheets[cell.sheet - 1]!.tile!;
          expect([cell.row, cell.column]).toEqual([tile.row, tile.column]);
        }
      }),
    );
  });

  it('lays the cells as the sheets lie: first row on top, first column on the left, meeting at the joins', () => {
    fc.assert(
      fc.property(mapped, ({ assembly, regionMm }) => {
        const { cells } = assemblyDiagram(assembly!, regionMm);
        const at = (r: number, c: number) => cells.find((x) => x.row === r && x.column === c);
        for (const cell of cells) {
          const right = at(cell.row, cell.column + 1);
          if (right !== undefined) {
            expect(right.rectMm.minX).toBeCloseTo(cell.rectMm.maxX, 6);
            expect(right.rectMm.minY).toBeCloseTo(cell.rectMm.minY, 6);
          }
          const below = at(cell.row + 1, cell.column);
          if (below !== undefined) {
            expect(below.rectMm.maxY).toBeCloseTo(cell.rectMm.minY, 6);
            expect(below.rectMm.minX).toBeCloseTo(cell.rectMm.minX, 6);
          }
        }
      }),
    );
  });

  it('fits the region, reduced the same both ways, never mirrored, and filling it one way', () => {
    fc.assert(
      fc.property(mapped, ({ assembly, regionMm }) => {
        const { cells, placement, scale } = assemblyDiagram(assembly!, regionMm);
        for (const cell of cells)
          expect(RectOps.containsRect(regionMm, cell.rectMm, EPS_LENGTH)).toBe(true);
        const all = RectOps.unionAll(cells.map((c) => c.rectMm))!;
        const fill = Math.max(
          RectOps.width(all) / RectOps.width(regionMm),
          RectOps.height(all) / RectOps.height(regionMm),
        );
        expect(fill).toBeCloseTo(1, 9);
        expect(MatOps.isSimilarity(placement)).toBe(true);
        expect(MatOps.isMirrored(placement)).toBe(false);
        expect(MatOps.uniformScaleOf(placement)).toBeCloseTo(scale, 12);
        // Each cell is its tile's share of the part, reduced by that factor.
        for (const { tile, sheet } of assembly!.tiles) {
          const cell = cells.find((c) => c.sheet === sheet)!;
          const share = RectOps.transform(cell.rectMm, MatOps.invert(placement));
          expect(RectOps.containsRect(tile.windowMm, share, EPS_LENGTH)).toBe(true);
        }
      }),
    );
  });

  it('covers the grid with no two cells overlapping', () => {
    fc.assert(
      fc.property(mapped, ({ assembly, regionMm }) => {
        const { cells } = assemblyDiagram(assembly!, regionMm);
        const all = RectOps.unionAll(cells.map((c) => c.rectMm))!;
        const sum = cells.reduce((total, c) => total + RectOps.area(c.rectMm), 0);
        expect(sum).toBeCloseTo(RectOps.area(all), 6);
        cells.forEach((a, i) =>
          cells.slice(i + 1).forEach((b) => {
            const overlap = RectOps.intersection(a.rectMm, b.rectMm);
            // Neighbours share an edge, and nothing more.
            const thinnest =
              overlap === null ? 0 : Math.min(RectOps.width(overlap), RectOps.height(overlap));
            expect(thinnest).toBeLessThan(EPS_LENGTH);
          }),
        );
      }),
    );
  });

  it('is a reduction for every part that is taped: the map is never the pattern', () => {
    // A taped part is larger than a sheet's printable area, so its map on a
    // sheet's printable area is always smaller than it.
    fc.assert(
      fc.property(mapped, ({ assembly }) => {
        const sheetArea = assembly!.tiles[0]!.tile.windowMm;
        const { scale } = assemblyDiagram(assembly!, sheetArea);
        expect(scale).toBeLessThan(1);
      }),
    );
  });
});
