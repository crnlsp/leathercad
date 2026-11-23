import type { DocumentStore, Selection } from '@leathercad/document';
import type { Project, SeverityCounts } from '@leathercad/domain';
import { isScaleCheckOnly } from '@leathercad/export';
import { useState } from 'react';

import type { Translate } from '../../shared/i18n.js';
import type { CanvasView } from './CanvasHost.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { MenuButton } from './Menu.js';
import { exportMenu } from './menus.js';
import { pressOf, type Press } from './PanelFold.js';
import type { Room } from './panelLayout.js';
import { PaperButton } from './PaperButton.js';
import { describeCounts, indicatorOf } from './problemsIndicator.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import { selectionAnnouncement } from './selectionWords.js';
import { describeSheets } from './sheetWords.js';
import { sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';
import { ViewSwitch } from './ViewSwitch.js';

/**
 * The top bar (F.8, 8.7, R-06), in three zones that answer three questions at
 * a glance: **is my work saved, am I designing or checking the sheets, and is
 * the pattern ready to print.**
 *
 * Left, nothing: the project's name, menu, history and saved state are the tab
 * strip's above (8.12, MS.2); Ctrl+S saves. Centre,
 * Design | Sheets. Right, where the workflow ends: the paper, *Export PDF* with
 * the menu of its other formats as its second half, and *Print* — the one
 * primary action, in the paper's colour — whose second half is the problems
 * indicator, so what is wrong is on the button that would print it. Settings and Help are
 * not here: Settings is the Project menu's last item and Help the status
 * bar's corner (MS.3). Nothing here edits the pattern;
 * that is the work bar's.
 */
export function ProjectBar({
  project,
  selection,
  store,
  dirty,
  saved,
  room,
  view,
  onView,
  counts,
  settled,
  onShowProblems,
  onExport,
  onExportSvg,
  onExportDxf,
  onPrint,
}: {
  project: Project;
  /** The board's selection, said when it changes (X21). */
  selection: Selection;
  store: DocumentStore;
  dirty: boolean;
  /** The project has a file it was last saved to, or opened from. */
  saved: boolean;
  /** How much room the window has (U.5): the bar's words shorten with it. */
  room: Room;
  view: CanvasView;
  onView: (next: CanvasView) => void;
  /** The problems by severity: `countBySeverity` of the list the drawer shows. */
  counts: SeverityCounts;
  /** No gesture is under way: the announcements wait for one to end. */
  settled: boolean;
  /** Print's second half: open the Problems drawer. */
  onShowProblems: (press: Press) => void;
  onExport: () => void;
  /** *Export SVG…* and *Export DXF…* (6.2, 6.5), from the menu beside *Export PDF*. */
  onExportSvg: () => void;
  onExportDxf: () => void;
  onPrint: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = sheetPlanFor(project);

  const saveWords = dirty ? t('projectBar.unsaved') : saved ? t('projectBar.saved') : '';
  const problems = describeCounts(counts, i18n);
  const indicator = indicatorOf(counts);

  return (
    <>
      <header
        className={room === 'wide' ? 'project-bar' : `project-bar ${room}`}
        data-testid="project-bar"
      >
        {/* The product's name is the window title's and the icon's to carry;
          the document outline still starts with it. */}
        <h1 className="visually-hidden">LeatherCAD</h1>
        <ViewSwitch
          view={view}
          onView={onView}
          sheets={plan.sheets.length}
          compact={room === 'cramped'}
        />

        <div className="project-output" role="group" aria-label={t('projectBar.output')}>
          <PaperButton
            project={project}
            store={store}
            room={room}
            onSeeSheets={() => onView('sheets')}
          />
          <div className="split secondary">
            <Tooltip
              text={t('projectBar.exportTooltip', {
                sheets: describeSheets(plan, t),
              })}
              keys="exportPdf"
            >
              <button
                type="button"
                className="split-main"
                data-testid="export-pdf"
                onClick={onExport}
              >
                {t('projectBar.exportPdf')}
              </button>
            </Tooltip>
            {/* The other formats (6.2, 6.5), joined to *Export PDF*: files for a
              cutter or a vector editor, not paper. */}
            <MenuButton
              label={t('projectBar.exportMore')}
              tooltip={t('projectBar.exportMoreTooltip')}
              testId="export-more"
              className="split-side"
              align="end"
              entries={exportMenu(
                { svg: onExportSvg, dxf: onExportDxf },
                !isScaleCheckOnly(plan),
                t,
              )}
            >
              <Icon of="chevron-down" size={12} />
            </MenuButton>
          </div>
          <div className="split primary" data-state={indicator.state}>
            <Tooltip
              text={t('projectBar.printTooltip', {
                sheets: describeSheets(plan, t),
              })}
              keys="print"
            >
              <button type="button" className="split-main" data-testid="print" onClick={onPrint}>
                {t('projectBar.print')}
              </button>
            </Tooltip>
            {/* The problems, on the button that would print them (R-06). Print
              stays enabled: a warning is the maker's to weigh. */}
            <Tooltip
              text={
                problems === null
                  ? t('projectBar.problemsNoneTooltip')
                  : t('projectBar.problemsTooltip', { counts: problems })
              }
            >
              <button
                type="button"
                className={`split-side problems-indicator ${indicator.state}`}
                data-testid="print-problems"
                data-state={indicator.state}
                aria-label={
                  problems === null
                    ? t('projectBar.problemsShowNone')
                    : t('projectBar.problemsShow', { counts: problems })
                }
                onClick={(event) => onShowProblems(pressOf(event))}
              >
                {indicator.state === 'clear' ? (
                  <Icon of="check" size={14} />
                ) : (
                  <>
                    <SeverityGlyph severity={indicator.state} />
                    <span aria-hidden="true">{indicator.count}</span>
                  </>
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Said politely, once per change (§2): the save state, the problems and
          the selection (X21).
          Text that does not change is not touched, so it is not said again;
          during a drag the problems wait for it to end. */}
        <div className="visually-hidden" aria-live="polite" data-testid="announcer">
          <span data-testid="announce-save">{saveWords}</span>{' '}
          <span data-testid="announce-problems">
            <Settled
              value={
                problems === null
                  ? t('projectBar.problemsNone')
                  : t('projectBar.problems', { counts: problems })
              }
              settled={settled}
            />
          </span>{' '}
          <span data-testid="announce-selection">
            <Settled value={selectionAnnouncement(project, selection, i18n)} settled={settled} />
          </span>
        </div>
      </header>
    </>
  );
}

/** A value that holds still while `settled` is false: what a gesture passes through is not said. */
function Settled({ value, settled }: { value: string; settled: boolean }) {
  const [shown, setShown] = useState(value);
  if (settled && shown !== value) setShown(value);
  return <>{settled ? value : shown}</>;
}

/**
 * `LeatherCAD print test — LeatherCAD`, with a leading dot while there is
 * unsaved work: the active tab's name (8.12).
 */
export function windowTitle(name: string, dirty: boolean, t: Translate): string {
  return t(dirty ? 'app.windowTitleUnsaved' : 'app.windowTitle', { name });
}
