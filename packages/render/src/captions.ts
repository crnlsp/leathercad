import type { Mm } from '@leathercad/core';
import type { Part } from '@leathercad/domain';

/**
 * What a part is called on screen and on paper.
 *
 * Presentation, deliberately not in the domain: a caption is a sentence for a
 * person, and the domain's job is to know that a part is cut twice, not to
 * decide how to say so. Screen and paper read this one function, so a printed
 * sheet and the canvas can never disagree about what a piece is called.
 */
export function describePart(part: Part): string {
  const name = part.name.trim() === '' ? 'Part' : part.name.trim();
  return part.quantity > 1 ? `${name} — cut ${part.quantity}` : name;
}

/**
 * How big a caption is, and how far above its piece it sits.
 *
 * Millimetres, because a caption is document text: it is the same size on
 * screen and on paper, and it grows as the user zooms in, like the drawing it
 * belongs to. Roughly the 8 pt the PDF writer used before typography arrived.
 */
export const CAPTION_SIZE_MM: Mm = 2.8;
export const CAPTION_GAP_MM: Mm = 1.5;
