import {
  MatOps,
  PathOps,
  RectOps,
  SegmentOps,
  Vec2Ops,
  arc,
  cubic,
  open,
  polyline,
  type Mat2x3,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import { FONT, contoursOf, layoutText } from '@leathercad/typography';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { renderDisplayList, type Canvas2DLike } from './canvas2d/backend.js';
import { documentTextItem, type DisplayItem } from './displayList.js';
import {
  EDGE_PX,
  extentOf,
  itemsReachingView,
  reachesView,
  unionExtent,
  type BoundedItem,
} from './extent.js';
import { worldToScreen, type ViewportView } from './view.js';

/**
 * The Sheets view leaves out a page the camera cannot see (PERF-003). Leaving
 * out one it can see would blank part of the paper, so the rule is tested for
 * what it must never do first — against the screen transform, not against the
 * millimetre arithmetic it is built from.
 */

const arbView: fc.Arbitrary<ViewportView> = fc.record({
  centreMm: fc.record({
    x: fc.double({ min: -3000, max: 3000, noNaN: true }),
    y: fc.double({ min: -3000, max: 3000, noNaN: true }),
  }),
  // From the zoom limits at 1 % to 10 000 % on a 1x display, and 2x of both.
  scale: fc.double({ min: 0.0378, max: 378, noNaN: true }),
  widthPx: fc.integer({ min: 200, max: 3000 }),
  heightPx: fc.integer({ min: 200, max: 2000 }),
  dpr: fc.constantFrom(1, 1.25, 2),
});

const arbPoint: fc.Arbitrary<Vec2> = fc.record({
  x: fc.double({ min: -4000, max: 4000, noNaN: true }),
  y: fc.double({ min: -4000, max: 4000, noNaN: true }),
});

const arbDirection = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true });

/** Where a device pixel of the canvas is, so inside means on the canvas. */
function onCanvas(view: ViewportView, at: Vec2): boolean {
  return at.x >= 0 && at.x <= view.widthPx && at.y >= 0 && at.y <= view.heightPx;
}

const word = (at: Vec2, text: string, sizePx = 12): BoundedItem => ({
  kind: 'overlay-text',
  role: 'construction',
  at,
  text,
  sizePx,
  colour: '#000',
});

const line = (a: Vec2, b: Vec2, widthPx = 1): BoundedItem => ({
  kind: 'path',
  role: 'cut',
  path: polyline([a, b]),
  stroke: { colour: '#000', widthPx },
});

describe('what a page can reach (extentOf)', () => {
  it('has the box of a path and half its width, and a pixel for the edge', () => {
    const extent = extentOf([line({ x: 1, y: 2 }, { x: 11, y: 7 }, 4)]);
    expect(extent?.boundsMm).toEqual({ minX: 1, minY: 2, maxX: 11, maxY: 7 });
    expect(extent?.marginPx).toBe(2 + EDGE_PX);
  });

  it('has nothing for items that draw nothing', () => {
    expect(extentOf([])).toBeNull();
    expect(extentOf([{ kind: 'fill', role: 'cut', paths: [], colour: '#000' }])).toBeNull();
  });

  it('holds every item, with the widest margin', () => {
    const extent = extentOf([
      line({ x: 0, y: 0 }, { x: 5, y: 0 }),
      word({ x: 40, y: 30 }, 'Sheet 3 of 33', 12),
    ])!;
    expect(extent.boundsMm).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 30 });
    expect(extent.marginPx).toBeGreaterThanOrEqual('Sheet 3 of 33'.length * 12);
  });

  it('is the same whichever way two extents are joined', () => {
    const a = extentOf([line({ x: 0, y: 0 }, { x: 5, y: 1 }, 3)])!;
    const b = extentOf([word({ x: 9, y: 9 }, 'x')])!;
    expect(unionExtent(a, b)).toEqual(unionExtent(b, a));
  });
});

describe('what the camera can see (reachesView)', () => {
  it('never leaves out a word the canvas shows any of, however far the page is from it', () => {
    fc.assert(
      fc.property(
        arbView,
        arbPoint,
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 8, max: 20 }),
        // A pixel of the word, anywhere within its reach of where it is placed.
        arbDirection,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (view, at, text, sizePx, direction, fraction) => {
          const extent = extentOf([word(at, text, sizePx)])!;
          const anchor = MatOps.apply(worldToScreen(view), at);
          // The furthest a character is from its anchor, in device pixels.
          const reach = text.length * sizePx * view.dpr * fraction;
          const inked = {
            x: anchor.x + Math.cos(direction) * reach,
            y: anchor.y + Math.sin(direction) * reach,
          };
          if (onCanvas(view, inked)) expect(reachesView(view, extent)).toBe(true);
        },
      ),
    );
  });

  it('never leaves out a line whose stroke reaches the canvas, however little', () => {
    fc.assert(
      fc.property(
        arbView,
        arbPoint,
        arbPoint,
        fc.double({ min: 0.5, max: 12, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        arbDirection,
        (view, a, b, widthPx, along, direction) => {
          const item = line(a, b, widthPx);
          if (item.kind !== 'path') throw new Error('not a path');
          const extent = extentOf([item])!;
          const [segment] = item.path.segments;
          const on = MatOps.apply(worldToScreen(view), SegmentOps.pointAt(segment!, along));
          // A pixel the stroke covers: up to half its width from the line.
          const half = (widthPx / 2) * view.dpr;
          const inked = {
            x: on.x + Math.cos(direction) * half,
            y: on.y + Math.sin(direction) * half,
          };
          if (onCanvas(view, inked)) expect(reachesView(view, extent)).toBe(true);
        },
      ),
    );
  });

  it('counts touching the canvas as reaching it', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 2,
      widthPx: 200,
      heightPx: 200,
      dpr: 1,
    };
    // At 2 px a millimetre the canvas shows x from -50 to 50 mm.
    const edge = 50;
    const touching = { boundsMm: { minX: edge, minY: 0, maxX: edge + 5, maxY: 5 }, marginPx: 0 };
    expect(reachesView(view, touching)).toBe(true);
    expect(
      reachesView(view, { ...touching, boundsMm: { ...touching.boundsMm, minX: edge + 1 } }),
    ).toBe(false);
  });

  it('leaves out a page far off a canvas that shows another', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 1,
      widthPx: 400,
      heightPx: 300,
      dpr: 1,
    };
    const near = extentOf([line({ x: -10, y: -10 }, { x: 10, y: 10 })])!;
    const far = extentOf([line({ x: 5000, y: 0 }, { x: 5100, y: 10 })])!;
    expect(reachesView(view, near)).toBe(true);
    expect(reachesView(view, far)).toBe(false);
  });

  it('is the same on a 2x display as on a 1x display showing the same millimetres', () => {
    fc.assert(
      fc.property(arbView, arbPoint, arbPoint, (view, a, b) => {
        const extent = extentOf([line(a, b)])!;
        // The same millimetres on screen, at twice the pixels: CSS sizes are
        // the same, so the answer is.
        const doubled: ViewportView = {
          ...view,
          scale: view.scale * 2,
          widthPx: view.widthPx * 2,
          heightPx: view.heightPx * 2,
          dpr: view.dpr * 2,
        };
        expect(reachesView(doubled, extent)).toBe(reachesView(view, extent));
      }),
    );
  });
});

/**
 * The Design board leaves out an item the camera cannot see (PERF-008). Left
 * out wrongly, a line, a halo, a word or a marker would vanish from the board
 * while the maker looks at it — so the rule is tested against what the canvas
 * backend actually draws, item by item, kind by kind.
 */
describe('what the board leaves out (itemsReachingView)', () => {
  /** Nowhere: a clip that cuts away everything. */
  const NOWHERE: Rect = { minX: -1e12, minY: -1e12, maxX: -1e12, maxY: -1e12 };

  /**
   * A canvas that keeps, for everything the backend inks, a device-pixel box
   * the ink cannot reach past: the points a path is traced through — a curve
   * lies in the hull of its control points, an arc in its circle's box — grown
   * by half the stroke and cut to the clip; a word's glyphs from the vendored
   * outlines, wherever it is aligned and whatever baseline it hangs from. Each
   * is grown by one more pixel, the one antialiased beside an edge.
   */
  function inkOf(items: readonly DisplayItem[], view: ViewportView): Rect[] {
    const inked: Rect[] = [];
    let transform: Mat2x3 = MatOps.IDENTITY;
    let clip: Rect | null = null;
    let traced: Vec2[] = [];
    const saved: { transform: Mat2x3; clip: Rect | null; lineWidth: number; font: string }[] = [];
    const scale = (): number =>
      Math.sqrt(Math.abs(transform.a * transform.d - transform.b * transform.c));
    const trace = (x: number, y: number): void => {
      traced.push(MatOps.apply(transform, { x, y }));
    };
    /** A curve's exact box, from `geometry`; the transforms here never turn, so its corners map exactly. */
    const traceBox = (box: Rect, through: Mat2x3): void => {
      for (const corner of RectOps.corners(box)) traced.push(MatOps.apply(through, corner));
    };
    const ink = (box: Rect | null, reach: number): void => {
      if (box === null) return;
      const grown = RectOps.expand(box, reach + 1);
      const cut = clip === null ? grown : RectOps.intersection(grown, clip);
      if (cut !== null) inked.push(cut);
    };
    const word = (text: string, x: number, y: number, reach: number): void => {
      const sizePx = Number(/([\d.e+-]+)px/.exec(ctx.font)?.[1]);
      const layout = layoutText(text, sizePx);
      const perUnit = sizePx / FONT.unitsPerEm;
      // In the word's own space, y down as the canvas has it.
      const glyphs = layout.glyphs.flatMap((glyph) => {
        const outline = RectOps.unionAll(
          contoursOf(FONT.glyphs[glyph.character] ?? FONT.notdef).flatMap(
            (contour) => PathOps.bbox(contour) ?? [],
          ),
        );
        return outline === null
          ? []
          : [
              {
                minX: glyph.xMm + outline.minX * perUnit,
                maxX: glyph.xMm + outline.maxX * perUnit,
                minY: -outline.maxY * perUnit,
                maxY: -outline.minY * perUnit,
              },
            ];
      });
      const box = RectOps.unionAll(glyphs);
      if (box === null) return;
      // Aligned anywhere from its start to its end; hung from anywhere between
      // the line's top and its bottom.
      const placed = {
        minX: x + box.minX - layout.widthMm,
        maxX: x + box.maxX,
        minY: y + box.minY - layout.descentMm,
        maxY: y + box.maxY + layout.ascentMm,
      };
      ink(
        RectOps.fromPoints(RectOps.corners(placed).map((p) => MatOps.apply(transform, p))),
        reach,
      );
    };
    const ctx: Canvas2DLike = {
      save: () => {
        saved.push({ transform, clip, lineWidth: ctx.lineWidth, font: ctx.font });
      },
      restore: () => {
        const state = saved.pop();
        if (state === undefined) return;
        ({ transform, clip } = state);
        ctx.lineWidth = state.lineWidth;
        ctx.font = state.font;
      },
      setTransform: (a, b, c, d, e, f) => {
        transform = { a, b, c, d, e, f };
      },
      clearRect: () => undefined,
      fillRect: () => undefined,
      beginPath: () => {
        traced = [];
      },
      closePath: () => undefined,
      moveTo: trace,
      lineTo: trace,
      bezierCurveTo: (x1, y1, x2, y2, x, y) => {
        const from = traced.at(-1) ?? MatOps.apply(transform, { x: x1, y: y1 });
        const [p1, p2, p3] = [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x, y },
        ].map((p) => MatOps.apply(transform, p));
        traceBox(SegmentOps.bbox(cubic(from, p1!, p2!, p3!)), MatOps.IDENTITY);
        trace(x, y);
      },
      arc: (x, y, radius, start, end) => {
        // The backend's sweeps keep to a turn; a full one is the circle.
        const sweep = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, end - start));
        traceBox(SegmentOps.bbox(arc({ x, y }, radius, start, sweep)), transform);
        trace(x + radius * Math.cos(start + sweep), y + radius * Math.sin(start + sweep));
      },
      stroke: () => ink(RectOps.fromPoints(traced), (ctx.lineWidth * scale()) / 2),
      fill: () => ink(RectOps.fromPoints(traced), 0),
      clip: () => {
        const box = RectOps.fromPoints(traced) ?? NOWHERE;
        clip = clip === null ? box : (RectOps.intersection(clip, box) ?? NOWHERE);
      },
      fillText: (text, x, y) => word(text, x, y, 0),
      strokeText: (text, x, y) => word(text, x, y, (ctx.lineWidth * scale()) / 2),
      setLineDash: () => undefined,
      lineWidth: 1,
      strokeStyle: '',
      fillStyle: '',
      font: '10px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      lineCap: 'butt',
      lineJoin: 'miter',
    };
    renderDisplayList(ctx, { items }, view);
    return inked;
  }

  const onTheCanvas = (view: ViewportView, box: Rect): boolean =>
    box.maxX >= 0 && box.minX <= view.widthPx && box.maxY >= 0 && box.minY <= view.heightPx;

  /** A camera anywhere from 1 % to 10 000 %, on a 1x, 1.25x or 2x display. */
  const arbCamera: fc.Arbitrary<ViewportView> = fc.record({
    centreMm: fc.record({
      x: fc.double({ min: -300, max: 300, noNaN: true }),
      y: fc.double({ min: -300, max: 300, noNaN: true }),
    }),
    scale: fc.double({ min: 0.0378, max: 378, noNaN: true }),
    widthPx: fc.integer({ min: 100, max: 2500 }),
    heightPx: fc.integer({ min: 100, max: 1500 }),
    dpr: fc.constantFrom(1, 1.25, 2),
  });

  /**
   * Where an item's points are, around what the camera shows: anywhere, or
   * all in a band beside one edge — a little inside it, or past it by up to a
   * few device pixels or a few hundred — where leaving out is a close call.
   */
  const arbPoints = (view: ViewportView): fc.Arbitrary<fc.Arbitrary<Vec2>> => {
    const inverse = MatOps.invert(worldToScreen(view));
    const at = (x: number, y: number): Vec2 => MatOps.apply(inverse, { x, y });
    const { widthPx: w, heightPx: h } = view;
    const share = fc.double({ min: 0, max: 1, noNaN: true });
    return fc.oneof(
      fc.constant(
        fc
          .record({
            x: fc.double({ min: -0.6, max: 1.6, noNaN: true }),
            y: fc.double({ min: -0.6, max: 1.6, noNaN: true }),
          })
          .map(({ x, y }) => at(x * w, y * h)),
      ),
      fc
        .record({
          edge: fc.constantFrom('left', 'right', 'top', 'bottom'),
          pastPx: fc.constantFrom(40, 400),
        })
        .map(({ edge, pastPx }) =>
          fc
            .tuple(share, fc.double({ min: -10, max: pastPx, noNaN: true }))
            .map(([along, past]) =>
              edge === 'left'
                ? at(-past, along * h)
                : edge === 'right'
                  ? at(w + past, along * h)
                  : edge === 'top'
                    ? at(along * w, -past)
                    : at(along * w, h + past),
            ),
        ),
    );
  };

  const arbPath = (view: ViewportView, point: fc.Arbitrary<Vec2>): fc.Arbitrary<Path> =>
    fc.oneof(
      fc
        .tuple(fc.array(point, { minLength: 2, maxLength: 5 }), fc.boolean())
        .map(([points, closed]) => polyline(points, closed)),
      fc
        .tuple(
          point,
          // A few device pixels across, or a few hundred.
          fc.double({ min: 0.5, max: 600, noNaN: true }).map((px) => px / view.scale),
          fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
          fc.double({ min: -2 * Math.PI, max: 2 * Math.PI, noNaN: true }),
        )
        .filter(([, , , sweep]) => Math.abs(sweep) > 1e-3)
        .map(([centre, radius, start, sweep]) => open([arc(centre, radius, start, sweep)])),
      fc.tuple(point, point, point, point).map(([a, b, c, d]) => open([cubic(a, b, c, d)])),
    );

  /** Characters the vendored outlines have, so the canvas's ink can be known. */
  const arbWords = fc
    .array(fc.constantFrom(...Object.keys(FONT.glyphs)), { minLength: 1, maxLength: 24 })
    .map((characters) => characters.join(''));

  const arbItem = (view: ViewportView, point: fc.Arbitrary<Vec2>): fc.Arbitrary<DisplayItem> => {
    const widthPx = fc.double({ min: 0.5, max: 24, noNaN: true });
    return fc.oneof(
      fc
        .tuple(arbPath(view, point), widthPx, fc.boolean())
        .map(([path, width, dashed]): DisplayItem => ({
          kind: 'path',
          role: 'cut',
          path,
          stroke: { colour: '#000', widthPx: width, ...(dashed ? { dashMm: [3, 2] } : {}) },
        })),
      fc
        .array(arbPath(view, point), { minLength: 1, maxLength: 3 })
        .map((paths): DisplayItem => ({ kind: 'fill', role: 'cut', paths, colour: '#000' })),
      fc
        .tuple(arbPath(view, point), fc.double({ min: 2, max: 16, noNaN: true }), widthPx)
        .map(([path, spacingPx, width]): DisplayItem => ({
          kind: 'hatch',
          role: 'cut',
          path,
          colour: '#000',
          spacingPx,
          widthPx: width,
        })),
      fc
        .tuple(fc.array(fc.tuple(point, point), { minLength: 1, maxLength: 6 }), widthPx)
        .map(([slits, width]): DisplayItem => ({
          kind: 'slits',
          role: 'stitch',
          slits,
          stroke: { colour: '#000', widthPx: width },
        })),
      fc
        .tuple(
          fc.array(point, { minLength: 1, maxLength: 6 }),
          fc.double({ min: 1, max: 8, noNaN: true }),
        )
        .map(([points, radiusPx]): DisplayItem => ({
          kind: 'dots',
          role: 'construction',
          points,
          radiusPx,
          fill: '#000',
        })),
      fc
        .record({
          at: point,
          text: arbWords,
          sizePx: fc.double({ min: 6, max: 40, noNaN: true }),
          halo: fc.option(fc.double({ min: 0.5, max: 6, noNaN: true }), { nil: undefined }),
          rotationRad: fc.option(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), {
            nil: undefined,
          }),
          align: fc.constantFrom<CanvasTextAlign>('left', 'center', 'right', 'start', 'end'),
          baseline: fc.constantFrom<CanvasTextBaseline>(
            'alphabetic',
            'top',
            'middle',
            'bottom',
            'hanging',
            'ideographic',
          ),
        })
        .map(({ halo, rotationRad, ...rest }): DisplayItem => ({
          kind: 'overlay-text',
          role: 'construction',
          colour: '#000',
          ...rest,
          ...(halo === undefined ? {} : { halo: { colour: '#fff', widthPx: halo } }),
          ...(rotationRad === undefined ? {} : { rotationRad }),
        })),
      fc
        .tuple(
          point,
          arbWords,
          fc.double({ min: 0.5, max: 60, noNaN: true }),
          fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        )
        .map(([at, text, sizeMm, rotationRad]) =>
          documentTextItem('construction', at, text, sizeMm, { rotationRad }),
        ),
      fc
        .tuple(point, fc.constantFrom<'valley' | 'mountain'>('valley', 'mountain'))
        .map(([at, fold]): DisplayItem => ({
          kind: 'fold-tick',
          role: 'fold',
          at,
          fold,
          colour: '#000',
        })),
      fc.tuple(point, arbDirection).map(([at, angle]): DisplayItem => ({
        kind: 'link-tick',
        role: 'stitch',
        at,
        tangent: { x: Math.cos(angle), y: Math.sin(angle) },
        colour: '#000',
      })),
      fc
        .tuple(
          point,
          fc.constantFrom<'error' | 'warning' | 'info'>('error', 'warning', 'info'),
          fc.boolean(),
        )
        .map(([at, glyph, selected]): DisplayItem => ({
          kind: 'marker',
          role: 'construction',
          at,
          glyph,
          colour: '#000',
          selected,
        })),
    );
  };

  const arbCameraAndItem = arbCamera.chain((view) =>
    arbPoints(view).chain((point) => fc.tuple(fc.constant(view), arbItem(view, point))),
  );

  /** That everything the backend inks for `item` is inside the extent it is given. */
  function expectInkInside(view: ViewportView, item: DisplayItem): void {
    const extent = extentOf([item]);
    const ink = inkOf([item], view);
    if (extent === null) {
      expect(ink).toEqual([]);
      return;
    }
    const reach = RectOps.fromPoints(
      RectOps.corners(extent.boundsMm).map((p) => MatOps.apply(worldToScreen(view), p)),
    )!;
    const allowed = RectOps.expand(reach, extent.marginPx * view.dpr);
    // At 10 000 % and far from the origin a pixel's coordinate runs to
    // millions: compared to the digits a double carries there.
    const slack = 1e-9 * Math.max(1, ...RectOps.corners(allowed).map(Vec2Ops.len));
    for (const box of ink) {
      expect(box.minX).toBeGreaterThanOrEqual(allowed.minX - slack);
      expect(box.minY).toBeGreaterThanOrEqual(allowed.minY - slack);
      expect(box.maxX).toBeLessThanOrEqual(allowed.maxX + slack);
      expect(box.maxY).toBeLessThanOrEqual(allowed.maxY + slack);
    }
  }

  it('gives every item of every kind an extent its ink stays inside, at any zoom', () => {
    fc.assert(
      fc.property(arbCameraAndItem, ([view, item]) => expectInkInside(view, item)),
      { numRuns: 2000 },
    );
  });

  it('reaches past a word of the widest characters, however it hangs and turns', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 2,
      widthPx: 400,
      heightPx: 300,
      dpr: 2,
    };
    for (const baseline of ['top', 'bottom'] as const) {
      for (const align of ['left', 'right'] as const) {
        for (const rotationRad of [0, Math.PI / 2, Math.PI / 4]) {
          for (const text of ['Œ', 'ŒŒŒŒŒŒŒŒ']) {
            expectInkInside(view, {
              kind: 'overlay-text',
              role: 'construction',
              at: { x: 3, y: 4 },
              text,
              sizePx: 18,
              colour: '#000',
              align,
              baseline,
              rotationRad,
              halo: { colour: '#fff', widthPx: 3 },
            });
          }
        }
      }
    }
  });

  it('leaves out only an item that puts no ink on the canvas, whatever its kind', () => {
    fc.assert(
      fc.property(arbCameraAndItem, ([view, item]) => {
        if (itemsReachingView({ items: [item] }, view).items.length > 0) return;
        for (const box of inkOf([item], view)) expect(onTheCanvas(view, box)).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });

  it('keeps what it keeps in the order it was drawn in', () => {
    fc.assert(
      fc.property(
        arbCamera.chain((view) =>
          arbPoints(view).chain((point) =>
            fc.tuple(fc.constant(view), fc.array(arbItem(view, point), { maxLength: 12 })),
          ),
        ),
        ([view, items]) => {
          const kept = itemsReachingView({ items }, view).items;
          expect(kept).toEqual(
            items.filter((item) => itemsReachingView({ items: [item] }, view).items.length > 0),
          );
        },
      ),
    );
  });

  it('keeps every item when the camera shows all of them', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 1,
      widthPx: 400,
      heightPx: 300,
      dpr: 1,
    };
    const items: DisplayItem[] = [
      line({ x: -10, y: -10 }, { x: 10, y: 10 }),
      word({ x: 0, y: 0 }, 'Card pocket'),
      {
        kind: 'marker',
        role: 'construction',
        at: { x: 5, y: 5 },
        glyph: 'error',
        colour: '#000',
        selected: false,
      },
    ];
    expect(itemsReachingView({ items }, view).items).toEqual(items);
  });

  it('leaves out an item far off a canvas that shows another', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 1,
      widthPx: 400,
      heightPx: 300,
      dpr: 1,
    };
    const near = line({ x: -10, y: -10 }, { x: 10, y: 10 });
    const far = line({ x: 5000, y: 0 }, { x: 5100, y: 10 });
    expect(itemsReachingView({ items: [far, near, far] }, view).items).toEqual([near]);
  });
});
