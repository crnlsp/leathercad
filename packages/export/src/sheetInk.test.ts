import { PathOps, RectOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SETUP, contentAreaMm, sheetSizeMm, verificationLayout } from './paper.js';
import { PRINT_STYLES, type ExportPart, type ExportScene } from './scene.js';
import { sheetInk } from './sheetInk.js';
import { planSheets } from './sheetPlan.js';

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
const scene = (parts: ExportPart[]): ExportScene => ({ projectName: 'Wallet', parts });
const NOW = new Date('2026-09-24T12:00:00.000Z');

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
    plan.sheets.forEach((_, i) => {
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

    const tiled = sheetInk(plan, 1, NOW);
    const area = contentAreaMm(DEFAULT_PAGE_SETUP);
    expect(tiled.clip).toEqual({
      minX: area.x,
      minY: area.y,
      maxX: area.x + area.widthMm,
      maxY: area.y + area.heightMm,
    });
    // One join line (grey, dashed) and, on it, one cross of two strokes.
    const joins = tiled.clipped.filter((p) => p.style.dashMm.length > 0);
    const crosses = tiled.clipped.filter((p) => p.style.dashMm.length === 0);
    expect(joins).toHaveLength(1);
    expect(joins[0]!.style.grey).toBeGreaterThan(0);
    expect(crosses).toHaveLength(2);
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

  it('is the same ink for the same plan and clock', () => {
    expect(sheetInk(plan, 1, NOW)).toEqual(sheetInk(plan, 1, NOW));
  });
});
