import { formatMm } from '@leathercad/core';
import type { ResolvedPart } from '@leathercad/domain';
import { stitchingOf, type Caption } from '@leathercad/render';

import type { I18n } from '../../shared/i18n.js';

/**
 * What a piece is called on the board (R-01): "Card pocket ×2" over "52 holes
 * · 3.85 mm" — no ×1 for a piece cut once, and every pitch it is stitched at.
 *
 * The interface's words, so the app's (ADR 0018); `render` counts the holes
 * and places the lines. Paper keeps its own caption, "Card pocket — cut 2".
 */
export function captionOf({ t, list }: I18n, part: ResolvedPart): Caption {
  const named = part.part.name.trim();
  const name = named === '' ? t('caption.unnamed') : named;
  const { quantity } = part.part;
  const stitching = stitchingOf(part).map(({ holes, pitchMm }) =>
    t('caption.holes', { count: holes, pitch: formatMm(pitchMm) }),
  );
  return {
    name: quantity > 1 ? t('caption.cut', { name, quantity }) : name,
    detail: stitching.length === 0 ? null : list(stitching, 'unit'),
  };
}
