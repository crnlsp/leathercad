import { EPS_LENGTH, approxEq, type Mm } from '@leathercad/core';
import type { Part, ResolvedPart } from '@leathercad/domain';

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
  return part.quantity > 1 ? `${name} — cut ${part.quantity}` : name;
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
 * holes · 3.85 mm".
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
