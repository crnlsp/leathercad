import { EPS_LENGTH, approxEq, type Mm } from '@leathercad/core';
import { turnedOver, type Part, type ResolvedPart } from '@leathercad/domain';
import { RectOps, type Rect } from '@leathercad/geometry';

/**
 * What a part is called **on paper**: "Card pocket — cut 2".
 *
 * Presentation, deliberately not in the domain: a caption is a sentence for a
 * person, and the domain's job is to know that a part is cut twice, not to
 * decide how to say so. Paper keeps its own language, English, while the
 * vendored glyphs are Latin (ADR 0018). The board's caption is the
 * interface's, worded by the app from `stitchingOf` and the part (R-01).
 */
export function describePart(part: Part): string {
  const name = part.name.trim() === '' ? 'Part' : part.name.trim();
  if (part.quantity <= 1) return name;
  // A mirrored pair (Q21): the sheet says which to turn over, so no maker cuts
  // two lefts.
  const turned = turnedOver(part);
  if (turned === 0) return `${name} — cut ${part.quantity}`;
  return turned === 1
    ? `${name} — cut 2, turn the template over for the second`
    : `${name} — cut ${part.quantity}, ${turned} with the template turned over`;
}

/** Holes at one pitch: a line of a piece's caption on the board. */
export interface Stitching {
  readonly holes: number;
  /** The iron's **nominal** pitch, not the spacing achieved (docs/glossary.md). */
  readonly pitchMm: Mm;
}

/**
 * A piece's stitching as its caption counts it (R-01): the holes, per pitch,
 * in the order the pitches are met. The facts only; the app says them — "52
 * holes · pitch 3.85 mm".
 *
 * Sets at one pitch are added up whatever iron made them: two irons of a pitch
 * punch the same holes. Only what is drawn counts: a hidden or failed set has
 * no holes on the canvas to count.
 */
export function stitchingOf(part: ResolvedPart): readonly Stitching[] {
  const pitches: Stitching[] = [];

  for (const entry of part.features) {
    if (!entry.ok || !entry.feature.visible || entry.holes === undefined) continue;
    const { source } = entry.feature;
    if (source.kind !== 'derived' || source.op.type !== 'stitch-holes') continue;

    const { pitchMm } = source.op;
    const at = pitches.findIndex((known) => approxEq(known.pitchMm, pitchMm, EPS_LENGTH));
    if (at === -1) pitches.push({ holes: entry.holes.count, pitchMm });
    else pitches[at] = { pitchMm, holes: pitches[at]!.holes + entry.holes.count };
  }

  return pitches;
}

/**
 * How big a caption is printed, and how far above its piece it sits.
 *
 * Millimetres, because the printed caption is document text: roughly the 8 pt
 * the PDF writer used before typography arrived. The board's caption is screen
 * text instead, the same size at every zoom (`CANVAS.text`, R-01).
 */
export const CAPTION_SIZE_MM: Mm = 2.8;
export const CAPTION_GAP_MM: Mm = 1.5;

/** Pieces whose captions are stacked together, and the top they stack above. */
export interface CaptionStack {
  /** Indices into the boxes given, in the order given: the first is captioned nearest. */
  readonly members: readonly number[];
  /** The highest top among them, which every caption in the stack clears. */
  readonly topMm: Mm;
}

/**
 * The board's captions, grouped so none is written over another or over a
 * piece's holes (U17): pieces whose boxes overlap — a pocket laid on its back
 * panel, the usual check of a card holder — share one stack above the highest
 * of them, overlapping counted through any chain of pieces. A piece clear of
 * the rest is a stack of its own above its own top, as before. Where the words
 * sit only: no piece moves, and paper, which lays pieces apart, is untouched.
 *
 * In the order of each stack's first piece, so the board is drawn the same way
 * every time.
 */
export function captionStacks(boxes: readonly Rect[]): readonly CaptionStack[] {
  // ponytail: O(n²) box checks, fine for the pieces of one project.
  let groups: (readonly number[])[] = [];
  boxes.forEach((box, index) => {
    const touching = groups.filter((group) =>
      group.some((other) => RectOps.intersects(boxes[other]!, box)),
    );
    groups = [...groups.filter((group) => !touching.includes(group)), [...touching.flat(), index]];
  });
  return groups
    .map((group) => [...group].sort((a, b) => a - b))
    .sort((a, b) => a[0]! - b[0]!)
    .map((members) => ({
      members,
      topMm: Math.max(...members.map((member) => boxes[member]!.maxY)),
    }));
}
