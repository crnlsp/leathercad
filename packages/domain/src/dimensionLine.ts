import { EPS_LENGTH, approxGte, type Mm } from '@leathercad/core';
import { closed, line, open, type LineSegment, type Path, type Vec2 } from '@leathercad/geometry';

/**
 * How big a dimension line's marks are, in millimetres of the medium it is
 * drawn on: true millimetres on paper, a constant size on screen turned into
 * millimetres at the zoom (`packages/render/src/theme`).
 */
export interface DimensionLineSizes {
  /** From an arrowhead's tip to its base. */
  readonly arrowLengthMm: Mm;
  /** Across an arrowhead's base. */
  readonly arrowWidthMm: Mm;
  /**
   * The room the number takes along the line: its own width and the clearance
   * either side. The line breaks for it, or it goes outside when it does not
   * fit.
   */
  readonly gapMm: Mm;
}

/** A dimension line as drafting draws it: stroked pieces, and filled arrowheads. */
export interface DraftedDimensionLine {
  /** The line, broken where the number sits — two pieces, or one when the number is wider. */
  readonly lines: readonly Path[];
  /** One closed triangle at each end, the tip first: on `from`, then on `to`. */
  readonly arrowheads: readonly Path[];
  /**
   * Where the number's centre goes: the middle of the line when the number
   * and its clearance fit between the ends, and otherwise on the line carried
   * on past the arrowhead at `to`, clear of it by the clearance.
   */
  readonly number: Vec2;
}

/**
 * A dimension line with **arrowheads, and the number breaking it** (4.10b) —
 * UI Foundations' identity item 9, on the board and on paper alike.
 *
 * Laid out as a drawing office does, from the number's real width and the
 * arrowheads' real length in the medium, never a fixed threshold:
 *
 * - room for the number and both arrowheads: the arrowheads inside, pointing
 *   out to the ends, and the line broken about its middle for the number;
 * - room for the number alone: the arrowheads outside, pointing in, and the
 *   number still breaking the line in the middle;
 * - no room for the number: the arrowheads outside, the line whole, and the
 *   number past the arrowhead at `to`, so it never sits over the line it
 *   measures.
 *
 * A line of no length has no direction to point an arrowhead, so it draws
 * nothing: the extension lines still say where it is.
 *
 * @throws RangeError for an arrowhead with no length or width, a negative gap,
 * or a size that is not finite.
 */
export function draftDimensionLine(
  dimension: LineSegment,
  sizes: DimensionLineSizes,
): DraftedDimensionLine {
  const { arrowLengthMm: length, arrowWidthMm: width, gapMm: gap } = sizes;
  if (!(Number.isFinite(length) && length > 0)) {
    throw new RangeError(`arrowhead length must be positive and finite, got ${String(length)}`);
  }
  if (!(Number.isFinite(width) && width > 0)) {
    throw new RangeError(`arrowhead width must be positive and finite, got ${String(width)}`);
  }
  if (!(Number.isFinite(gap) && gap >= 0)) {
    throw new RangeError(`dimension gap must be finite and not negative, got ${String(gap)}`);
  }

  const { a: from, b: to } = dimension;
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span <= EPS_LENGTH) return { lines: [], arrowheads: [], number: from };

  const u = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
  const at = (s: Mm): Vec2 => ({ x: from.x + u.x * s, y: from.y + u.y * s });

  const numberFits = approxGte(span, gap, EPS_LENGTH);
  // Inside, each tip points out to its end; outside, in to it.
  const inside = approxGte(span, 2 * length + gap, EPS_LENGTH);
  const towardsTo = inside ? 1 : -1;
  const arrowheads = [
    arrowhead(from, { x: -u.x * towardsTo, y: -u.y * towardsTo }, length, width),
    arrowhead(to, { x: u.x * towardsTo, y: u.y * towardsTo }, length, width),
  ];

  // From each arrowhead's base when it is inside — the head is drawn there
  // already — or from the end itself, to the break.
  const start = inside ? length : 0;
  const end = span - start;
  // A number exactly as wide as the line leaves pieces of no length, which
  // the filter drops, so the comparison needs no tolerance.
  const pieces: [Mm, Mm][] = numberFits
    ? [
        [start, (span - gap) / 2],
        [(span + gap) / 2, end],
      ]
    : [[0, span]];
  const lines = pieces
    .filter(([s0, s1]) => s1 - s0 > EPS_LENGTH)
    .map(([s0, s1]) => open([line(at(s0), at(s1))]));

  // Outside, the arrowhead at `to` reaches `length` past it, and the number's
  // room starts there: its clearance is the gap between them.
  const number = at(numberFits ? span / 2 : span + length + gap / 2);

  return { lines, arrowheads, number };
}

/** A filled drafting arrowhead: its tip, then the two corners of its base. */
function arrowhead(tip: Vec2, pointing: Vec2, length: Mm, width: Mm): Path {
  const base = { x: tip.x - pointing.x * length, y: tip.y - pointing.y * length };
  const side = { x: -pointing.y * (width / 2), y: pointing.x * (width / 2) };
  const left = { x: base.x + side.x, y: base.y + side.y };
  const right = { x: base.x - side.x, y: base.y - side.y };
  return closed([line(tip, left), line(left, right), line(right, tip)]);
}
