import { PathOps, RectOps, polyline, type Path } from '@leathercad/geometry';
import { CANVAS, GROUND, PAPER_FURNITURE, SHEET } from '@leathercad/render';
import fc from 'fast-check';
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
    // A 275 mm strap at (40, 300) on the board: A4 portrait tapes it across
    // two sheets with one vertical join.
    const plan = planSheets(scene([part('strap', 275, 20, 40, 300)]), DEFAULT_PAGE_SETUP);
    // Sheet 1 is its assembly map; its tiles follow (7.2).
    const joinX = plan.sheets[1]!.tile!.joinsMm.x;
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
    const plan = planSheets(scene([part('strap', 275, 20)]), DEFAULT_PAGE_SETUP);
    const items = tapeJoins(plan).items;
    for (const item of items) {
      if (item.kind === 'path') {
        expect(item.stroke.colour).toBe(SHEET.furniture);
        expect(item.stroke.dashMm).toEqual(PAPER_FURNITURE.join.dashMm);
      } else if (item.kind === 'overlay-text') {
        expect(item.text).toBe('Tape join');
        expect(item.colour).toBe(SHEET.furniture);
        // CSS pixels: the screen backends apply the display's ratio (U.1).
        expect(item.sizePx).toBe(SHEET.joinLabelPx);
      } else {
        throw new Error(`unexpected ${item.kind}`);
      }
    }
  });

  it('draws nothing when every piece prints whole', () => {
    const plan = planSheets(scene([part('strap', 275, 20)]), pageSetupOf('A4', 'landscape'));
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

  it('draws every join once, whatever the piece measures (Q38)', () => {
    // Two tiles name each join they share, and both name it with the same
    // arithmetic; joins closer than EPS_POINT are one join, and real ones are
    // a sheet apart.
    const size = fc.double({ min: 1, max: 3000, noNaN: true });
    fc.assert(
      fc.property(size, size, (widthMm, heightMm) => {
        const plan = planSheets(scene([part('panel', widthMm, heightMm)]), DEFAULT_PAGE_SETUP);
        const vertical = new Set(plan.sheets.flatMap((s) => s.tile?.joinsMm.x ?? []));
        const horizontal = new Set(plan.sheets.flatMap((s) => s.tile?.joinsMm.y ?? []));
        const lines = tapeJoins(plan).items.filter((item) => item.kind === 'path');
        return lines.length === vertical.size + horizontal.size;
      }),
      { numRuns: 50 },
    );
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
    scene([outlined('panel', 100, 70, 500, -40), outlined('strap', 275, 20, -80, 900)]),
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
        // Sheet numbers and a taped piece's name: screen only, never an ink grey.
        expect(item.colour).toBe(GROUND.label);
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
      'Sheet 1 of 4',
      'Sheet 2 of 4',
      'Sheet 3 of 4',
      'Sheet 4 of 4',
      'strap, taped: sheets 3–4',
    ]);
  });

  it('fills an arrowhead in its print grey, as the paper does (4.10b)', () => {
    const head = polyline(
      [
        { x: 0, y: 0 },
        { x: 2.5, y: 0.425 },
        { x: 2.5, y: -0.425 },
      ],
      true,
    );
    const marked: ExportPart = {
      ...outlined('panel', 100, 70),
      paths: [
        ...outlined('panel', 100, 70).paths,
        { role: 'annotation', style: PRINT_STYLES.annotation, path: head, filled: true },
      ],
    };
    const solo = planSheets(scene([marked]), DEFAULT_PAGE_SETUP);
    const items = sheetsView(solo, layoutSheets(solo), { now: NOW }).flatMap((l) => l.list.items);
    // The arrowhead: the one triangle among the strip's filled words.
    const triangle = (path: Path) => path.segments.length === 3;
    const heads = items.filter(
      (item) => item.kind === 'fill' && item.role === 'annotation' && item.paths.every(triangle),
    );
    expect(heads).toHaveLength(1);
    expect(heads[0]).toMatchObject({ colour: expect.stringMatching(/^#([0-9a-f]{2})\1\1$/) });
    expect(
      items.some(
        (item) => item.kind === 'path' && item.role === 'annotation' && triangle(item.path),
      ),
    ).toBe(false);
  });

  it("words the labels in the app's language, and says which pieces were turned (U.9)", () => {
    const words = {
      sheet: (n: number, count: number, pieces: number) =>
        `S${String(n)}/${String(count)}:${String(pieces)}`,
      turned: (names: readonly string[]) => `${names.join('+')} turned`,
      taped: (name: string, sheets: readonly number[]) => `${name} taped ${sheets.join('+')}`,
      assembly: (n: number, count: number, name: string) =>
        `S${String(n)}/${String(count)}:map of ${name}`,
    };
    const labels = sheetsView(plan, layout, { now: NOW, words })
      .flatMap((layer) => layer.list.items)
      .flatMap((item) => (item.kind === 'overlay-text' ? [item] : []));
    expect(labels.map((item) => item.text)).toEqual([
      'S1/4:1',
      'S2/4:map of strap',
      'S3/4:1',
      'S4/4:1',
      'strap taped 3+4',
    ]);
    // Readable on the sheets' ground: the board's 12 px voice at 600 (R-01).
    for (const item of labels) {
      expect(item.sizePx).toBe(CANVAS.text.name.sizePx);
      expect(item.weight).toBe(CANVAS.text.name.weight);
      expect(item.halo).toBeUndefined();
    }
    // Nothing was turned on A4 portrait, so nothing is captioned over a piece.
    expect(labels.some((item) => item.text.endsWith('turned'))).toBe(false);
  });

  it('names the pieces turned to save a sheet below it, on screen only (U.9)', () => {
    // The print test's panel and pocket: on A5 landscape the pocket shares the
    // panel's sheet only turned a quarter (7.8).
    const a5 = planSheets(
      scene([outlined('panel', 100, 78, 0, 0), outlined('pocket', 96, 60, 300, 0)]),
      pageSetupOf('A5', 'landscape'),
    );
    const turned = [...a5.parts.values()].filter((entry) => entry.turned).map((e) => e.partId);
    expect(turned).toEqual(['pocket']);
    const words = {
      sheet: () => '',
      turned: (names: readonly string[]) => `${names.join('+')} turned`,
      taped: () => '',
      assembly: () => '',
    };
    const layout5 = layoutSheets(a5);
    const caption = (given?: typeof words) =>
      sheetsView(a5, layout5, { now: NOW, ...(given === undefined ? {} : { words: given }) })
        .flatMap((layer) => layer.list.items)
        .flatMap((item) =>
          item.kind === 'overlay-text' && item.text.includes('turned') ? [item] : [],
        );

    const [item, ...rest] = caption(words);
    expect(rest).toEqual([]);
    expect(item!.text).toBe('pocket turned');
    // Under the sheet's bottom-left corner, in the ground's label colour — never over the pattern.
    const frame = layout5.frames[0]!;
    expect(item!.at).toEqual({ x: frame.origin.x, y: frame.origin.y - 2 });
    expect(item!.colour).toBe(GROUND.label);
    // Without the app's words, a package words nothing.
    expect(caption()).toEqual([]);
  });

  it('clips each taped sheet to its printable area, as the PDF does', () => {
    const layers = sheetsView(plan, layout, { now: NOW });
    const clipped = layers.filter((layer) => layer.clipMm !== null);
    expect(clipped).toHaveLength(2);
    const area = contentAreaMm(DEFAULT_PAGE_SETUP);
    const frame = layout.frames[2]!;
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
