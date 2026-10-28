import { PAPER_NAMES } from '@leathercad/domain';
import { PathOps, RectOps, SegmentOps, type Path } from '@leathercad/geometry';
import { missingGlyphs } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { calibrationLengths, calibrationPage } from './calibrationPage.js';
import { DEFAULT_MARGINS, PAPER_SIZES } from './paper.js';

const NOW = new Date('2026-10-28T12:00:00.000Z');

/** A path that is one straight line, as its two ends; null for anything else. */
function straight(path: Path) {
  if (path.segments.length !== 1 || path.segments[0]!.kind !== 'line') return null;
  const segment = path.segments[0]!;
  return { a: SegmentOps.start(segment), b: SegmentOps.end(segment) };
}

describe('the calibration page (7.5)', () => {
  it.each(PAPER_NAMES)(
    'draws on %s the longest lines in whole centimetres, up to 200 mm, inside the margins',
    (name) => {
      const paper = PAPER_SIZES[name];
      const { drawnMm, paths, texts } = calibrationPage(paper, NOW);

      for (const length of [drawnMm.x, drawnMm.y]) {
        expect(length % 10).toBe(0);
        expect(length).toBeLessThanOrEqual(200);
        expect(length).toBeGreaterThanOrEqual(100);
      }
      // Not a centimetre more would fit across between the margins.
      const across = paper.widthMm - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;
      expect(drawnMm.x === 200 || drawnMm.x + 10 > across).toBe(true);

      const inside = RectOps.fromCorners(
        { x: DEFAULT_MARGINS.left, y: DEFAULT_MARGINS.bottom },
        { x: paper.widthMm - DEFAULT_MARGINS.right, y: paper.heightMm - DEFAULT_MARGINS.top },
      );
      for (const item of [...paths.map((p) => p.path), ...texts.flatMap((t) => t.glyphs)]) {
        expect(RectOps.containsRect(inside, PathOps.bbox(item)!)).toBe(true);
      }
      for (const text of texts) expect(missingGlyphs(text.source)).toEqual([]);
    },
  );

  it('measures 190 × 200 mm on A4, and 200 × 200 on A3', () => {
    expect(calibrationPage(PAPER_SIZES.A4, NOW).drawnMm).toEqual({ x: 190, y: 200 });
    expect(calibrationPage(PAPER_SIZES.A3, NOW).drawnMm).toEqual({ x: 200, y: 200 });
  });

  it.each(PAPER_NAMES)('tells the wizard the lengths it draws on %s', (name) => {
    expect(calibrationLengths(PAPER_SIZES[name])).toEqual(
      calibrationPage(PAPER_SIZES[name], NOW).drawnMm,
    );
  });

  it.each(PAPER_NAMES)(
    'has on %s one horizontal and one vertical line of the drawn lengths, ticked every 10 mm',
    (name) => {
      const { drawnMm, paths } = calibrationPage(PAPER_SIZES[name], NOW);
      const lines = paths.map((p) => straight(p.path)).filter((line) => line !== null);
      const horizontal = lines.filter((l) => l.a.y === l.b.y && l.b.x - l.a.x === drawnMm.x);
      const vertical = lines.filter((l) => l.a.x === l.b.x && l.b.y - l.a.y === drawnMm.y);
      expect(horizontal).toHaveLength(1);
      expect(vertical).toHaveLength(1);

      // A tick across each line at every centimetre, its ends included.
      const h = horizontal[0]!;
      const v = vertical[0]!;
      const short = (l: (typeof lines)[number]) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) <= 10;
      const ticksAcross = lines.filter(
        (l) => short(l) && l.a.x === l.b.x && l.a.y < h.a.y && l.b.y >= h.a.y,
      );
      const ticksDown = lines.filter(
        (l) => short(l) && l.a.y === l.b.y && l.a.x <= v.a.x && l.b.x > v.a.x,
      );
      expect(ticksAcross.map((l) => l.a.x - h.a.x)).toEqual(
        Array.from({ length: drawnMm.x / 10 + 1 }, (_, i) => i * 10),
      );
      expect(ticksDown.map((l) => l.a.y - v.a.y)).toEqual(
        Array.from({ length: drawnMm.y / 10 + 1 }, (_, i) => i * 10),
      );
    },
  );

  it('says how long each line is drawn, so a maker knows what to measure against', () => {
    const sources = calibrationPage(PAPER_SIZES.A4, NOW).texts.map((t) => t.source);
    expect(sources).toContain('Horizontal line: 190 mm');
    expect(sources).toContain('Vertical line: 200 mm');
    expect(sources).toContain('2026-10-28 · LeatherCAD');
  });
});
