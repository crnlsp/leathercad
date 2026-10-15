import { approxCmp, approxZero, type Mm } from '@leathercad/core';
import type { ParametricShape } from '@leathercad/domain';
import {
  MatOps,
  Vec2Ops,
  fittedRadii,
  polyline,
  type CornerRadii,
  type Vec2,
} from '@leathercad/geometry';

import { pathItem, type DisplayItem, type DisplayList } from './displayList.js';
import { CANVAS } from './theme/index.js';
import { cssPxPerMm, worldToCss, type ViewportView } from './view.js';

/** A size a selected rectangle shows on the board, to be typed over (R-12). */
export type ValueChip = 'width' | 'height' | 'corner' | 'margin';

/** In R-12's order, which `Tab` follows: W → H → corner → margin. */
export const VALUE_CHIPS: readonly ValueChip[] = ['width', 'height', 'corner', 'margin'];

/** A chip's size on screen, in CSS pixels, as the app measured it. */
export interface ChipBox {
  readonly width: number;
  readonly height: number;
}

/** A rectangle of the canvas, in CSS pixels from its top-left. */
export interface CssBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ValueChipsInput {
  readonly rect: Extract<ParametricShape, { type: 'rect' }>;
  /** How far in the stitch line runs, when one follows the outline; null with none. */
  readonly marginMm: Mm | null;
  /** Each chip to place, at its size on screen. A chip not here is not placed. */
  readonly sizes: Partial<Readonly<Record<ValueChip, ChipBox>>>;
  /**
   * Where on the canvas a chip may sit: clear of anything laid over the board,
   * such as a panel opened over it. The whole canvas when absent. Never under
   * the rulers, whatever this says.
   */
  readonly area?: CssBox;
  /** Why one chip's value cannot apply, said beside it: that chip, and the note's size. */
  readonly note?: { readonly chip: ValueChip; readonly size: ChipBox };
}

export interface PlacedValueChips {
  /** Each chip's centre, in CSS pixels; absent when its place is out of view. */
  readonly at: Partial<Readonly<Record<ValueChip, Vec2>>>;
  /** Their dimension lines and leaders, in millimetres: screen only, never printed. */
  readonly lines: DisplayList;
  /**
   * The note's top-left, in CSS pixels: under its chip, or over it where there
   * is no room under, kept inside the area. Absent with no note, or its chip
   * out of view.
   */
  readonly noteAt?: Vec2;
}

/** From the shape to a chip's nearer side. */
const GAP_PX = 8;
/** Extension lines start this far off the shape, and run this far past the dimension line. */
const EXTENSION_PX = { off: 2, past: 4 } as const;
/** A side's direction when it has none: a rectangle of no height. */
const ZERO_X: Vec2 = { x: 1, y: 0 };
/** Half a tick across each end of the margin. */
const TICK_PX = 3;
/** Between a chip and the note under it. */
const NOTE_GAP_PX = 4;

/**
 * Where a selected rectangle's value chips sit on screen, and the lines they
 * sit on (R-12, U.14): width on a dimension line along the lower of its two
 * width sides — away from the caption, which is above — height along the
 * right-hand one, the corner radius off the top-right corner, and the stitch
 * margin across the margin on the left. Turned rectangles turn with it.
 *
 * The three outside have their nearer side `GAP_PX` off the shape, so none
 * ever covers it; the margin's sits as far inside the stitch line. A chip on a
 * line slides along it to stay in view, and a chip whose place is out of view
 * — under a ruler, past the canvas, under a panel — is left out.
 * The app places an input at each centre and draws the lines on the board.
 */
export function placeValueChips(view: ViewportView, input: ValueChipsInput): PlacedValueChips {
  const { rect, marginMm, sizes } = input;
  const toCss = worldToCss(view);
  const toMm = MatOps.invert(toCss);
  const zoom = cssPxPerMm(view);
  const area = clearArea(view, input.area);

  // The rectangle's own frame, square-cornered, turned about its centre.
  const x0 = Math.min(rect.origin.x, rect.origin.x + rect.width);
  const y0 = Math.min(rect.origin.y, rect.origin.y + rect.height);
  const x1 = x0 + Math.abs(rect.width);
  const y1 = y0 + Math.abs(rect.height);
  const centreMm = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const turn = MatOps.fromRotationAround(centreMm, rect.rotation);
  const screen = (p: Vec2): Vec2 => MatOps.apply(toCss, MatOps.apply(turn, p));
  const centre = screen(centreMm);
  // Its own +X and +Y on screen, so a side's outward normal holds for any size.
  const across = Vec2Ops.normalise(
    Vec2Ops.sub(screen({ x: centreMm.x + 1, y: centreMm.y }), centre),
  );
  const up = Vec2Ops.normalise(Vec2Ops.sub(screen({ x: centreMm.x, y: centreMm.y + 1 }), centre));

  const corner: Record<keyof CornerRadii, Vec2> = {
    bottomLeft: screen({ x: x0, y: y0 }),
    bottomRight: screen({ x: x1, y: y0 }),
    topRight: screen({ x: x1, y: y1 }),
    topLeft: screen({ x: x0, y: y1 }),
  };
  const sides = {
    bottom: { a: corner.bottomLeft, b: corner.bottomRight, out: Vec2Ops.negate(up) },
    top: { a: corner.topLeft, b: corner.topRight, out: up },
    left: { a: corner.bottomLeft, b: corner.topLeft, out: Vec2Ops.negate(across) },
    right: { a: corner.bottomRight, b: corner.topRight, out: across },
  };
  const middle = (side: Side): Vec2 => Vec2Ops.midpoint(side.a, side.b);
  // The lower of the width sides on screen, and the further right of the
  // height sides. A tie, as at a quarter turn's last bit, goes to its own.
  const below = approxCmp(middle(sides.top).y, middle(sides.bottom).y) > 0 ? 'top' : 'bottom';
  const above = below === 'top' ? 'bottom' : 'top';
  const right = approxCmp(middle(sides.left).x, middle(sides.right).x) > 0 ? 'left' : 'right';
  const left = right === 'left' ? 'right' : 'left';

  const at: Partial<Record<ValueChip, Vec2>> = {};
  const lines: DisplayItem[] = [];
  const draw = (a: Vec2, b: Vec2): void => {
    if (approxZero(Vec2Ops.dist(a, b))) return;
    lines.push(pathItem('annotation', polyline([MatOps.apply(toMm, a), MatOps.apply(toMm, b)])));
  };

  /** A chip on a line along `side`, `GAP_PX` off it, as near its middle as stays in view. */
  const alongSide = (chip: ValueChip, side: Side): { at: Vec2; offset: number } | null => {
    const size = sizes[chip];
    if (size === undefined) return null;
    const offset = GAP_PX + support(size, side.out);
    const from = Vec2Ops.add(side.a, Vec2Ops.scale(side.out, offset));
    const to = Vec2Ops.add(side.b, Vec2Ops.scale(side.out, offset));
    const range = clip(from, to, shrink(area, size));
    if (range === null) return null;
    return { at: Vec2Ops.lerp(from, to, (range[0] + range[1]) / 2), offset };
  };

  for (const [chip, side] of [
    ['width', sides[below]],
    ['height', sides[right]],
  ] as const) {
    const placed = alongSide(chip, side);
    if (placed === null) continue;
    at[chip] = placed.at;
    // The dimension: its line through the chip, extension lines from the shape.
    const along = Vec2Ops.scale(side.out, placed.offset);
    for (const end of [side.a, side.b]) {
      draw(
        Vec2Ops.add(end, Vec2Ops.scale(side.out, EXTENSION_PX.off)),
        Vec2Ops.add(end, Vec2Ops.scale(side.out, placed.offset + EXTENSION_PX.past)),
      );
    }
    draw(Vec2Ops.add(side.a, along), Vec2Ops.add(side.b, along));
  }

  // Off the top-right corner, along its outward diagonal, clear of even the
  // square corner; a leader from the arc as drawn.
  const cornerSize = sizes.corner;
  if (cornerSize !== undefined) {
    const name = cornerOf(above, right);
    const n1 = sides[above].out;
    const n2 = sides[right].out;
    const diagonal = Vec2Ops.normalise(Vec2Ops.add(n1, n2));
    const sharp = corner[name];
    const centreAt = Vec2Ops.add(
      sharp,
      Vec2Ops.scale(diagonal, GAP_PX + support(cornerSize, diagonal)),
    );
    if (inside(centreAt, shrink(area, cornerSize))) {
      at.corner = centreAt;
      const radiusPx = fittedRadii(rect.radii, rect.width, rect.height)[name] * zoom;
      const onArc = Vec2Ops.sub(
        sharp,
        Vec2Ops.scale(Vec2Ops.add(n1, n2), radiusPx * (1 - Math.SQRT1_2)),
      );
      draw(onArc, Vec2Ops.add(sharp, Vec2Ops.scale(diagonal, GAP_PX)));
    }
  }

  // Across the margin at the left (R-12), on the leather just past the stitch
  // line, as the mockups show it: outside, the left ruler leaves a fitted
  // piece 26 px, and the chip would never show. It keeps inside the stitch
  // line all round, off the outline and the holes; where it cannot, it is left
  // out. A line from the edge across the margin to it, a tick at either end.
  const marginSize = sizes.margin;
  if (marginMm !== null && marginSize !== undefined) {
    const side = sides[left];
    const inward = Vec2Ops.negate(side.out);
    const length = Vec2Ops.dist(side.a, side.b);
    const along = length > 0 ? Vec2Ops.scale(Vec2Ops.sub(side.b, side.a), 1 / length) : ZERO_X;
    const clear = marginMm * zoom + GAP_PX;
    const depth = clear + support(marginSize, inward);
    const ends = clear + support(marginSize, along);
    const across = Vec2Ops.dist(middle(sides[left]), middle(sides[right]));
    if (depth + support(marginSize, inward) + clear <= across && 2 * ends <= length) {
      const from = Vec2Ops.add(
        Vec2Ops.add(side.a, Vec2Ops.scale(along, ends)),
        Vec2Ops.scale(inward, depth),
      );
      const to = Vec2Ops.add(
        Vec2Ops.sub(side.b, Vec2Ops.scale(along, ends)),
        Vec2Ops.scale(inward, depth),
      );
      const range = clip(from, to, shrink(area, marginSize));
      if (range !== null) {
        const centreAt = Vec2Ops.lerp(from, to, (range[0] + range[1]) / 2);
        at.margin = centreAt;
        const edge = Vec2Ops.sub(centreAt, Vec2Ops.scale(inward, depth));
        const stitch = Vec2Ops.add(edge, Vec2Ops.scale(inward, marginMm * zoom));
        draw(edge, Vec2Ops.add(edge, Vec2Ops.scale(inward, clear)));
        const tick = Vec2Ops.scale(along, TICK_PX);
        for (const end of [edge, stitch]) draw(Vec2Ops.sub(end, tick), Vec2Ops.add(end, tick));
      }
    }
  }

  const note = input.note === undefined ? undefined : noteBeside(input.note, sizes, at, area);
  return note === undefined
    ? { at, lines: { items: lines } }
    : { at, lines: { items: lines }, noteAt: note };
}

/** A note under its chip, its left edge on the chip's, turned back from the area's edges. */
function noteBeside(
  note: NonNullable<ValueChipsInput['note']>,
  sizes: ValueChipsInput['sizes'],
  at: Partial<Record<ValueChip, Vec2>>,
  area: CssBox,
): Vec2 | undefined {
  const centre = at[note.chip];
  const chip = sizes[note.chip];
  if (centre === undefined || chip === undefined) return undefined;
  const below = centre.y + chip.height / 2 + NOTE_GAP_PX;
  const above = centre.y - chip.height / 2 - NOTE_GAP_PX - note.size.height;
  const fitsBelow = below + note.size.height <= area.bottom;
  return {
    x: Math.max(area.left, Math.min(centre.x - chip.width / 2, area.right - note.size.width)),
    y: fitsBelow || above < area.top ? below : above,
  };
}

interface Side {
  readonly a: Vec2;
  readonly b: Vec2;
  /** Away from the rectangle, on screen. */
  readonly out: Vec2;
}

/** The corner where two sides meet. */
function cornerOf(widthSide: 'top' | 'bottom', heightSide: 'left' | 'right'): keyof CornerRadii {
  if (widthSide === 'top') return heightSide === 'right' ? 'topRight' : 'topLeft';
  return heightSide === 'right' ? 'bottomRight' : 'bottomLeft';
}

/** How far a box reaches from its centre towards `direction`, a unit vector. */
function support(box: ChipBox, direction: Vec2): number {
  return (Math.abs(direction.x) * box.width + Math.abs(direction.y) * box.height) / 2;
}

/** The canvas inside its rulers, within the area given. */
function clearArea(view: ViewportView, given: CssBox | undefined): CssBox {
  const width = view.widthPx / view.dpr;
  const height = view.heightPx / view.dpr;
  return {
    left: Math.max(given?.left ?? 0, CANVAS.ruler.leftThicknessPx),
    top: Math.max(given?.top ?? 0, CANVAS.ruler.thicknessPx),
    right: Math.min(given?.right ?? width, width),
    bottom: Math.min(given?.bottom ?? height, height),
  };
}

/** Where a box's centre may be for all of it to be inside `area`. */
function shrink(area: CssBox, box: ChipBox): CssBox {
  return {
    left: area.left + box.width / 2,
    top: area.top + box.height / 2,
    right: area.right - box.width / 2,
    bottom: area.bottom - box.height / 2,
  };
}

function inside(point: Vec2, area: CssBox): boolean {
  return (
    point.x >= area.left && point.x <= area.right && point.y >= area.top && point.y <= area.bottom
  );
}

/** The part of the segment from `from` to `to` inside `area`, as a range of its parameter. */
function clip(from: Vec2, to: Vec2, area: CssBox): readonly [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  for (const [start, delta, low, high] of [
    [from.x, to.x - from.x, area.left, area.right],
    [from.y, to.y - from.y, area.top, area.bottom],
  ] as const) {
    if (approxZero(delta)) {
      if (start < low || start > high) return null;
      continue;
    }
    const a = (low - start) / delta;
    const b = (high - start) / delta;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return null;
  }
  return [t0, t1];
}
