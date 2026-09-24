import type { ResolvedProject } from '@leathercad/domain';

import { describeSheetNumbers, type PartSheets, type SheetPlan } from './sheetPlan.js';

/** Why a part puts nothing on paper. */
export type NotPrintedReason =
  /** The part has no features at all. */
  | 'nothing-drawn'
  /** Every feature is hidden: hidden features do not print. */
  | 'hidden'
  /** What is shown failed to build, and the export drops a failed feature. */
  | 'problems'
  /** Only words are shown: a template with no line on it is not a template. */
  | 'nothing-to-cut';

/**
 * What of one part reaches paper (7.4b), read from the sheet plan the PDF
 * writes — so Parts cannot say a part prints when the file leaves it out, or
 * the other way round.
 */
export interface PartPrintStatus {
  readonly partId: string;
  /** Where it prints, from the plan. Null when it does not print. */
  readonly sheets: PartSheets | null;
  /** Why it does not print; null when it does. */
  readonly notPrinted: NotPrintedReason | null;
  /** Features left off the paper because they are hidden. */
  readonly hiddenFeatures: number;
  /** Features left off the paper because they failed to build. */
  readonly failedFeatures: number;
}

/**
 * Every part's print status, in document order.
 *
 * Whether a part prints is the plan's to say — it is in the plan or it is not.
 * The reason and the omitted counts follow the export scene's own rule
 * (`buildExportScene`): a hidden feature is dropped, then a failed one. A
 * feature both hidden and failed counts as hidden: showing it would not make
 * it print, and fixing it would not either.
 */
export function printStatusOf(
  resolved: ResolvedProject,
  plan: SheetPlan,
): ReadonlyMap<string, PartPrintStatus> {
  const statuses = new Map<string, PartPrintStatus>();
  for (const { part, features } of resolved.parts) {
    const hidden = features.filter((entry) => !entry.feature.visible).length;
    const failed = features.filter((entry) => entry.feature.visible && !entry.ok).length;
    const sheets = plan.parts.get(part.id) ?? null;

    let notPrinted: NotPrintedReason | null = null;
    if (sheets === null) {
      if (features.length === 0) notPrinted = 'nothing-drawn';
      else if (hidden === features.length) notPrinted = 'hidden';
      else if (failed > 0) notPrinted = 'problems';
      else notPrinted = 'nothing-to-cut';
    }

    statuses.set(part.id, {
      partId: part.id,
      sheets,
      notPrinted,
      hiddenFeatures: hidden,
      failedFeatures: failed,
    });
  }
  return statuses;
}

const REASONS: Readonly<Record<NotPrintedReason, string>> = {
  'nothing-drawn': 'Nothing is drawn in it.',
  hidden: 'It is hidden.',
  problems: 'What is shown has problems.',
  'nothing-to-cut': 'It has only words, no lines to cut.',
};

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/**
 * The part's status in words, as Parts shows it: a short `label` —
 * `Sheet 1`, `Sheets 2–3, taped`, `Not printed` — and a `note` when something
 * the maker can see on the board will not be on the paper.
 */
export function describePrintStatus(status: PartPrintStatus): {
  label: string;
  note: string | null;
} {
  if (status.sheets === null) {
    return { label: 'Not printed', note: REASONS[status.notPrinted!] };
  }

  const label = status.sheets.taped
    ? `${describeSheetNumbers(status.sheets.sheets)}, taped`
    : describeSheetNumbers(status.sheets.sheets);

  const left: string[] = [];
  if (status.hiddenFeatures > 0) {
    left.push(`${plural(status.hiddenFeatures, 'hidden feature', 'hidden features')}`);
  }
  if (status.failedFeatures > 0) {
    left.push(
      `${plural(status.failedFeatures, 'feature with a problem', 'features with problems')}`,
    );
  }
  const total = status.hiddenFeatures + status.failedFeatures;
  return {
    label,
    note:
      left.length === 0
        ? null
        : `${left.join(' and ')} ${total === 1 ? "isn't" : "aren't"} printed.`,
  };
}
