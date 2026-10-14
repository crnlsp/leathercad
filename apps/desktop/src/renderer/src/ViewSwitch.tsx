import type { Project } from '@leathercad/domain';
import { Files, PenTool, type LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

import type { CanvasView } from './CanvasHost.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { pressOf } from './PanelFold.js';
import { describeSheets, describeTapedAcross } from './sheetWords.js';
import { printStatusFor, sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

const VIEWS: readonly CanvasView[] = ['design', 'sheets'];

/**
 * Design or Sheets (7.4c, R-06): the two views of one pattern, a pill switch
 * in the middle of the top bar — between the project and its output, since
 * the Sheets view is where the project meets the paper. A tab list: the arrow
 * keys, Home and End move between the two and switch as they go, and `Ctrl+1`
 * / `Ctrl+2` switch from anywhere. Light and reversible — each view keeps its
 * camera, the selection is shared, and nothing about the document changes by
 * switching.
 *
 * The Sheets tab carries the sheet count, read from `sheetPlanFor` as the
 * paper button and Properties' totals are, so the three cannot disagree. In a
 * cramped window the words go and the icons and the count stay.
 */
export function ViewSwitch({
  view,
  onView,
  sheets,
  compact,
}: {
  view: CanvasView;
  onView: (next: CanvasView) => void;
  /** How many sheets the pattern prints on. */
  sheets: number;
  /** Icons and the count only (R-06, 860 px). */
  compact: boolean;
}) {
  const { t } = useI18n();
  const tabs = useRef<Partial<Record<CanvasView, HTMLButtonElement | null>>>({});
  const choices: readonly {
    id: CanvasView;
    label: string;
    name?: string;
    tip: string;
    icon: LucideIcon;
  }[] = [
    { id: 'design', label: t('view.design'), tip: t('view.designTooltip'), icon: PenTool },
    {
      id: 'sheets',
      label: t('view.sheets'),
      name: t('view.sheetsNamed', { count: sheets }),
      tip: t('view.sheetsTooltip'),
      icon: Files,
    },
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = VIEWS.indexOf(view);
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? VIEWS[(at + 1) % VIEWS.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? VIEWS[(at + VIEWS.length - 1) % VIEWS.length]
          : event.key === 'Home'
            ? VIEWS[0]
            : event.key === 'End'
              ? VIEWS[VIEWS.length - 1]
              : undefined;
    if (next === undefined) return;
    // The tab list's keys, not the board's.
    event.preventDefault();
    event.stopPropagation();
    onView(next);
    tabs.current[next]?.focus();
  };

  return (
    <div
      className={compact ? 'view-switch compact' : 'view-switch'}
      role="tablist"
      aria-label={t('view.label')}
      onKeyDown={onKeyDown}
    >
      {choices.map((choice) => {
        const selected = view === choice.id;
        return (
          <Tooltip key={choice.id} text={choice.tip} keys={choice.id}>
            <button
              ref={(node) => {
                tabs.current[choice.id] = node;
              }}
              type="button"
              role="tab"
              className={selected ? 'view-tab active' : 'view-tab'}
              data-testid={`view-${choice.id}`}
              aria-selected={selected}
              aria-label={choice.name}
              // One stop on Tab for the whole list; the arrows move inside it.
              tabIndex={selected ? 0 : -1}
              onClick={(event) => {
                // A press with the mouse leaves the keys to the board (U.4):
                // a tab left focused would take its arrow keys.
                pressOf(event);
                onView(choice.id);
              }}
            >
              <Icon of={choice.icon} />
              <span className={compact ? 'visually-hidden' : 'view-label'}>{choice.label}</span>
              {choice.id === 'sheets' && (
                <span className="view-count" aria-hidden="true">
                  {sheets}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
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
