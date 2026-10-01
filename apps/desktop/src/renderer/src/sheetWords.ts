import { formatMm, formatNumber } from '@leathercad/core';
import {
  isContiguous,
  isScaleCheckOnly,
  type PartPrintStatus,
  type SheetPlan,
  type TiledPart,
} from '@leathercad/export';

import type { I18n, Translate } from '../../shared/i18n.js';

/**
 * The sheet plan in the interface's words (7.4a–7.4d, ADR 0018): what the
 * paper list, Parts, the Sheets view's summary and the export notice say about
 * paper. The export decides what prints; this only says it.
 *
 * What is printed *on* the paper — a sheet's footer, a part's caption — is the
 * export's own, and stays in the paper's language.
 */

/** `3 sheets of A4, portrait`, and `, scale check only` when no part prints. */
export function describeSheets(plan: SheetPlan, t: Translate): string {
  const sheets = t('sheets.count', {
    count: plan.sheets.length,
    paper: plan.setup.paper.name,
    orientation: t(`sheets.orientation.${plan.setup.orientation}`),
  });
  return isScaleCheckOnly(plan) ? t('sheets.scaleCheckOnly', { sheets }) : sheets;
}

/** Which pieces are taped across sheets: `Strap taped`, `3 pieces taped`. Null when none is. */
export function describeTaped(plan: SheetPlan, i18n: I18n): string | null {
  const names = plan.pagination.tiled.map((entry) => entry.part.name);
  if (names.length === 0) return null;
  return names.length <= 2
    ? i18n.t('sheets.taped', { names: i18n.list(names) })
    : i18n.t('sheets.tapedPieces', { count: names.length });
}

/** What one paper choice comes to: `3 sheets of A4, portrait (Strap taped)`. */
export function describeChoice(plan: SheetPlan, i18n: I18n): string {
  const sheets = describeSheets(plan, i18n.t);
  const taped = describeTaped(plan, i18n);
  return taped === null ? sheets : i18n.t('sheets.choiceTaped', { sheets, taped });
}

/** `Sheet 2`, `Sheets 2–3`, `Sheets 2, 4`: the sheets a part prints on. */
export function describeSheetNumbers(sheets: readonly number[], i18n: I18n): string {
  if (sheets.length === 1) return i18n.t('sheetNumbers.one', { number: sheets[0]! });
  return isContiguous(sheets)
    ? i18n.t('sheetNumbers.range', { first: sheets[0]!, last: sheets[sheets.length - 1]! })
    : i18n.t('sheetNumbers.list', { numbers: i18n.list(sheets.map(String), 'unit') });
}

/** The same, inside a sentence: `Strap is taped across sheets 2–3.` */
export function describeTapedAcross(name: string, sheets: readonly number[], i18n: I18n): string {
  if (sheets.length === 1) return i18n.t('tapedAcross.one', { name, number: sheets[0]! });
  return isContiguous(sheets)
    ? i18n.t('tapedAcross.range', { name, first: sheets[0]!, last: sheets[sheets.length - 1]! })
    : i18n.t('tapedAcross.list', { name, numbers: i18n.list(sheets.map(String), 'unit') });
}

/**
 * A part's print status as Parts shows it: a short `label` — `Sheet 1`,
 * `Sheets 2–3, taped`, `Sheet 1, turned`, `Not printed` — and a `note` when something the maker
 * can see on the board will not be on the paper.
 */
export function describePrintStatus(
  status: PartPrintStatus,
  i18n: I18n,
): { label: string; note: string | null } {
  const { t } = i18n;
  if (status.sheets === null) {
    return { label: t('print.notPrinted'), note: t(`print.reason.${status.notPrinted!}`) };
  }

  const sheets = describeSheetNumbers(status.sheets.sheets, i18n);
  const left = [
    ...(status.hiddenFeatures > 0 ? [t('print.hidden', { count: status.hiddenFeatures })] : []),
    ...(status.failedFeatures > 0 ? [t('print.failed', { count: status.failedFeatures })] : []),
  ];
  return {
    label: status.sheets.taped
      ? t('print.taped', { sheets })
      : status.sheets.turned
        ? t('print.turned', { sheets })
        : sheets,
    note:
      left.length === 0
        ? null
        : t('print.leftOff', {
            count: status.hiddenFeatures + status.failedFeatures,
            features: i18n.list(left),
          }),
  };
}

/**
 * A part printed across sheets, for the export notice: its size, the paper it
 * outgrew, its grid, and the paper that would hold it whole.
 */
export function describeTiled(entry: TiledPart, t: Translate): string {
  const printed = t('exportNotice.tiled', {
    name: entry.part.name,
    size: `${formatNumber(entry.widthMm, 1)} × ${formatMm(entry.heightMm, 1)}`,
    paper: entry.on.paper.name,
    orientation: t(`sheets.orientation.${entry.on.orientation}`),
    count: entry.rows * entry.columns,
    rows: entry.rows,
    columns: entry.columns,
  });
  const best = entry.fitsOn[0];
  return best === undefined
    ? t('exportNotice.tiledNoPaper', { printed })
    : t('exportNotice.tiledFits', {
        printed,
        paper: best.paper.name,
        orientation: t(`sheets.orientation.${best.orientation}`),
      });
}
