import {
  COORDINATE_LIMIT_MM,
  approxEq,
  err,
  ok,
  parseLength,
  parseNumber,
  quantiseAtLeast,
  quantiseAtMost,
  type LengthError,
  type Result,
} from '@leathercad/core';

import type { Translate } from '../../shared/i18n.js';
import { chipNumber, type Refusal, type RefusalWords } from './outlineSizes.js';

/**
 * What a field's text comes to. A field in millimetres takes a size as a maker
 * types it — `95-2*3.5`, `3.75in`, `9,5 cm`, `1e3` (U.15) — so the same text
 * means the same thing in every one, up to what a project holds; any other
 * field (a count, an angle) a plain number.
 *
 * That other field is held to the same magnitude. No count or angle comes near
 * it, and past it what is stored stops being finite in the geometry: a turn of
 * 1e305° drew a NaN and blanked the window (QA F1).
 */
export function readField(text: string, inMm: boolean): Result<number, LengthError> {
  if (inMm) return parseLength(text);
  const value = parseNumber(text);
  if (!Number.isFinite(value)) return err({ kind: 'syntax' });
  return Math.abs(value) > COORDINATE_LIMIT_MM ? err({ kind: 'beyondLimit' }) : ok(value);
}

/** Why a field's text was not taken, in the interface's words (ADR 0018). */
export function fieldErrorText(error: LengthError, inMm: boolean, t: Translate): string {
  switch (error.kind) {
    case 'unit':
      return t('editor.lengthError.unit', { unit: error.unit });
    case 'beyondLimit':
      return t(inMm ? 'editor.lengthError.beyondLimit' : 'editor.numberError.beyondLimit', {
        limit: COORDINATE_LIMIT_MM,
      });
    default:
      return t(`editor.lengthError.${error.kind}`);
  }
}

/**
 * The farthest a box from `low` to `high` along one axis may move towards
 * `deltaMm` and stay within what a project holds, on the storage grid; `null`
 * when the whole move stays within it. A typed place or distance is within the
 * limit on its own, but a piece already 50 mm along and moved by 100 000 mm
 * would not be (QA F2).
 */
export function farthestMove(low: number, high: number, deltaMm: number): number | null {
  const fits = Math.min(COORDINATE_LIMIT_MM - high, Math.max(-COORDINATE_LIMIT_MM - low, deltaMm));
  if (approxEq(fits, deltaMm)) return null;
  return fits < deltaMm ? quantiseAtMost(fits) : quantiseAtLeast(fits);
}

/** A place or a move past the limit, offering what fits: "… Enter uses 99,900.0." */
export function beyondLimitRefusal(use: number, { t, enter }: RefusalWords): Refusal {
  return {
    reason: t('arrange.beyondLimit', { limit: COORDINATE_LIMIT_MM, size: chipNumber(use), enter }),
    use,
  };
}
