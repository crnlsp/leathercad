import { RectOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { describeOversized, paginate } from './paginate.js';
import { DEFAULT_PAGE_SETUP, PAPER_SIZES, contentAreaMm } from './paper.js';
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
    expect(result.oversized).toHaveLength(0);
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

  it('reports a part too large for the sheet instead of clipping it', () => {
    const result = paginate(scene([part('big', 400, 300, 'Bag gusset')]), DEFAULT_PAGE_SETUP);
    expect(result.pages).toHaveLength(0);
    expect(result.oversized).toHaveLength(1);
    expect(result.oversized[0]!.part.name).toBe('Bag gusset');
  });

  it('tells the user which paper would fit an oversized part', () => {
    const result = paginate(scene([part('big', 250, 180, 'Panel')]), DEFAULT_PAGE_SETUP);
    const message = describeOversized(result.oversized[0]!);
    expect(message).toContain('Panel');
    expect(message).toContain('250.0 × 180.0 mm');
    expect(message).toMatch(/A3/);
  });

  it('still paginates the parts that do fit alongside one that does not', () => {
    const result = paginate(
      scene([part('big', 400, 300), part('small', 80, 60)]),
      DEFAULT_PAGE_SETUP,
    );
    expect(result.oversized).toHaveLength(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.placements[0]!.part.id).toBe('small');
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
    expect(result.oversized).toHaveLength(0);
  });
});
