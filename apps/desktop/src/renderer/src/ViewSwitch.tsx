import type { Project } from '@leathercad/domain';

import type { CanvasView } from './CanvasHost.js';
import { useI18n } from './i18n.js';
import { describeSheets, describeTapedAcross } from './sheetWords.js';
import { printStatusFor, sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

/**
 * Design or Sheets (7.4c): the two views of one pattern, at the right end of
 * the work bar because it changes the board. Light and reversible — each view
 * keeps its camera, the selection is shared, and nothing about the document
 * changes by switching.
 */
export function ViewSwitch({
  view,
  onView,
}: {
  view: CanvasView;
  onView: (next: CanvasView) => void;
}) {
  const { t } = useI18n();
  const choices: readonly { id: CanvasView; label: string; tip: string }[] = [
    { id: 'design', label: t('view.design'), tip: t('view.designTooltip') },
    { id: 'sheets', label: t('view.sheets'), tip: t('view.sheetsTooltip') },
  ];
  return (
    <div className="view-switch" role="group" aria-label={t('view.label')}>
      {choices.map((choice) => (
        <Tooltip key={choice.id} text={choice.tip} keys={choice.id}>
          <button
            type="button"
            className={view === choice.id ? 'chip active' : 'chip'}
            data-testid={`view-${choice.id}`}
            aria-pressed={view === choice.id}
            onClick={() => onView(choice.id)}
          >
            {choice.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * The sheet plan in words, in the work bar while the Sheets view shows (7.4c):
 * how many sheets, what is taped across which, and what the board shows that
 * the paper will not. Also the Sheets view's text alternative.
 */
export function SheetsSummary({ project }: { project: Project }) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = sheetPlanFor(project);
  const statuses = printStatusFor(project);
  const sentences = [t('sheets.summary', { sheets: describeSheets(plan, t) })];

  for (const entry of plan.pagination.tiled) {
    const sheets = plan.parts.get(entry.part.id)?.sheets ?? [];
    sentences.push(describeTapedAcross(entry.part.name, sheets, i18n));
  }

  const notPrinted = project.parts.filter((part) => statuses.get(part.id)?.sheets === null);
  if (notPrinted.length === 1) {
    sentences.push(t('sheets.partNotPrinted', { name: notPrinted[0]!.name }));
  } else if (notPrinted.length > 1) {
    sentences.push(t('sheets.partsNotPrinted', { count: notPrinted.length }));
  }
  const failed = [...statuses.values()]
    .filter((status) => status.sheets !== null)
    .reduce((sum, status) => sum + status.failedFeatures, 0);
  if (failed > 0) sentences.push(t('sheets.failedNotPrinted', { count: failed }));

  return (
    <p className="sheets-summary" data-testid="sheets-summary" aria-live="polite">
      {sentences.join(' ')}
    </p>
  );
}
