import type { Project } from '@leathercad/domain';
import { describeSheetNumbers, describeSheets } from '@leathercad/export';

import type { CanvasView } from './CanvasHost.js';
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
  const choices: readonly { id: CanvasView; label: string; tip: string }[] = [
    { id: 'design', label: 'Design', tip: 'Design the pieces (Ctrl+1)' },
    {
      id: 'sheets',
      label: 'Sheets',
      tip: 'See the pieces on the sheets they will print on (Ctrl+2)',
    },
  ];
  return (
    <div className="view-switch" role="group" aria-label="View">
      {choices.map((choice) => (
        <Tooltip key={choice.id} text={choice.tip}>
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
  const plan = sheetPlanFor(project);
  const statuses = printStatusFor(project);
  const sentences = [`${describeSheets(plan)}.`];

  for (const entry of plan.pagination.tiled) {
    const sheets = plan.parts.get(entry.part.id)?.sheets ?? [];
    sentences.push(
      `${entry.part.name} is taped across ${describeSheetNumbers(sheets).toLowerCase()}.`,
    );
  }

  const notPrinted = project.parts.filter((part) => statuses.get(part.id)?.sheets === null);
  if (notPrinted.length === 1) {
    sentences.push(`${notPrinted[0]!.name} isn't printed.`);
  } else if (notPrinted.length > 1) {
    sentences.push(`${String(notPrinted.length)} parts aren't printed.`);
  }
  const failed = [...statuses.values()]
    .filter((status) => status.sheets !== null)
    .reduce((sum, status) => sum + status.failedFeatures, 0);
  if (failed > 0) {
    sentences.push(
      `${String(failed)} ${failed === 1 ? "feature with a problem isn't" : "features with problems aren't"} printed.`,
    );
  }

  return (
    <p className="sheets-summary" data-testid="sheets-summary" aria-live="polite">
      {sentences.join(' ')}
    </p>
  );
}
