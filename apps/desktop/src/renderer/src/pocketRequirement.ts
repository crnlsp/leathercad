import { EPS_LENGTH, type Mm } from '@leathercad/core';
import {
  ID1_CARD,
  contentSize,
  fitsAcross,
  type PocketRequirement,
  type ResolvedPart,
} from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';

import type { I18n } from '../../shared/i18n.js';

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

/**
 * *Holds*' verdict across the pocket (U7): fits or too narrow, by the judgement
 * `POCKET_TOO_NARROW` makes, with the width and what it was measured for.
 */
export function acrossVerdict(widthMm: Mm, holds: PocketRequirement, i18n: I18n): string {
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const verdict = fitsAcross(widthMm, holds) ? 'fits' : 'tooNarrow';
  const ease = holds.easeMm > EPS_LENGTH ? 'Ease' : '';
  return i18n.t(`pocket.holds.${verdict}${ease}`, {
    width: number.format(widthMm),
    content: number.format(contentSize(holds.content).widthMm),
    ease: number.format(holds.easeMm),
  });
}

/** The part's outline as evaluated, if it resolved: where a pocket's opening is read from. */
export function outlineOf(part: ResolvedPart | undefined): Path | null {
  const entry = part?.features.find(
    (f) => f.feature.kind === 'cut-contour' && f.feature.role === 'outer',
  );
  return entry?.ok === true ? entry.path : null;
}
