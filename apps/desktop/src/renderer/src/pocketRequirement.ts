import type { Mm } from '@leathercad/core';
import {
  ID1_CARD,
  contentSize,
  depthBelowOpening,
  type PocketRequirement,
  type ResolvedPart,
} from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';

/** What Properties' *Holds* menu offers (9.14b). */
export type HoldsChoice = 'none' | PocketRequirement['content']['kind'];

export function choiceOf(holds: PocketRequirement | undefined): HoldsChoice {
  return holds?.content.kind ?? 'none';
}

/**
 * The requirement a choice in the *Holds* menu makes, keeping what the maker
 * already said: their ease and whether it goes in fully. A first requirement
 * takes the ease from My tools, or none — never one invented here. A typed
 * size starts from what the pocket held, a card until the maker types theirs.
 */
export function withChoice(
  choice: HoldsChoice,
  current: PocketRequirement | undefined,
  makerEaseMm: Mm | null,
): PocketRequirement | undefined {
  if (choice === 'none') return undefined;
  const easeMm = current?.easeMm ?? makerEaseMm ?? 0;
  const fully = current?.fully ?? false;
  if (choice === 'id-1') return { content: { kind: 'id-1' }, easeMm, fully };
  const from = current === undefined ? ID1_CARD : contentSize(current.content);
  return {
    content: { kind: 'size', widthMm: from.widthMm, heightMm: from.heightMm },
    easeMm,
    fully,
  };
}

/** The part's outline as evaluated, if it resolved: where a pocket's opening is read from. */
export function outlineOf(part: ResolvedPart | undefined): Path | null {
  const entry = part?.features.find(
    (f) => f.feature.kind === 'cut-contour' && f.feature.role === 'outer',
  );
  return entry?.ok === true ? entry.path : null;
}

/**
 * How far the content stands above the pocket's opening — negative when it
 * goes in below it — or null when no opening is found. Geometric, as the
 * template audit gives it: the card holder's 53.98 mm card shows 9.6313 mm.
 * Ease is not subtracted; it is room around the content, not part of it.
 */
export function standsProud(
  stitch: Path,
  outline: Path | null,
  holds: PocketRequirement,
): Mm | null {
  if (outline === null) return null;
  const depthMm = depthBelowOpening(stitch, outline);
  return depthMm === null ? null : contentSize(holds.content).heightMm - depthMm;
}
