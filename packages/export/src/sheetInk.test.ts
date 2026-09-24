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
    scene([part('panel', 100, 70), part('strap', 250, 20)]),
    DEFAULT_PAGE_SETUP,
  );

  it('numbers every sheet in its footer, as the Sheets view labels it', () => {
    plan.sheets.forEach((_, i) => {
      const sources = sheetInk(plan, i, NOW).texts.map((t) => t.source);
      expect(sources).toContain(`Sheet ${String(i + 1)} of ${String(plan.sheets.length)} · 1:1`);
      expect(sources).toContain('Wallet · 2026-09-24 · LeatherCAD');
    });
  });

  it('draws the verification block where the layout reserves it, on every sheet', () => {
    const layout = verificationLayout(DEFAULT_PAGE_SETUP);
    plan.sheets.forEach((_, i) => {
      const { paths, texts } = sheetInk(plan, i, NOW);
      const boxes = paths.map((p) => PathOps.bbox(p.path)!);
      // The square is one closed path, exactly 50 mm.
      const square = boxes.find(
        (b) =>
          Math.abs(b.minX - layout.square.x) < 1e-9 && Math.abs(b.minY - layout.square.y) < 1e-9,
      );
      expect(square).toBeDefined();
      expect(RectOps.width(square!)).toBeCloseTo(50, 9);
      expect(RectOps.height(square!)).toBeCloseTo(50, 9);
      // The ruler runs exactly 100 mm.
      const baseline = boxes.find((b) => Math.abs(RectOps.width(b) - 100) < 1e-9);
      expect(baseline?.minX).toBeCloseTo(layout.ruler.x, 9);
      expect(texts.map((t) => t.source)).toContain(
        'Print at 100% / Actual size — do not scale or fit to page.',
      );
      // All of it inside the sheet's margins.
      const sheet = sheetSizeMm(DEFAULT_PAGE_SETUP);
      for (const b of boxes) {
        expect(b.minX).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(b.maxX).toBeLessThanOrEqual(sheet.widthMm - 10 + 1e-9);
      }
    });
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
    expect(tiled.texts.map((t) => t.source)).toContain('strap · R1 C1 · 1 × 2 sheets');
  });

  it('is the same ink for the same plan and clock', () => {
    expect(sheetInk(plan, 1, NOW)).toEqual(sheetInk(plan, 1, NOW));
  });
});
