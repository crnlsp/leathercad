import { MatOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';

import { valueReachPx } from './buildDisplayList.js';
import { CANVAS } from './theme/index.js';
import { blocked, clearArea, keptOff, type ChipBox, type CssBox } from './valueChips.js';
import { worldToCss, zoomPercent, type ViewportView } from './view.js';

export interface SelectionBarInput {
  /** The selected piece, every line of it that is drawn, in millimetres: what the bar never covers. */
  readonly boundsMm: Rect;
  /** The bar's size on screen, in CSS pixels, as the app measured it. */
  readonly size: ChipBox;
  /** What the piece has laid out round it on screen — its value chips — which the bar keeps clear of too. */
  readonly taken?: readonly CssBox[];
  /** Where on the canvas it may sit, as for the chips; the whole canvas when absent, never the rulers. */
  readonly area?: CssBox;
  /** Controls laid over the board — the legend, the zoom control — which it never covers. */
  readonly obstacles?: readonly CssBox[];
  /** The other pieces, drawn, in millimetres: the bar takes a side clear of them where one is (X33). */
  readonly others?: readonly Rect[];
}

export interface PlacedSelectionBar {
  /** Its top-left, in CSS pixels. */
  readonly at: Vec2;
  readonly side: 'below' | 'above' | 'right' | 'left';
}

/** Between the bar and what it sits under or over. */
const GAP_PX = 4;

/**
 * Where the selection bar sits (R-14, U.17): under the selected piece — under
 * its dimension lines and their numbers, and under its value chips — its left
 * edge on the piece's; over the piece and its caption where the canvas's foot
 * leaves no room under; and **left out** where there is room neither under
 * nor over, or the piece is out of view. It never covers the piece, at any
 * zoom: it is wholly under the lowest thing the piece lays out, or wholly
 * over the highest. Along its line it slides clear of a control laid over
 * the board, as a chip does, and stays inside the area. Where under or over
 * would cover another piece, it takes the first side clear of them all —
 * over, then beside to the right or left (X33) — and covers one only when
 * every side would.
 */
export function placeSelectionBar(
  view: ViewportView,
  input: SelectionBarInput,
): PlacedSelectionBar | null {
  const { size } = input;
  const toCss = worldToCss(view);
  const area = clearArea(view, input.area);
  const onScreen = (bounds: Rect): CssBox => {
    const corners = RectOps.corners(bounds).map((p) => MatOps.apply(toCss, p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  };
  const piece = onScreen(input.boundsMm);
  // Out of view, there is nothing on the board for it to be about.
  if (
    piece.right <= area.left ||
    piece.left >= area.right ||
    piece.bottom <= area.top ||
    piece.top >= area.bottom
  ) {
    return null;
  }
  if (size.width > area.right - area.left) return null;

  // A dimension's number sits on its line, so on the piece's lowest line it
  // reaches this far under the piece's extent, and on its highest this far
  // over — where the caption starts: its name and, at 40 % and over, its
  // detail. The display list's own measure, so the bar and the caption it
  // places cannot disagree.
  const { text, caption } = CANVAS;
  const value = valueReachPx();
  const lines = zoomPercent(view) >= caption.detailFromPercent ? 2 : 1;
  const captionReach = value.above + caption.gapPx + lines * text.name.lineHeightPx;
  const taken = input.taken ?? [];
  const low = Math.max(piece.bottom + value.below, ...taken.map((box) => box.bottom));
  const high = Math.min(piece.top - captionReach, ...taken.map((box) => box.top));

  const keepOff = keptOff(input.obstacles ?? [], size);
  const preferred = clamp(piece.left, area.left, area.right - size.width);
  /** The left edge nearest the piece's at which the bar is clear of every control, at `top`. */
  const clearAt = (top: number): number | null => {
    const candidates = [preferred];
    for (const box of keepOff) {
      candidates.push(box.left - size.width / 2, box.right - size.width / 2);
    }
    let best: number | null = null;
    for (const left of candidates) {
      if (left < area.left || left > area.right - size.width) continue;
      if (blocked({ x: left + size.width / 2, y: top + size.height / 2 }, keepOff)) continue;
      if (best === null || Math.abs(left - preferred) < Math.abs(best - preferred)) best = left;
    }
    return best;
  };

  const below = low + GAP_PX;
  const above = high - GAP_PX - size.height;
  const under: PlacedSelectionBar | null = (() => {
    if (below + size.height > area.bottom) return null;
    const left = clearAt(below);
    return left === null ? null : { at: { x: left, y: below }, side: 'below' };
  })();
  const over: PlacedSelectionBar | null = (() => {
    if (above < area.top) return null;
    const left = clearAt(above);
    return left === null ? null : { at: { x: left, y: above }, side: 'above' };
  })();

  // Beside, level with the piece's top, past its chips: only to keep off
  // another piece, so a lone piece keeps its bar where the maker reads it.
  const top = clamp(piece.top, area.top, area.bottom - size.height);
  const beside = (left: number, side: 'right' | 'left'): PlacedSelectionBar | null =>
    left < area.left ||
    left + size.width > area.right ||
    top < area.top ||
    blocked({ x: left + size.width / 2, y: top + size.height / 2 }, keepOff)
      ? null
      : { at: { x: left, y: top }, side };
  const right = beside(Math.max(piece.right, ...taken.map((box) => box.right)) + GAP_PX, 'right');
  const leftSide = beside(
    Math.min(piece.left, ...taken.map((box) => box.left)) - GAP_PX - size.width,
    'left',
  );

  // A piece the selection lies on — a pocket on its outer — is under every
  // side alike, so it decides nothing.
  const others = (input.others ?? []).map(onScreen).filter((box) => !overlaps(box, piece));
  const clearOfOthers = (placed: PlacedSelectionBar | null): boolean => {
    if (placed === null) return false;
    const bar: CssBox = {
      left: placed.at.x,
      top: placed.at.y,
      right: placed.at.x + size.width,
      bottom: placed.at.y + size.height,
    };
    return !others.some((box) => overlaps(bar, box));
  };
  if (others.length === 0) return under ?? over;
  return [under, over, right, leftSide].find(clearOfOthers) ?? under ?? over;
}

/** Whether two boxes share any area; touching edges do not. */
function overlaps(a: CssBox, b: CssBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
