import { PathOps, RectOps, polyline } from '@leathercad/geometry';
import { SHEET, PAPER_FURNITURE } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SETUP, contentAreaMm, pageSetupOf } from './paper.js';
import { PRINT_STYLES, type ExportPart, type ExportScene } from './scene.js';
import { planSheets } from './sheetPlan.js';
import { sheetsView, tapeJoins } from './sheetsDisplay.js';
import { layoutSheets } from './sheetsLayout.js';

function part(id: string, widthMm: number, heightMm: number, x = 0, y = 0): ExportPart {
  return {
    id,
    name: id,
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x, y }, { x: x + widthMm, y: y + heightMm }),
    paths: [{ role: 'cut', style: PRINT_STYLES.cut, path: { segments: [], closed: true } }],
    texts: [],
  };
}
const scene = (parts: ExportPart[]): ExportScene => ({ projectName: 'Test', parts });

describe('tape joins on the design board (7.4b)', () => {
  it('draws each printed join where the plan puts it, on the piece where it sits', () => {
    // A 250 mm strap at (40, 300) on the board: A4 portrait tapes it across
    // two sheets with one vertical join.
    const plan = planSheets(scene([part('strap', 250, 20, 40, 300)]), DEFAULT_PAGE_SETUP);
    const joinX = plan.sheets[0]!.tile!.joinsMm.x;
    expect(joinX).toHaveLength(1);

    const lines = tapeJoins(plan).items.filter((item) => item.kind === 'path');
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    if (line.kind !== 'path') throw new Error('not a path');
    const segment = line.path.segments[0]!;
    if (segment.kind !== 'line') throw new Error('not a line');
    // Vertical, at the plan's join, spanning the strap where it sits.
    expect(segment.a.x).toBeCloseTo(joinX[0]!, 9);
    expect(segment.b.x).toBeCloseTo(joinX[0]!, 9);
    expect(Math.min(segment.a.y, segment.b.y)).toBeLessThan(300);
    expect(Math.max(segment.a.y, segment.b.y)).toBeGreaterThan(320);
    expect(joinX[0]!).toBeGreaterThan(40);
    expect(joinX[0]!).toBeLessThan(290);
  });

  it('is screen furniture: the not-ink colour, the printed rhythm, and a label', () => {
    const plan = planSheets(scene([part('strap', 250, 20)]), DEFAULT_PAGE_SETUP);
    const items = tapeJoins(plan, { dpr: 2 }).items;
    for (const item of items) {
      if (item.kind === 'path') {
        expect(item.stroke.colour).toBe(SHEET.furniture);
        expect(item.stroke.dashMm).toEqual(PAPER_FURNITURE.join.dashMm);
      } else if (item.kind === 'overlay-text') {
        expect(item.text).toBe('Tape join');
        expect(item.colour).toBe(SHEET.furniture);
        expect(item.sizePx).toBe(22);
      } else {
        throw new Error(`unexpected ${item.kind}`);
      }
    }
  });

  it('draws nothing when every piece prints whole', () => {
    const plan = planSheets(scene([part('strap', 250, 20)]), pageSetupOf('A4', 'landscape'));
    expect(tapeJoins(plan).items).toEqual([]);
  });

  it('draws both directions for a piece taped in a grid', () => {
    const plan = planSheets(scene([part('panel', 400, 300)]), DEFAULT_PAGE_SETUP);
    const vertical = plan.sheets.flatMap((s) => s.tile?.joinsMm.x ?? []);
    const horizontal = plan.sheets.flatMap((s) => s.tile?.joinsMm.y ?? []);
    const lines = tapeJoins(plan).items.filter((item) => item.kind === 'path');
    expect(lines).toHaveLength(new Set(vertical).size + new Set(horizontal).size);
    expect(new Set(vertical).size).toBeGreaterThan(0);
    expect(new Set(horizontal).size).toBeGreaterThan(0);
  });
});

/** A part with a real outline, so where it is drawn can be measured. */
function outlined(id: string, widthMm: number, heightMm: number, x = 0, y = 0): ExportPart {
  const corners = [
    { x, y },
    { x: x + widthMm, y },
    { x: x + widthMm, y: y + heightMm },
    { x, y: y + heightMm },
  ];
  return {
    ...part(id, widthMm, heightMm, x, y),
    paths: [{ role: 'cut', style: PRINT_STYLES.cut, path: polyline(corners, true) }],
  };
}

const NOW = new Date('2026-09-24T00:00:00.000Z');

describe('the Sheets view (7.4c)', () => {
  const plan = planSheets(
    scene([outlined('panel', 100, 70, 500, -40), outlined('strap', 250, 20, -80, 900)]),
    DEFAULT_PAGE_SETUP,
  );
  const layout = layoutSheets(plan);

  it('draws each piece exactly where the PDF puts it on its sheet', () => {
    const layers = sheetsView(plan, layout, { now: NOW });
    const drawn = layers.flatMap((layer) => layer.list.items);
    for (const frame of layout.frames) {
      for (const placement of plan.sheets[frame.index]!.placements) {
        const expected = RectOps.fromCorners(
          {
            x: frame.origin.x + placement.offsetMm.x + placement.part.boundsMm.minX,
            y: frame.origin.y + placement.offsetMm.y + placement.part.boundsMm.minY,
          },
          {
            x: frame.origin.x + placement.offsetMm.x + placement.part.boundsMm.maxX,
            y: frame.origin.y + placement.offsetMm.y + placement.part.boundsMm.maxY,
          },
        );
        const found = drawn.some((item) => {
          if (item.kind !== 'path' || item.role !== 'cut') return false;
          const box = PathOps.bbox(item.path)!;
          return (
            Math.abs(box.minX - expected.minX) < 1e-9 &&
            Math.abs(box.minY - expected.minY) < 1e-9 &&
            Math.abs(box.maxX - expected.maxX) < 1e-9 &&
            Math.abs(box.maxY - expected.maxY) < 1e-9
          );
        });
        expect(found, `${placement.part.id} on sheet ${String(frame.index + 1)}`).toBe(true);
      }
    }
  });

  it('draws what prints in grey ink, and only what does not print in colour', () => {
    const layers = sheetsView(plan, layout, { now: NOW });
    const grey = (hex: string) =>
      hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
    for (const item of layers.flatMap((layer) => layer.list.items)) {
      if (item.kind === 'overlay-text') {
        // Sheet numbers and a taped piece's name: screen only.
        expect(item.colour).toBe(SHEET.furniture);
      } else if (item.kind === 'path' && item.role !== 'construction') {
        expect(grey(item.stroke.colour), item.role).toBe(true);
      } else if (item.kind === 'fill' && item.role !== 'construction') {
        expect(grey(item.colour), item.role).toBe(true);
      }
    }
    const labels = layers
      .flatMap((layer) => layer.list.items)
      .flatMap((item) => (item.kind === 'overlay-text' ? [item.text] : []));
    expect(labels).toEqual([
      'Sheet 1 of 3',
      'Sheet 2 of 3',
      'Sheet 3 of 3',
      'strap, taped: sheets 2–3',
    ]);
  });

  it('clips each taped sheet to its printable area, as the PDF does', () => {
    const layers = sheetsView(plan, layout, { now: NOW });
    const clipped = layers.filter((layer) => layer.clipMm !== null);
    expect(clipped).toHaveLength(2);
    const area = contentAreaMm(DEFAULT_PAGE_SETUP);
    const frame = layout.frames[1]!;
    expect(clipped[0]!.clipMm).toEqual({
      minX: frame.origin.x + area.x,
      minY: frame.origin.y + area.y,
      maxX: frame.origin.x + area.x + area.widthMm,
      maxY: frame.origin.y + area.y + area.heightMm,
    });
  });

  it('haloes a selected piece, and changes nothing else', () => {
    const plain = sheetsView(plan, layout, { now: NOW });
    const chosen = sheetsView(plan, layout, { now: NOW, selected: new Set(['panel']) });
    const count = (layers: typeof plain) => layers.flatMap((l) => l.list.items).length;
    expect(count(chosen)).toBe(count(plain) + 1);
  });
});
