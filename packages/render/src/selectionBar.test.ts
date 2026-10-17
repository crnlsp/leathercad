import { DEFAULT_SETTINGS, evaluate, type Feature, type Project } from '@leathercad/domain';
import { MatOps, PathOps, RectOps, uniformRadii, type Rect, type Vec2 } from '@leathercad/geometry';
import { FONT } from '@leathercad/typography';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  placeSelectionBar,
  type PlacedSelectionBar,
  type SelectionBarInput,
} from './selectionBar.js';
import { buildDisplayList } from './buildDisplayList.js';
import type { DisplayItem } from './displayList.js';
import { CANVAS } from './theme/index.js';
import type { ChipBox, CssBox } from './valueChips.js';
import { worldToCss, type ViewportView } from './view.js';

const BAR: ChipBox = { width: 320, height: 56 };

/** 800 × 600 CSS px, `cssPxPerMm` CSS px to the millimetre, `centre` in the middle. */
const view = (centre: Vec2 = { x: 50, y: 25 }, cssPxPerMm = 2, dpr = 1): ViewportView => ({
  centreMm: centre,
  scale: cssPxPerMm * dpr,
  widthPx: 800 * dpr,
  heightPx: 600 * dpr,
  dpr,
});

/** A piece from (x, y) to (x + w, y + h), in millimetres. */
const piece = (x: number, y: number, w: number, h: number): Rect => ({
  minX: x,
  minY: y,
  maxX: x + w,
  maxY: y + h,
});

const input = (boundsMm: Rect, extra: Partial<SelectionBarInput> = {}): SelectionBarInput => ({
  boundsMm,
  size: BAR,
  ...extra,
});

/** The piece's box on screen. */
function onScreen(v: ViewportView, bounds: Rect): CssBox {
  const toCss = worldToCss(v);
  const a = MatOps.apply(toCss, { x: bounds.minX, y: bounds.maxY });
  const b = MatOps.apply(toCss, { x: bounds.maxX, y: bounds.minY });
  return { left: a.x, top: a.y, right: b.x, bottom: b.y };
}

const barBox = (placed: PlacedSelectionBar, size: ChipBox = BAR): CssBox => ({
  left: placed.at.x,
  top: placed.at.y,
  right: placed.at.x + size.width,
  bottom: placed.at.y + size.height,
});

const EPS = 1e-6;

/** Whether two boxes share any area; touching edges do not. */
const overlap = (a: CssBox, b: CssBox): boolean =>
  a.left < b.right - EPS &&
  b.left < a.right - EPS &&
  a.top < b.bottom - EPS &&
  b.top < a.bottom - EPS;

describe('placeSelectionBar (U.17, R-14)', () => {
  it('sits under the piece, its left edge on the piece’s', () => {
    const v = view();
    const bounds = piece(0, 0, 100, 50);
    const placed = placeSelectionBar(v, input(bounds))!;
    const box = onScreen(v, bounds);

    expect(placed.side).toBe('below');
    expect(placed.at.x).toBeCloseTo(box.left, 9);
    // Under the piece, and under a dimension's number on its lowest line.
    expect(placed.at.y).toBeGreaterThanOrEqual(
      box.bottom + CANVAS.text.value.lineHeightPx / 2 + CANVAS.text.haloPx,
    );
  });

  it('goes below the chips laid out under the piece, as below its dimension line', () => {
    const v = view();
    const bounds = piece(0, 0, 100, 50);
    const box = onScreen(v, bounds);
    const chip: CssBox = { left: 380, top: box.bottom + 8, right: 420, bottom: box.bottom + 32 };
    const placed = placeSelectionBar(v, input(bounds, { taken: [chip] }))!;

    expect(placed.side).toBe('below');
    expect(placed.at.y).toBeGreaterThanOrEqual(chip.bottom);
  });

  it('flips above the piece and its caption when there is no room below', () => {
    // The piece's foot near the canvas's.
    const v = view({ x: 50, y: 140 });
    const bounds = piece(0, 0, 100, 50);
    const box = onScreen(v, bounds);
    expect(box.bottom + BAR.height).toBeGreaterThan(600);

    const placed = placeSelectionBar(v, input(bounds))!;
    expect(placed.side).toBe('above');
    // Clear of the two lines of caption over the piece, and its gap.
    const caption = CANVAS.caption.gapPx + 2 * CANVAS.text.name.lineHeightPx;
    expect(placed.at.y + BAR.height).toBeLessThanOrEqual(box.top - caption + EPS);
  });

  it('is left out where there is room neither below nor above', () => {
    // Zoomed in: the piece fills the canvas.
    expect(placeSelectionBar(view({ x: 50, y: 25 }, 10), input(piece(0, 0, 100, 50)))).toBeNull();
  });

  it('is left out while the piece is out of view', () => {
    expect(placeSelectionBar(view({ x: 900, y: 900 }), input(piece(0, 0, 100, 50)))).toBeNull();
  });

  it('slides along clear of a control laid over the board, or flips', () => {
    const v = view();
    const bounds = piece(0, 0, 100, 50);
    const free = placeSelectionBar(v, input(bounds))!;
    // The legend, where the bar would go.
    const legend: CssBox = {
      left: free.at.x - 10,
      top: free.at.y - 4,
      right: free.at.x + 100,
      bottom: free.at.y + 40,
    };
    const placed = placeSelectionBar(v, input(bounds, { obstacles: [legend] }))!;
    expect(overlap(barBox(placed), legend)).toBe(false);
  });

  it('keeps inside the area a panel opened over the board leaves', () => {
    const v = view();
    const bounds = piece(0, 0, 100, 50);
    const area: CssBox = { left: 300, top: 0, right: 800, bottom: 600 };
    const placed = placeSelectionBar(v, input(bounds, { area }))!;
    expect(placed.at.x).toBeGreaterThanOrEqual(300);
  });

  it('never covers the piece, its chips or a control, and stays on the board, at any zoom', () => {
    const box = fc.record({
      left: fc.double({ min: 0, max: 800, noNaN: true }),
      top: fc.double({ min: 0, max: 600, noNaN: true }),
      width: fc.double({ min: 10, max: 200, noNaN: true }),
      height: fc.double({ min: 10, max: 80, noNaN: true }),
    });
    const toBox = (b: { left: number; top: number; width: number; height: number }): CssBox => ({
      left: b.left,
      top: b.top,
      right: b.left + b.width,
      bottom: b.top + b.height,
    });
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -300, max: 300, noNaN: true }),
          y: fc.double({ min: -300, max: 300, noNaN: true }),
        }),
        fc.double({ min: 0.05, max: 40, noNaN: true }),
        fc.constantFrom(1, 2),
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: 1, max: 300, noNaN: true }),
        fc.double({ min: 1, max: 300, noNaN: true }),
        fc.record({
          width: fc.double({ min: 40, max: 500, noNaN: true }),
          height: fc.double({ min: 20, max: 90, noNaN: true }),
        }),
        fc.array(box, { maxLength: 3 }),
        fc.array(box, { maxLength: 2 }),
        // A panel open over one side of the board, or none.
        fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: undefined }),
        fc.boolean(),
        (centre, zoom, dpr, x, y, w, h, size, taken, obstacles, panel, fromLeft) => {
          const v = view(centre, zoom, dpr);
          const bounds = piece(x, y, w, h);
          const area: CssBox | undefined =
            panel === undefined
              ? undefined
              : fromLeft
                ? { left: panel, top: 0, right: 800, bottom: 600 }
                : { left: 0, top: 0, right: 800 - panel, bottom: 600 };
          const placed = placeSelectionBar(
            v,
            input(bounds, {
              size,
              taken: taken.map(toBox),
              obstacles: obstacles.map(toBox),
              ...(area === undefined ? {} : { area }),
            }),
          );
          if (placed === null) return;
          if (area !== undefined) {
            expect(placed.at.x).toBeGreaterThanOrEqual(area.left - EPS);
            expect(placed.at.x + size.width).toBeLessThanOrEqual(area.right + EPS);
          }
          const bar = barBox(placed, size);
          expect(overlap(bar, onScreen(v, bounds))).toBe(false);
          for (const chip of taken) expect(overlap(bar, toBox(chip))).toBe(false);
          for (const control of obstacles) expect(overlap(bar, toBox(control))).toBe(false);
          // Inside the canvas, clear of its rulers.
          expect(bar.left).toBeGreaterThanOrEqual(CANVAS.ruler.leftThicknessPx - EPS);
          expect(bar.top).toBeGreaterThanOrEqual(CANVAS.ruler.thicknessPx - EPS);
          expect(bar.right).toBeLessThanOrEqual(800 + EPS);
          expect(bar.bottom).toBeLessThanOrEqual(600 + EPS);
        },
      ),
    );
  });

  it('prefers below: wherever there is room under the piece and nothing in the way, it goes there', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        fc.double({ min: 10, max: 120, noNaN: true }),
        fc.double({ min: 10, max: 60, noNaN: true }),
        (zoom, w, h) => {
          // The piece's top at the canvas's top quarter, its left at the middle.
          const v = view({ x: 0, y: 0 }, zoom);
          const bounds = piece(0, 300 / zoom - 60 / zoom - h, w, h);
          const box = onScreen(v, bounds);
          const placed = placeSelectionBar(v, input(bounds));
          if (box.bottom + 40 + BAR.height > 600) return;
          expect(placed?.side).toBe('below');
        },
      ),
    );
  });
});

describe('placeSelectionBar over a piece the display list captions (U.17)', () => {
  /** A `w` × `h` panel, its width dimensioned along its top edge `offset` mm out. */
  const panel = (w: number, h: number, offset: number): Project => {
    const outline: Feature = {
      id: 'outline',
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: {
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: 0, y: 0 },
          width: w,
          height: h,
          radii: uniformRadii(0),
          rotation: 0,
        },
      },
    };
    const width: Feature = {
      id: 'width',
      kind: 'measurement',
      name: 'Width',
      visible: true,
      locked: false,
      source: {
        kind: 'measurement',
        measure: 'horizontal',
        // Corners are numbered after each edge: 2 is the top left, 1 the top right.
        a: { kind: 'anchor', featureId: 'outline', anchor: 2 },
        b: { kind: 'anchor', featureId: 'outline', anchor: 1 },
        offsetMm: offset,
        precision: 1,
      },
    };
    return {
      id: 'p',
      name: 'Test',
      settings: DEFAULT_SETTINGS,
      parts: [{ id: 'part-1', name: 'Panel', quantity: 1, features: [outline, width] }],
    };
  };

  // A line's baseline, up from its bottom: as the board sets it.
  const em = (FONT.ascender - FONT.descender) / FONT.unitsPerEm;
  const below = (voice: { sizePx: number; lineHeightPx: number }): number =>
    (voice.lineHeightPx - em * voice.sizePx) / 2 -
    (FONT.descender / FONT.unitsPerEm) * voice.sizePx;

  it('flips over the caption the board draws, which sits over a dimension on top, at any zoom', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 6, noNaN: true }),
        fc.double({ min: 10, max: 150, noNaN: true }),
        fc.double({ min: 10, max: 120, noNaN: true }),
        fc.double({ min: 2, max: 20, noNaN: true }),
        (zoom, w, h, offset) => {
          // The piece's foot at the canvas's: no room under it.
          const v = view({ x: w / 2, y: 280 / zoom }, zoom);
          const resolved = evaluate(panel(w, h, offset));
          const bounds = RectOps.unionAll(
            resolved.parts[0]!.features.flatMap((entry) =>
              entry.ok ? (PathOps.bbox(entry.path) ?? []) : [],
            ),
          )!;
          // The dimension really is on top.
          expect(bounds.maxY).toBeGreaterThan(h + offset - 1);

          const list = buildDisplayList(resolved, {
            caption: (part) => ({ name: part.part.name, detail: '52 holes · 3.85 mm' }),
            view: v,
          });
          const name = list.items.find(
            (item): item is Extract<DisplayItem, { kind: 'overlay-text' }> =>
              item.kind === 'overlay-text' && item.text === 'Panel',
          )!;
          const baseline = MatOps.apply(worldToCss(v), name.at).y;
          const nameTop = baseline - (CANVAS.text.name.lineHeightPx - below(CANVAS.text.name));

          const placed = placeSelectionBar(v, input(bounds));
          // Too tall for the board above it, as well: left out.
          if (placed === null) return;
          expect(placed.side).toBe('above');
          expect(placed.at.y + BAR.height).toBeLessThanOrEqual(nameTop + EPS);
        },
      ),
    );
  });
});
