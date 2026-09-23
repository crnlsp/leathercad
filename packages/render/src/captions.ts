import { EPS_LENGTH, approxEq, formatMm, parseNumber, type Mm } from '@leathercad/core';
import type { Part, ResolvedPart } from '@leathercad/domain';

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
 * The iron on the pattern: `88 holes · 3.85 mm · KS Blade`, the line a maker
 * writes on a pattern card under the piece's name (UI Foundations §13, F.7).
 *
 * The pitch is the **nominal** one, the iron's, not the spacing achieved
 * (docs/glossary.md). Sets made with one iron are added up; each iron is said
 * once. Only what is drawn counts: a hidden or failed set has no holes on the
 * canvas to count. Null when the part has no stitching to describe.
 */
export function describeStitching(part: ResolvedPart): string | null {
  const irons = new Map<string, { count: number; pitchMm: Mm; name: string | null }>();

  for (const entry of part.features) {
    if (!entry.ok || !entry.feature.visible || entry.holes === undefined) continue;
    const { source } = entry.feature;
    if (source.kind !== 'derived' || source.op.type !== 'stitch-holes') continue;

    const { pitchMm, ironLabel } = source.op;
    const name = ironName(ironLabel, pitchMm);
    const key = `${String(pitchMm)}\u0000${name ?? ''}`;
    const iron = irons.get(key) ?? { count: 0, pitchMm, name };
    irons.set(key, { ...iron, count: iron.count + entry.holes.count });
  }

  if (irons.size === 0) return null;
  return [...irons.values()]
    .map(({ count, pitchMm, name }) =>
      [`${String(count)} ${count === 1 ? 'hole' : 'holes'}`, formatMm(pitchMm), name]
        .filter((word) => word !== null)
        .join(' · '),
    )
    .join(', ');
}

/**
 * An iron's label without the pitch the caption already says: the preset
 * `KS Blade 3.85 mm` reads `KS Blade`. A label naming a different number keeps
 * it, since then the number is part of the name.
 */
function ironName(label: string | undefined, pitchMm: Mm): string | null {
  const trimmed = label?.trim() ?? '';
  if (trimmed === '') return null;
  const trailing = /^(.*?)\s*(\d+(?:[.,]\d+)?)\s*mm$/i.exec(trimmed);
  if (trailing !== null && approxEq(parseNumber(trailing[2]!), pitchMm, EPS_LENGTH)) {
    const rest = trailing[1]!.trim();
    return rest === '' ? null : rest;
  }
  return trimmed;
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

/**
 * The iron line under the name: quieter, by size alone (F.7). The space
 * between it and the name above.
 */
export const STITCHING_CAPTION_SIZE_MM: Mm = 2.2;
export const CAPTION_LINE_GAP_MM: Mm = 1;
