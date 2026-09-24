import { DEFAULT_SETTINGS, ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { RectOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { TILE_OVERLAP_MM, describeTiled, paginate } from './paginate.js';
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  contentAreaMm,
  pageSetupFor,
  type PageSetup,
} from './paper.js';
import { PRINT_STYLES, type ExportPart, type ExportScene } from './scene.js';

function part(id: string, widthMm: number, heightMm: number, name = id): ExportPart {
  const bounds = RectOps.fromCorners({ x: 0, y: 0 }, { x: widthMm, y: heightMm });
  return {
    id,
    name,
    quantity: 1,
    boundsMm: bounds,
    paths: [
      {
        role: 'cut',
        style: PRINT_STYLES.cut,
        path: { segments: [], closed: true },
      },
    ],
    // Pagination packs geometry; a caption rides along with its part and does
    // not affect where the piece goes.
    texts: [],
  };
}

function scene(parts: ExportPart[]): ExportScene {
  return { projectName: 'Test', parts };
}

const AREA = contentAreaMm(DEFAULT_PAGE_SETUP);

describe('paginate', () => {
  it('puts everything on one page when it fits', () => {
    const result = paginate(scene([part('a', 100, 60), part('b', 80, 50)]), DEFAULT_PAGE_SETUP);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.placements).toHaveLength(2);
    expect(result.tiled).toHaveLength(0);
  });

  it('spills onto a second page rather than shrinking anything', () => {
    // The user's choice: multiple A4 sheets, never a scaled fit.
    const tall = Math.floor(AREA.heightMm * 0.6);
    const result = paginate(
      scene([part('a', 180, tall), part('b', 180, tall), part('c', 180, tall)]),
      DEFAULT_PAGE_SETUP,
    );
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    const placed = result.pages.flatMap((page) => page.placements).length;
    expect(placed).toBe(3);
  });

  it('places every part exactly once', () => {
    const parts = Array.from({ length: 12 }, (_, i) => part(`p${i}`, 60 + i, 40 + i));
    const result = paginate(scene(parts), DEFAULT_PAGE_SETUP);
    const ids = result.pages.flatMap((page) => page.placements.map((p) => p.part.id)).sort();
    expect(ids).toEqual(parts.map((p) => p.id).sort());
  });

  it('keeps every placement inside the printable area', () => {
    // A part straddling the margin would be clipped by the printer, which is
    // exactly the silent failure this project exists to avoid.
    const parts = Array.from({ length: 10 }, (_, i) => part(`p${i}`, 55 + i * 3, 45 + i * 2));
    const result = paginate(scene(parts), DEFAULT_PAGE_SETUP);

    for (const page of result.pages) {
      for (const placement of page.placements) {
        const minX = placement.offsetMm.x + placement.part.boundsMm.minX;
        const minY = placement.offsetMm.y + placement.part.boundsMm.minY;
        const maxX = placement.offsetMm.x + placement.part.boundsMm.maxX;
        const maxY = placement.offsetMm.y + placement.part.boundsMm.maxY;

        expect(minX).toBeGreaterThanOrEqual(AREA.x - 1e-6);
        expect(minY).toBeGreaterThanOrEqual(AREA.y - 1e-6);
        expect(maxX).toBeLessThanOrEqual(AREA.x + AREA.widthMm + 1e-6);
        expect(maxY).toBeLessThanOrEqual(AREA.y + AREA.heightMm + 1e-6);
      }
    }
  });

  it('never overlaps two parts on a page', () => {
    const parts = Array.from({ length: 8 }, (_, i) => part(`p${i}`, 50 + i * 5, 40 + i * 4));
    const result = paginate(scene(parts), DEFAULT_PAGE_SETUP);

    for (const page of result.pages) {
      const boxes = page.placements.map((p) => RectOps.translate(p.part.boundsMm, p.offsetMm));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const overlap = RectOps.intersection(boxes[i]!, boxes[j]!);
          const area = overlap === null ? 0 : RectOps.width(overlap) * RectOps.height(overlap);
          expect(area).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('tiles a part too large for the sheet, never scaling it or leaving it out', () => {
    // 7.2a. Before it, a part larger than the sheet was reported and left out
    // of the file. Now it is printed across sheets, at 1:1, to tape together.
    const result = paginate(scene([part('big', 400, 300, 'Bag gusset')]), DEFAULT_PAGE_SETUP);

    // A4 portrait prints 190 × 215 mm; with a 10 mm overlap each further
    // sheet adds 180 × 205. 400 wide needs 3 columns, 300 + 5 for its name 2 rows.
    expect(result.tiled).toHaveLength(1);
    expect(result.tiled[0]).toMatchObject({ rows: 2, columns: 3 });
    expect(result.pages).toHaveLength(6);
    expect(result.pages.map((page) => page.tile?.label)).toEqual([
      'R1 C1',
      'R1 C2',
      'R1 C3',
      'R2 C1',
      'R2 C2',
      'R2 C3',
    ]);
    for (const page of result.pages) {
      expect(page.placements).toHaveLength(1);
      expect(page.placements[0]!.part.name).toBe('Bag gusset');
    }
  });

  it('says what was tiled, on which paper, and which paper would hold it whole', () => {
    const result = paginate(scene([part('big', 250, 180, 'Panel')]), DEFAULT_PAGE_SETUP);
    expect(describeTiled(result.tiled[0]!)).toBe(
      '"Panel" is 250.0 × 180.0 mm, larger than A4 portrait: printed on 2 sheets, 1 × 2. It fits whole on A3 portrait.',
    );
  });

  it('suggests turning the chosen paper before changing it', () => {
    // The paper in the printer is the one the maker chose. A strap too long
    // for Letter portrait fits Letter landscape — which is the answer, not
    // A4 landscape, which happens to come first in the list and which a
    // printer loaded with Letter does not have.
    const letter = { ...DEFAULT_PAGE_SETUP, paper: PAPER_SIZES.Letter };
    const result = paginate(scene([part('strap', 250, 100, 'Strap')]), letter);

    expect(result.tiled[0]!.fitsOn[0]).toEqual({
      paper: { name: 'Letter' },
      orientation: 'landscape',
    });
    expect(describeTiled(result.tiled[0]!)).toBe(
      '"Strap" is 250.0 × 100.0 mm, larger than Letter portrait: printed on 2 sheets, 1 × 2. It fits whole on Letter landscape.',
    );
  });

  it('says so when no paper would hold it whole', () => {
    const result = paginate(scene([part('big', 900, 700, 'Tote side')]), DEFAULT_PAGE_SETUP);
    expect(describeTiled(result.tiled[0]!)).toMatch(/No supported paper holds it whole\.$/);
  });

  it('packs the parts that fit first, then tiles the one that does not', () => {
    const result = paginate(
      scene([part('big', 400, 300), part('small', 80, 60)]),
      DEFAULT_PAGE_SETUP,
    );
    expect(result.pages[0]!.tile).toBeUndefined();
    expect(result.pages[0]!.placements[0]!.part.id).toBe('small');
    expect(result.pages.slice(1).every((page) => page.tile?.part.id === 'big')).toBe(true);
    expect(result.pages.map((page) => page.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('fits more on A3 than on A4', () => {
    const parts = Array.from({ length: 6 }, (_, i) => part(`p${i}`, 120, 120));
    const a4 = paginate(scene(parts), DEFAULT_PAGE_SETUP);
    const a3 = paginate(scene(parts), { ...DEFAULT_PAGE_SETUP, paper: PAPER_SIZES.A3 });
    expect(a3.pages.length).toBeLessThan(a4.pages.length);
  });

  it('handles an empty project', () => {
    const result = paginate(scene([]), DEFAULT_PAGE_SETUP);
    expect(result.pages).toHaveLength(0);
    expect(result.tiled).toHaveLength(0);
  });
});

describe('tiling, as a property (7.2a)', () => {
  const sheets = PAPER_NAMES.flatMap((paper) =>
    ORIENTATIONS.map((orientation) => pageSetupFor({ ...DEFAULT_SETTINGS, paper, orientation })),
  );
  const oversized = fc.record({
    setup: fc.constantFrom(...sheets),
    widthMm: fc.double({ min: 30, max: 1600, noNaN: true }),
    heightMm: fc.double({ min: 30, max: 1600, noNaN: true }),
  });

  /** The tiles of one part, and the region they must cover: bounds plus its name. */
  function tilesOf(setup: PageSetup, widthMm: number, heightMm: number) {
    const bounds = RectOps.fromCorners({ x: -17, y: 23 }, { x: -17 + widthMm, y: 23 + heightMm });
    const shape: ExportPart = { ...part('p', 1, 1), boundsMm: bounds };
    const result = paginate(scene([shape]), setup);
    const region = { ...bounds, maxY: bounds.maxY + 5 };
    return { result, region, area: contentAreaMm(setup) };
  }

  it('covers the whole part, with windows the size of the printable area', () => {
    fc.assert(
      fc.property(oversized, ({ setup, widthMm, heightMm }) => {
        const { result, region, area } = tilesOf(setup, widthMm, heightMm);
        if (result.tiled.length === 0) return; // it fits: packed whole instead

        const tiles = result.pages.map((page) => page.tile!);
        const { rows, columns } = result.tiled[0]!;
        expect(tiles).toHaveLength(rows * columns);

        for (const tile of tiles) {
          expect(RectOps.width(tile.windowMm)).toBeCloseTo(area.widthMm, 9);
          expect(RectOps.height(tile.windowMm)).toBeCloseTo(area.heightMm, 9);
        }
        // The outermost windows reach past every edge of the region…
        const minX = Math.min(...tiles.map((t) => t.windowMm.minX));
        const maxX = Math.max(...tiles.map((t) => t.windowMm.maxX));
        const minY = Math.min(...tiles.map((t) => t.windowMm.minY));
        const maxY = Math.max(...tiles.map((t) => t.windowMm.maxY));
        expect(minX).toBeLessThanOrEqual(region.minX + 1e-9);
        expect(maxX).toBeGreaterThanOrEqual(region.maxX - 1e-9);
        expect(minY).toBeLessThanOrEqual(region.minY + 1e-9);
        expect(maxY).toBeGreaterThanOrEqual(region.maxY - 1e-9);
        // …by the same amount on each side: the grid is centred.
        expect(region.minX - minX).toBeCloseTo(maxX - region.maxX, 6);
        expect(maxY - region.maxY).toBeCloseTo(region.minY - minY, 6);
        // And no sheet is wasted: one column or row fewer would not reach.
        const stepX = area.widthMm - TILE_OVERLAP_MM;
        const stepY = area.heightMm - TILE_OVERLAP_MM;
        const width = RectOps.width(region);
        const height = RectOps.height(region);
        if (columns > 1) expect((columns - 2) * stepX + area.widthMm).toBeLessThan(width);
        if (rows > 1) expect((rows - 2) * stepY + area.heightMm).toBeLessThan(height);
      }),
    );
  });

  it('overlaps neighbours by exactly the overlap, with a shared join line in its middle', () => {
    fc.assert(
      fc.property(oversized, ({ setup, widthMm, heightMm }) => {
        const { result } = tilesOf(setup, widthMm, heightMm);
        if (result.tiled.length === 0) return;
        const tiles = result.pages.map((page) => page.tile!);
        const at = (row: number, column: number) =>
          tiles.find((t) => t.row === row && t.column === column);

        for (const tile of tiles) {
          const right = at(tile.row, tile.column + 1);
          if (right !== undefined) {
            expect(tile.windowMm.maxX - right.windowMm.minX).toBeCloseTo(TILE_OVERLAP_MM, 9);
            // The same number on both sheets, not merely a close one.
            const join = tile.joinsMm.x.at(-1)!;
            expect(right.joinsMm.x[0]).toBe(join);
            expect(join).toBeCloseTo(right.windowMm.minX + TILE_OVERLAP_MM / 2, 9);
          }
          const below = at(tile.row + 1, tile.column);
          if (below !== undefined) {
            expect(below.windowMm.maxY - tile.windowMm.minY).toBeCloseTo(TILE_OVERLAP_MM, 9);
            const join = tile.joinsMm.y.at(-1)!;
            expect(below.joinsMm.y[0]).toBe(join);
            expect(join).toBeCloseTo(tile.windowMm.minY + TILE_OVERLAP_MM / 2, 9);
          }
          // A sheet on the edge of the grid has no join on that edge.
          expect(tile.joinsMm.x).toHaveLength(
            (tile.column > 1 ? 1 : 0) + (tile.column < tile.columns ? 1 : 0),
          );
          expect(tile.joinsMm.y).toHaveLength(
            (tile.row > 1 ? 1 : 0) + (tile.row < tile.rows ? 1 : 0),
          );
        }
      }),
    );
  });

  it('places each window on the printable area by a translation alone', () => {
    fc.assert(
      fc.property(oversized, ({ setup, widthMm, heightMm }) => {
        const { result, area } = tilesOf(setup, widthMm, heightMm);
        for (const page of result.pages) {
          const tile = page.tile;
          if (tile === undefined) continue;
          const { offsetMm } = page.placements[0]!;
          expect(tile.windowMm.minX + offsetMm.x).toBeCloseTo(area.x, 9);
          expect(tile.windowMm.minY + offsetMm.y).toBeCloseTo(area.y, 9);
        }
      }),
    );
  });
});
