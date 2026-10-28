import { NO_CORRECTION } from '@leathercad/core';
import { PathOps, RectOps, polyline } from '@leathercad/geometry';
import { ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { missingGlyphs, textWidthMm } from '@leathercad/typography';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SETUP,
  contentAreaMm,
  pageSetupOf,
  sheetSizeMm,
  verificationLayout,
} from './paper.js';
import { PRINT_STYLES, type ExportPart, type ExportScene } from './scene.js';
import { sheetInk } from './sheetInk.js';
import { planSheets } from './sheetPlan.js';

function part(id: string, widthMm: number, heightMm: number): ExportPart {
  return {
    id,
    name: id,
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x: 0, y: 0 }, { x: widthMm, y: heightMm }),
    paths: [
      {
        role: 'cut',
        style: PRINT_STYLES.cut,
        path: polyline(
          [
            { x: 0, y: 0 },
            { x: widthMm, y: 0 },
            { x: widthMm, y: heightMm },
            { x: 0, y: heightMm },
          ],
          true,
        ),
      },
    ],
    texts: [],
  };
}
const scene = (parts: ExportPart[]): ExportScene => ({ projectName: 'Wallet', parts });
const NOW = new Date('2026-09-24T12:00:00.000Z');
const SETUPS = PAPER_NAMES.flatMap((paper) =>
  ORIENTATIONS.map((orientation) => pageSetupOf(paper, orientation)),
);

describe('what a sheet prints besides its pieces (7.4c)', () => {
  const plan = planSheets(
    scene([part('panel', 100, 70), part('strap', 275, 20)]),
    DEFAULT_PAGE_SETUP,
  );

  it('says on every sheet what it is, as the Sheets view labels it', () => {
    plan.sheets.forEach((_, i) => {
      const sources = sheetInk(plan, i, NOW).texts.map((t) => t.source);
      expect(sources[1]).toMatch(
        new RegExp(`^Wallet · Sheet ${String(i + 1)} of ${String(plan.sheets.length)}`),
      );
      expect(sources).toContain('2026-09-24 · 1:1 · LeatherCAD');
    });
  });

  it('draws the gauge where the layout reserves it, on every sheet', () => {
    const layout = verificationLayout(DEFAULT_PAGE_SETUP);
    plan.sheets.forEach((planned, i) => {
      // An assembly sheet's map is in its printable area: below, on its own.
      if (planned.assembly !== undefined) return;
      const { paths, texts } = sheetInk(plan, i, NOW);
      const boxes = paths.map((p) => PathOps.bbox(p.path)!);
      // The gauge is one closed path, exactly 100 × 10 mm.
      const gauge = paths.find((p) => p.path.closed);
      expect(PathOps.bbox(gauge!.path)).toEqual({
        minX: layout.gauge.x,
        minY: layout.gauge.y,
        maxX: layout.gauge.x + 100,
        maxY: layout.gauge.y + 5,
      });
      // Ticked every 5 mm inside it, between its ends.
      expect(paths.filter((p) => !p.path.closed)).toHaveLength(19);
      expect(texts[0]!.source).toBe('Print at 100 % / Actual size — this box is 100 × 5 mm');
      // All of it, words included, inside the sheet's margins and below the pattern.
      const sheet = sheetSizeMm(DEFAULT_PAGE_SETUP);
      const area = contentAreaMm(DEFAULT_PAGE_SETUP);
      const glyphs = texts.flatMap((t) => t.glyphs.map((g) => PathOps.bbox(g)!));
      for (const b of [...boxes, ...glyphs]) {
        expect(b.minX).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(b.maxX).toBeLessThanOrEqual(sheet.widthMm - 10 + 1e-9);
        expect(b.minY).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(b.maxY).toBeLessThan(area.y);
      }
    });
  });

  it('shortens a long name rather than run past the margin or into the gauge', () => {
    const long = planSheets(
      { projectName: 'A'.repeat(200), parts: [part('B'.repeat(200), 275, 20)] },
      DEFAULT_PAGE_SETUP,
    );
    const layout = verificationLayout(DEFAULT_PAGE_SETUP);
    const [, identity] = sheetInk(long, 0, NOW).texts;
    expect(identity!.source).toContain('· Sheet 1 of 2 · ');
    expect(identity!.source).toContain('…');
    const glyphs = RectOps.unionAll(identity!.glyphs.map((g) => PathOps.bbox(g)!))!;
    expect(glyphs.minX).toBeGreaterThanOrEqual(layout.lines.x - layout.textMaxWidthMm - 1e-9);
  });

  it('adds a tiled sheet its joins, crosses, label and clip; a packed sheet none', () => {
    const packed = sheetInk(plan, 0, NOW);
    expect(packed.clip).toBeNull();
    expect(packed.clipped).toEqual([]);
    expect(packed.clippedTexts).toEqual([]);

    const tiled = sheetInk(plan, 1, NOW);
    const area = contentAreaMm(DEFAULT_PAGE_SETUP);
    expect(tiled.clip).toEqual({
      minX: area.x,
      minY: area.y,
      maxX: area.x + area.widthMm,
      maxY: area.y + area.heightMm,
    });
    // One join line (grey, dashed), on it one cross of two black strokes,
    // and beside it an arrow — a grey shaft and head — naming the next sheet.
    const joins = tiled.clipped.filter((p) => p.style.dashMm.length > 0);
    const crosses = tiled.clipped.filter((p) => p.style.grey === 0);
    const arrow = tiled.clipped.filter((p) => p.style.dashMm.length === 0 && p.style.grey > 0);
    expect(joins).toHaveLength(1);
    expect(joins[0]!.style.grey).toBeGreaterThan(0);
    expect(crosses).toHaveLength(2);
    expect(arrow).toHaveLength(2);
    expect(arrow[0]!.style.grey).toBe(joins[0]!.style.grey);
    expect(tiled.clippedTexts.map((t) => t.source)).toEqual(['Sheet 3']);
    expect(sheetInk(plan, 2, NOW).clippedTexts.map((t) => t.source)).toEqual(['Sheet 2']);
    // Which sheet it joins, and where: the dashed line and its crosses say how.
    expect(tiled.texts.map((t) => t.source)).toEqual([
      'Print at 100 % / Actual size — this box is 100 × 5 mm',
      'Wallet · Sheet 2 of 3 · strap, joins sheet 3 to the right',
      '2026-09-24 · 1:1 · LeatherCAD',
    ]);
    expect(sheetInk(plan, 2, NOW).texts[1]!.source).toBe(
      'Wallet · Sheet 3 of 3 · strap, joins sheet 2 to the left',
    );
  });

  it('maps a part taped into a grid on its assembly sheet, saying it is not to scale (7.2)', () => {
    // 400 × 300 on A4 portrait: taped 2 × 3, after its map.
    const grid = planSheets(scene([part('gusset', 400, 300)]), DEFAULT_PAGE_SETUP);
    const map = sheetInk(grid, 0, NOW);
    expect(map.clip).toBeNull();
    expect(map.clipped).toEqual([]);
    expect(map.texts.map((t) => t.source)).toEqual([
      'Print at 100 % / Actual size — this box is 100 × 5 mm',
      'Wallet · Sheet 1 of 7 · gusset, assembly map of sheets 2–7',
      '2026-09-24 · 1:1 · LeatherCAD',
      'gusset · assembly map of sheets 2–7',
      'Not to scale: a map of how the sheets join. Never cut from it.',
      'Cut each sheet on its dashed line, lay it over the next and match the crosses.',
      'Sheet 2',
      'Sheet 3',
      'Sheet 4',
      'Sheet 5',
      'Sheet 6',
      'Sheet 7',
    ]);
    // The gauge and its 19 ticks, a cell for each tile, and the gusset's
    // outline in grey — the one thing on paper drawn smaller than it is.
    const drawn = map.paths.slice(20);
    expect(drawn.filter((p) => p.style.grey === 0)).toHaveLength(6);
    expect(drawn.filter((p) => p.style.grey > 0)).toHaveLength(1);
  });

  it('keeps an assembly sheet’s map and words in its printable area, on every paper (7.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SETUPS),
        fc.double({ min: 30, max: 1200, noNaN: true }),
        fc.double({ min: 30, max: 1200, noNaN: true }),
        (setup, widthMm, heightMm) => {
          const taped = planSheets(scene([part('p', widthMm, heightMm)]), setup);
          const area = contentAreaMm(setup);
          const printable = RectOps.fromOriginSize(area, area.widthMm, area.heightMm);
          taped.sheets.forEach((sheet, i) => {
            if (sheet.assembly === undefined) return;
            const { paths, texts } = sheetInk(taped, i, NOW);
            const boxes = [
              ...paths.slice(20).map((p) => PathOps.bbox(p.path)!),
              ...texts.slice(3).flatMap((t) => t.glyphs.map((g) => PathOps.bbox(g)!)),
            ];
            for (const box of boxes) expect(RectOps.containsRect(printable, box)).toBe(true);
          });
        },
      ),
    );
  });

  it('keeps a taped sheet’s joins, crosses and arrows inside its clip, on every paper (7.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SETUPS),
        fc.double({ min: 30, max: 1200, noNaN: true }),
        fc.double({ min: 30, max: 1200, noNaN: true }),
        (setup, widthMm, heightMm) => {
          const taped = planSheets(scene([part('p', widthMm, heightMm)]), setup);
          taped.sheets.forEach((sheet, i) => {
            if (sheet.tile === undefined) return;
            const { clip, clipped, clippedTexts } = sheetInk(taped, i, NOW);
            const boxes = [
              ...clipped.map((p) => PathOps.bbox(p.path)!),
              ...clippedTexts.flatMap((t) => t.glyphs.map((g) => PathOps.bbox(g)!)),
            ];
            for (const box of boxes) expect(RectOps.containsRect(clip!, box)).toBe(true);
          });
        },
      ),
    );
  });

  it('is the same ink for the same plan and clock', () => {
    expect(sheetInk(plan, 1, NOW)).toEqual(sheetInk(plan, 1, NOW));
  });
});

describe('a sheet printed with a printer’s correction (7.5)', () => {
  const plan = planSheets(scene([part('panel', 100, 70)]), DEFAULT_PAGE_SETUP);
  /** The strip's second line: where the sheet came from. */
  const whereFrom = (texts: readonly { source: string }[]) => texts[2]!.source;

  it('says it was corrected, and by how much, where it says 1:1 otherwise', () => {
    expect(whereFrom(sheetInk(plan, 0, NOW).texts)).toBe('2026-09-24 · 1:1 · LeatherCAD');
    expect(whereFrom(sheetInk(plan, 0, NOW, { x: 1.005, y: 0.99764 }).texts)).toBe(
      '2026-09-24 · corrected for its printer: x 1.0050, y 0.9976 · LeatherCAD',
    );
  });

  it('is the uncorrected sheet for no correction', () => {
    expect(sheetInk(plan, 0, NOW, NO_CORRECTION)).toEqual(sheetInk(plan, 0, NOW));
  });

  it('fits what it says beside the gauge, on every paper', () => {
    for (const setup of SETUPS) {
      const sized = planSheets(scene([part('panel', 100, 70)]), setup);
      const line = sheetInk(sized, 0, NOW, { x: 0.98, y: 1.02 }).texts[2]!;
      expect(missingGlyphs(line.source)).toEqual([]);
      expect(textWidthMm(line.source, line.sizeMm)).toBeLessThanOrEqual(
        verificationLayout(setup).textMaxWidthMm,
      );
    }
  });
});
