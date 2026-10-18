import type { ParametricShape } from '@leathercad/domain';
import { MatOps, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CANVAS } from './theme/index.js';
import {
  VALUE_CHIPS,
  placeValueChips,
  type ChipBox,
  type CssBox,
  type ValueChip,
  type ValueChipsInput,
} from './valueChips.js';
import { worldToCss, type ViewportView } from './view.js';

type RectShape = Extract<ParametricShape, { type: 'rect' }>;

const EPS = 1e-6;

const rectShape = (
  width: number,
  height: number,
  { x = 0, y = 0, rotation = 0, radius = 4 } = {},
): RectShape => ({
  type: 'rect',
  origin: { x, y },
  width,
  height,
  rotation,
  radii: { bottomLeft: radius, bottomRight: radius, topRight: radius, topLeft: radius },
});

const SIZES: Readonly<Record<ValueChip, ChipBox>> = {
  width: { width: 40, height: 20 },
  height: { width: 40, height: 20 },
  corner: { width: 44, height: 20 },
  margin: { width: 72, height: 20 },
};

/** 800 × 600 CSS px, 2 CSS px to the millimetre, the rectangle's centre in the middle. */
const view = (centre: Vec2 = { x: 50, y: 25 }, cssPxPerMm = 2, dpr = 1): ViewportView => ({
  centreMm: centre,
  scale: cssPxPerMm * dpr,
  widthPx: 800 * dpr,
  heightPx: 600 * dpr,
  dpr,
});

const input = (shape: RectShape, extra: Partial<ValueChipsInput> = {}): ValueChipsInput => ({
  rect: shape,
  marginMm: 3.5,
  sizes: SIZES,
  ...extra,
});

/** A chip's box on screen, from its centre. */
const boxAt = (at: Vec2, size: ChipBox) => ({
  minX: at.x - size.width / 2,
  maxX: at.x + size.width / 2,
  minY: at.y - size.height / 2,
  maxY: at.y + size.height / 2,
});

/** The rectangle's four corners on screen, in CSS px. */
function cornersOnScreen(shape: RectShape, v: ViewportView): Vec2[] {
  const { origin, width, height, rotation } = shape;
  const centre = { x: origin.x + width / 2, y: origin.y + height / 2 };
  const turn = MatOps.fromRotationAround(centre, rotation);
  const toCss = worldToCss(v);
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + height },
    { x: origin.x, y: origin.y + height },
  ].map((p) => MatOps.apply(toCss, MatOps.apply(turn, p)));
}

/** Whether two convex polygons overlap by more than EPS: no separating axis among their edges. */
function overlaps(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!;
      const q = polygon[(i + 1) % polygon.length]!;
      const axis = { x: q.y - p.y, y: p.x - q.x };
      const project = (points: readonly Vec2[]) => points.map((r) => r.x * axis.x + r.y * axis.y);
      const pa = project(a);
      const pb = project(b);
      const length = Math.hypot(axis.x, axis.y);
      if (length === 0) continue;
      const gap = Math.max(Math.min(...pa) - Math.max(...pb), Math.min(...pb) - Math.max(...pa));
      if (gap / length >= -EPS) return false;
    }
  }
  return true;
}

/** Whether a point is inside a convex polygon, or within EPS of its edge. */
function insideConvex(polygon: readonly Vec2[], point: Vec2): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length === 0) return false;
    const side = ((q.x - p.x) * (point.y - p.y) - (q.y - p.y) * (point.x - p.x)) / length;
    if (Math.abs(side) <= EPS) continue;
    if (sign === 0) sign = Math.sign(side);
    else if (Math.sign(side) !== sign) return false;
  }
  return true;
}

const corners = (box: ReturnType<typeof boxAt>): Vec2[] => [
  { x: box.minX, y: box.minY },
  { x: box.maxX, y: box.minY },
  { x: box.maxX, y: box.maxY },
  { x: box.minX, y: box.maxY },
];

describe('placeValueChips', () => {
  it('puts width below, height at the right, the corner by the top right and the margin at the left', () => {
    // 100 × 50 mm at 2 px/mm: on screen from (300, 250) to (500, 350).
    const { at } = placeValueChips(view(), input(rectShape(100, 50)));
    expect(at.width!.x).toBeCloseTo(400, 6);
    expect(at.width!.y).toBeGreaterThan(350 + SIZES.width.height / 2);
    expect(at.height!.x).toBeGreaterThan(500 + SIZES.height.width / 2);
    expect(at.height!.y).toBeCloseTo(300, 6);
    expect(at.corner!.x).toBeGreaterThan(500);
    expect(at.corner!.y).toBeLessThan(250);
    // Inside the stitch line, 3.5 mm in: past 300 + 7 px of margin and the gap.
    expect(at.margin!.x - SIZES.margin.width / 2).toBeGreaterThanOrEqual(315 - 1e-6);
    expect(at.margin!.y).toBeCloseTo(300, 6);
  });

  it('places only the chips it is given a size for: no margin without a stitch line', () => {
    const { at } = placeValueChips(
      view(),
      input(rectShape(100, 50), { marginMm: null, sizes: { width: SIZES.width } }),
    );
    expect(Object.keys(at)).toEqual(['width']);
  });

  it('turns with the rectangle: width stays on the lower of its two long sides', () => {
    // Half a turn: its own top is now at the bottom, and still a width side.
    const turned = placeValueChips(view(), input(rectShape(100, 50, { rotation: Math.PI })));
    const straight = placeValueChips(view(), input(rectShape(100, 50)));
    for (const chip of VALUE_CHIPS) {
      expect(turned.at[chip]!.x).toBeCloseTo(straight.at[chip]!.x, 6);
      expect(turned.at[chip]!.y).toBeCloseTo(straight.at[chip]!.y, 6);
    }
  });

  it('draws a line for each chip it places, in the dimension’s colour', () => {
    const { lines } = placeValueChips(view(), input(rectShape(100, 50)));
    expect(lines.items.length).toBeGreaterThanOrEqual(4);
    expect(lines.items.every((item) => item.kind === 'path' && item.role === 'annotation')).toBe(
      true,
    );
  });

  it('leaves out a chip whose place is out of view, and slides one along its line into view', () => {
    // Panned so the rectangle runs from x = 700 to 900 on an 800 px canvas.
    const { at } = placeValueChips(view({ x: -150, y: 25 }), input(rectShape(100, 50)));
    expect(at.height).toBeUndefined();
    expect(at.corner).toBeUndefined();
    expect(at.margin).toBeDefined();
    // The width line's visible part is 700 to 800: the chip sits in the middle of
    // where its centre can be with all of it in view.
    const half = SIZES.width.width / 2;
    expect(at.width!.x).toBeCloseTo((700 + (800 - half)) / 2, 6);
  });

  it('keeps clear of a panel open over the board', () => {
    // The rectangle's right side is at x = 500; a panel covers the canvas from 600, then from 500.
    const clear = (right: number) =>
      placeValueChips(
        view(),
        input(rectShape(100, 50), { area: { left: 0, top: 0, right, bottom: 600 } }),
      ).at;
    expect(clear(600).height).toBeDefined();
    expect(clear(500).height).toBeUndefined();
    expect(clear(500).corner).toBeUndefined();
    expect(clear(500).width).toBeDefined();
  });

  it('says why under the chip, or over it at the canvas’s foot, inside the canvas', () => {
    const note = { chip: 'corner' as const, size: { width: 330, height: 36 } };
    const placed = placeValueChips(view(), input(rectShape(100, 50), { note }));
    const corner = placed.at.corner!;
    expect(placed.noteAt!.y).toBeCloseTo(corner.y + SIZES.corner.height / 2 + 4, 6);
    // Turned back from the right edge: 330 px from the corner chip would run past 800.
    expect(placed.noteAt!.x + 330).toBeLessThanOrEqual(800);

    // At the foot, the width chip's note goes above it.
    const low = placeValueChips(
      view({ x: 50, y: 130 }),
      input(rectShape(100, 50), { note: { chip: 'width', size: { width: 200, height: 36 } } }),
    );
    expect(low.noteAt!.y + 36).toBeLessThanOrEqual(low.at.width!.y - SIZES.width.height / 2);
    // No note for a chip out of view.
    expect(
      placeValueChips(view({ x: -150, y: 25 }), input(rectShape(100, 50), { note })).noteAt,
    ).toBeUndefined();
  });

  const shapes = fc
    .record({
      x: fc.double({ min: -300, max: 300, noNaN: true }),
      y: fc.double({ min: -300, max: 300, noNaN: true }),
      width: fc.double({ min: 0.5, max: 600, noNaN: true }),
      height: fc.double({ min: 0.5, max: 600, noNaN: true }),
      rotation: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      radius: fc.double({ min: 0, max: 0.5, noNaN: true }),
    })
    .map(({ x, y, width, height, rotation, radius }) =>
      rectShape(width, height, { x, y, rotation, radius: radius * Math.min(width, height) }),
    );

  const views = fc
    .record({
      x: fc.double({ min: -400, max: 400, noNaN: true }),
      y: fc.double({ min: -400, max: 400, noNaN: true }),
      zoom: fc.double({ min: 0.05, max: 40, noNaN: true }),
      dpr: fc.constantFrom(1, 2),
    })
    .map(({ x, y, zoom, dpr }) => view({ x, y }, zoom, dpr));

  const sizes = fc.record({
    width: fc.record({ width: fc.integer({ min: 24, max: 120 }), height: fc.constant(20) }),
    height: fc.record({ width: fc.integer({ min: 24, max: 120 }), height: fc.constant(20) }),
    corner: fc.record({ width: fc.integer({ min: 24, max: 120 }), height: fc.constant(20) }),
    margin: fc.record({ width: fc.integer({ min: 24, max: 120 }), height: fc.constant(20) }),
  });

  it('never puts width, height or corner over the shape', () => {
    fc.assert(
      fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
        const { at } = placeValueChips(v, input(shape, { sizes: chipSizes }));
        const outline = cornersOnScreen(shape, v);
        return (['width', 'height', 'corner'] as const).every((chip) => {
          const placed = at[chip];
          return (
            placed === undefined || !overlaps(outline, corners(boxAt(placed, chipSizes[chip])))
          );
        });
      }),
    );
  });

  it('keeps the margin chip on the leather inside the stitch line, clear of it', () => {
    fc.assert(
      fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
        const { at } = placeValueChips(v, input(shape, { sizes: chipSizes }));
        const placed = at.margin;
        if (placed === undefined) return true;
        // The rectangle 3.5 mm and the gap in from its edge, on screen.
        const inset = 3.5 + 8 / (v.scale / v.dpr);
        const inner = cornersOnScreen(
          {
            ...shape,
            origin: {
              x: Math.min(shape.origin.x, shape.origin.x + shape.width) + inset,
              y: Math.min(shape.origin.y, shape.origin.y + shape.height) + inset,
            },
            width: Math.abs(shape.width) - 2 * inset,
            height: Math.abs(shape.height) - 2 * inset,
          },
          v,
        );
        return corners(boxAt(placed, chipSizes.margin)).every((point) =>
          insideConvex(inner, point),
        );
      }),
    );
  });

  it('never puts a chip under a ruler or past the edge of the area it is given', () => {
    fc.assert(
      fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
        const area = {
          left: 0,
          top: 0,
          right: v.widthPx / v.dpr - 120,
          bottom: v.heightPx / v.dpr,
        };
        const { at } = placeValueChips(v, input(shape, { sizes: chipSizes, area }));
        return VALUE_CHIPS.every((chip) => {
          const placed = at[chip];
          if (placed === undefined) return true;
          const box = boxAt(placed, chipSizes[chip]);
          return (
            box.minX >= CANVAS.ruler.leftThicknessPx - EPS &&
            box.minY >= CANVAS.ruler.thicknessPx - EPS &&
            box.maxX <= area.right + EPS &&
            box.maxY <= area.bottom + EPS
          );
        });
      }),
    );
  });

  it('keeps every size of a shape being drawn, pinned in view where its line is not (U.19)', () => {
    // 105 Tab 75 Tab 8 Enter is typed blind (U.16): a height chip left out
    // made Tab skip it, and the 75 went to the corner, or out of the chips
    // while the shape took the pointer's height. So while drawing, none is.
    const { at } = placeValueChips(
      view({ x: -150, y: 25 }),
      input(rectShape(100, 50), { keepAll: true }),
    );
    for (const chip of ['width', 'height', 'corner'] as const) {
      const box = boxAt(at[chip]!, SIZES[chip]);
      expect(box.maxX, chip).toBeLessThanOrEqual(800 + EPS);
      expect(box.minY, chip).toBeGreaterThanOrEqual(CANVAS.ruler.thicknessPx - EPS);
    }
  });

  it('places every chip it is given while a shape is drawn, inside the area, wherever the shape is', () => {
    fc.assert(
      fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
        const area = {
          left: 0,
          top: 0,
          right: v.widthPx / v.dpr - 120,
          bottom: v.heightPx / v.dpr,
        };
        const { width, height, corner } = chipSizes;
        const { at } = placeValueChips(
          v,
          input(shape, { sizes: { width, height, corner }, area, keepAll: true }),
        );
        return (['width', 'height', 'corner'] as const).every((chip) => {
          const placed = at[chip];
          if (placed === undefined) return false;
          const box = boxAt(placed, chipSizes[chip]);
          return (
            box.minX >= CANVAS.ruler.leftThicknessPx - EPS &&
            box.minY >= CANVAS.ruler.thicknessPx - EPS &&
            box.maxX <= area.right + EPS &&
            box.maxY <= area.bottom + EPS
          );
        });
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
        const a = placeValueChips(v, input(shape, { sizes: chipSizes }));
        const b = placeValueChips(v, input(shape, { sizes: chipSizes }));
        expect(a).toEqual(b);
      }),
    );
  });

  it('moves with a pan, exactly, while its lines stay in view', () => {
    // A canvas so large that nothing reaches its edge, so no chip slides.
    const huge = (centre: Vec2, zoom: number): ViewportView => ({
      centreMm: centre,
      scale: zoom,
      widthPx: 1e6,
      heightPx: 1e6,
      dpr: 1,
    });
    fc.assert(
      fc.property(
        shapes,
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (shape, zoom, dx, dy) => {
          const before = placeValueChips(huge(shape.origin, zoom), input(shape));
          // Panning the camera by (dx, dy) px moves the drawing the other way.
          const centre = { x: shape.origin.x - dx / zoom, y: shape.origin.y + dy / zoom };
          const after = placeValueChips(huge(centre, zoom), input(shape));
          for (const chip of VALUE_CHIPS) {
            // A margin chip with no room inside a small piece is left out either way.
            if (before.at[chip] === undefined) {
              expect(after.at[chip]).toBeUndefined();
              continue;
            }
            expect(after.at[chip]!.x).toBeCloseTo(before.at[chip]!.x + dx, 6);
            expect(after.at[chip]!.y).toBeCloseTo(before.at[chip]!.y + dy, 6);
          }
        },
      ),
    );
  });
  /** Whether a chip's box covers a control by more than EPS. */
  const covers = (box: ReturnType<typeof boxAt>, control: CssBox): boolean =>
    box.minX < control.right - EPS &&
    box.maxX > control.left + EPS &&
    box.minY < control.bottom - EPS &&
    box.maxY > control.top + EPS;

  it('slides the width along its line clear of a control laid over the board, such as the legend', () => {
    // The 100 × 50 rectangle's foot is at y = 350 px; its width sits centred at x = 400.
    const legend = { left: 280, top: 355, right: 420, bottom: 600 };
    const free = placeValueChips(view(), input(rectShape(100, 50))).at.width!;
    const placed = placeValueChips(view(), input(rectShape(100, 50), { obstacles: [legend] })).at
      .width!;
    expect(placed.y).toBeCloseTo(free.y, 9);
    expect(placed.x).toBeGreaterThan(free.x);
    expect(covers(boxAt(placed, SIZES.width), legend)).toBe(false);
  });

  it('leaves a chip out rather than cover a control it cannot get clear of', () => {
    // Along the whole foot of the canvas: nowhere on the width's line is clear.
    const foot = { left: 0, top: 355, right: 800, bottom: 600 };
    const at = placeValueChips(view(), input(rectShape(100, 50), { obstacles: [foot] })).at;
    expect(at.width).toBeUndefined();
    expect(at.height).toBeDefined();
    // The corner's place is a point, not a line: covered, it is left out.
    const corner = placeValueChips(view(), input(rectShape(100, 50))).at.corner!;
    const over = {
      left: corner.x - 30,
      top: corner.y - 30,
      right: corner.x + 30,
      bottom: corner.y + 30,
    };
    expect(
      placeValueChips(view(), input(rectShape(100, 50), { obstacles: [over] })).at.corner,
    ).toBeUndefined();
  });

  it('says why over its chip when a control covers the place under it', () => {
    const note = { chip: 'width' as const, size: { width: 200, height: 24 } };
    const under = placeValueChips(view(), input(rectShape(100, 50), { note })).noteAt!;
    const zoomControl = { left: under.x, top: under.y + 2, right: under.x + 200, bottom: 600 };
    const placed = placeValueChips(
      view(),
      input(rectShape(100, 50), { note, obstacles: [zoomControl] }),
    );
    expect(placed.noteAt!.y + note.size.height).toBeLessThan(placed.at.width!.y);
  });

  const controls = fc.array(
    fc
      .record({
        left: fc.integer({ min: 0, max: 780 }),
        top: fc.integer({ min: 0, max: 580 }),
        width: fc.integer({ min: 10, max: 300 }),
        height: fc.integer({ min: 10, max: 200 }),
      })
      .map(({ left, top, width, height }) => ({
        left,
        top,
        right: left + width,
        bottom: top + height,
      })),
    { maxLength: 3 },
  );

  it('never puts a chip over a control laid over the board', () => {
    fc.assert(
      fc.property(shapes, views, sizes, controls, (shape, v, chipSizes, obstacles) => {
        const { at } = placeValueChips(v, input(shape, { sizes: chipSizes, obstacles }));
        return VALUE_CHIPS.every((chip) => {
          const placed = at[chip];
          if (placed === undefined) return true;
          return obstacles.every((control) => !covers(boxAt(placed, chipSizes[chip]), control));
        });
      }),
    );
  });

  it('places every chip as before when no control is in the way', () => {
    const away = [{ left: 2000, top: 2000, right: 2100, bottom: 2100 }];
    fc.assert(
      fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
        const before = placeValueChips(v, input(shape, { sizes: chipSizes })).at;
        const after = placeValueChips(v, input(shape, { sizes: chipSizes, obstacles: away })).at;
        return JSON.stringify(after) === JSON.stringify(before);
      }),
    );
  });

  describe('the hint under the shape (U.16)', () => {
    const HINT: ChipBox = { width: 180, height: 22 };

    it('sits centred under the shape and under its width chip, and not over either', () => {
      const shape = rectShape(100, 50);
      const placed = placeValueChips(view(), input(shape, { hint: HINT }));
      const hint = placed.hintAt!;
      expect(hint.x + HINT.width / 2).toBeCloseTo(400, 6);
      const widthBox = boxAt(placed.at.width!, SIZES.width);
      expect(hint.y).toBeGreaterThanOrEqual(widthBox.maxY);
      expect(hint.y).toBeGreaterThan(350);
    });

    it('is left out when no hint is asked for', () => {
      expect(placeValueChips(view(), input(rectShape(100, 50))).hintAt).toBeUndefined();
    });

    it('goes over the shape where the canvas leaves no room under it, inside the area', () => {
      // The shape's foot is 20 px off the canvas's: no room under it.
      const shape = rectShape(100, 50, { y: -100 });
      const placed = placeValueChips(view({ x: 50, y: -75 }), input(shape, { hint: HINT }));
      const hint = placed.hintAt!;
      expect(hint.y + HINT.height).toBeLessThanOrEqual(600);
      expect(hint.y).toBeGreaterThanOrEqual(0);
    });

    it('never covers the shape or a chip, and stays inside the canvas’s width, for any shape and view', () => {
      fc.assert(
        fc.property(shapes, views, sizes, (shape, v, chipSizes) => {
          const placed = placeValueChips(v, input(shape, { hint: HINT, sizes: chipSizes }));
          const hint = placed.hintAt!;
          const box = corners({
            minX: hint.x,
            maxX: hint.x + HINT.width,
            minY: hint.y,
            maxY: hint.y + HINT.height,
          });
          const chipBoxes = VALUE_CHIPS.flatMap((chip) =>
            placed.at[chip] === undefined ? [] : [corners(boxAt(placed.at[chip], chipSizes[chip]))],
          );
          return (
            hint.x >= -EPS &&
            hint.x + HINT.width <= 800 + EPS &&
            !overlaps(box, cornersOnScreen(shape, v)) &&
            chipBoxes.every((chipBox) => !overlaps(box, chipBox))
          );
        }),
      );
    });
  });
});
