import { approxZero, formatMm } from '@leathercad/core';
import type { Clearance, MoveReadout } from '@leathercad/editor';

import type { I18n, Translate } from '../../shared/i18n.js';

/**
 * A move's readout in the interface's words (3.17, smart-guides spec §7, §11):
 * how far it went, to the tenth the chips show, and a hole's clearance from
 * the edge, as Problems words a clearance — and, where the clearance is what
 * the rule warns of, the rule's own name, so the warning is never colour alone.
 */

/** "Δx 12.0 mm · Δy −3.0 mm", beside the pointer and in the status bar. */
export function deltaWords(readout: MoveReadout, t: Translate): string {
  return t('move.delta', { x: formatMm(readout.deltaMm.x, 1), y: formatMm(readout.deltaMm.y, 1) });
}

/** "1.40 mm from the edge · Too near the edge", or the rule's name alone off the leather. */
export function clearanceWords(clearance: Clearance, t: Translate): string {
  if (clearance.verdict === 'off') return t('problems.OUTSIDE_PART.title');
  const at = formatMm(clearance.clearanceMm);
  return clearance.verdict === 'too-close'
    ? t('move.tooNear', { clearance: at, rule: t('problems.HOLE_TOO_CLOSE_TO_EDGE.title') })
    : t('move.fromEdge', { clearance: at });
}

/** A gap drawn on the board, to the tenth. */
export const gapWords = (mm: number): string => formatMm(mm, 1);

/** What the live region says when a move is kept: "Moved 12.0 mm right and 3.0 mm down; …". */
export function announceMove(readout: MoveReadout, { t, list }: I18n): string {
  const { x, y } = readout.deltaMm;
  const directions = [
    ...(approxZero(x)
      ? []
      : [t(x > 0 ? 'move.right' : 'move.left', { distance: formatMm(Math.abs(x), 1) })]),
    ...(approxZero(y)
      ? []
      : [t(y > 0 ? 'move.up' : 'move.down', { distance: formatMm(Math.abs(y), 1) })]),
  ];
  if (directions.length === 0) return t('move.notMoved');
  return readout.clearance === null
    ? t('move.moved', { directions: list(directions) })
    : t('move.movedNear', {
        directions: list(directions),
        clearance: clearanceWords(readout.clearance, t),
      });
}
