import { setProjectName, type DocumentStore } from '@leathercad/document';
import type { Project, SeverityCounts } from '@leathercad/domain';
import { isScaleCheckOnly } from '@leathercad/export';
import type { RecentFile, RecentOutcome } from '@leathercad/platform';
import { Check, ChevronDown, Circle, CircleHelp, Settings } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import type { Translate } from '../../shared/i18n.js';
import { intoMenu } from './fieldMenu.js';
import type { CanvasView } from './CanvasHost.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { KeyCap } from './keyCaps.js';
import { MenuButton } from './Menu.js';
import { MessageDialog } from './MessageDialog.js';
import { exportMenu, helpMenu, projectMenu } from './menus.js';
import { pressOf, type Press } from './PanelFold.js';
import type { Room } from './panelLayout.js';
import { PaperButton } from './PaperButton.js';
import { describeCounts, indicatorOf } from './problemsIndicator.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import { describeSheets } from './sheetWords.js';
import { sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';
import { ViewSwitch } from './ViewSwitch.js';

/**
 * The top bar (F.8, 8.7, R-06), in three zones that answer three questions at
 * a glance: **is my work saved, am I designing or checking the sheets, and is
 * the pattern ready to print.**
 *
 * Left, the project: its menu, whose button is its name — new, open, save as,
 * rename, the recent projects — then whether it is saved, and Save. Centre,
 * Design | Sheets. Right, where the workflow ends: the paper, *Export PDF* with
 * the menu of its other formats as its second half, and *Print* — the one
 * primary action, in the paper's colour — whose second half is the problems
 * indicator, so what is wrong is on the button that would print it. Past a
 * rule, the application: Settings and Help. Nothing here edits the pattern;
 * that is the work bar's.
 */
export function ProjectBar({
  project,
  store,
  dirty,
  saved,
  room,
  view,
  onView,
  counts,
  settled,
  onShowProblems,
  helpRef,
  onNew,
  onOpen,
  onSaveAs,
  recent,
  onProjectMenuOpen,
  onOpenRecent,
  onOpenSample,
  onAbout,
  onSettings,
  updateAvailable,
  onSave,
  onExport,
  onExportSvg,
  onExportDxf,
  onPrint,
}: {
  project: Project;
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
  /** The Help menu's button, which F1 opens. */
  helpRef: RefObject<HTMLButtonElement | null>;
  onNew: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  /** The Project menu's recent projects (8.7), most recent first. */
  recent: readonly RecentFile[];
  /** The Project menu is opening: its recent projects are asked for again. */
  onProjectMenuOpen: () => void;
  /** One that is gone is taken off the list, and this bar says why (U.20). */
  onOpenRecent: (path: string) => Promise<RecentOutcome>;
  onOpenSample: () => void;
  onAbout: () => void;
  onSettings: () => void;
  /** A newer release exists (8.9): Settings carries a quiet mark. */
  updateAvailable: boolean;
  onSave: () => void;
  onExport: () => void;
  /** *Export SVG…* and *Export DXF…* (6.2, 6.5), from the menu beside *Export PDF*. */
  onExportSvg: () => void;
  onExportDxf: () => void;
  onPrint: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = sheetPlanFor(project);
  const name = project.name.trim() === '' ? t('app.untitled') : project.name;
  const menuButton = useRef<HTMLButtonElement>(null);
  // Renaming (U.7, the roadmap's decision): *Rename…* in the Project menu turns
  // the name into the field it was before, and one edit is one undo step.
  const [renaming, setRenaming] = useState<Press | null>(null);
  // A recent project that is no longer there: said in the app's own dialog,
  // where the main process used to raise a native message box (U.20).
  const [gone, setGone] = useState<string | null>(null);

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
        <div className="project-identity">
          {renaming === null ? (
            <MenuButton
              label={t('projectBar.projectMenu', { name })}
              tooltip={t('projectBar.projectMenuTooltip', { name })}
              testId="project-menu"
              className="tool quiet project-menu-button"
              triggerRef={menuButton}
              entries={projectMenu(
                {
                  newProject: onNew,
                  open: onOpen,
                  saveAs: onSaveAs,
                  // A keyboard's choice gives focus back to the menu once the
                  // name is set; the pointer's leaves it with the page (U.4).
                  rename: (how) => setRenaming(how ?? 'keyboard'),
                  openRecent: (path) =>
                    void onOpenRecent(path)
                      .then((outcome) => {
                        if (outcome === 'gone') setGone(path);
                      })
                      .catch(() => undefined),
                },
                recent,
                t,
              )}
              onOpen={onProjectMenuOpen}
            >
              <ProjectMark />
              <span className="project-name" data-testid="project-name">
                {name}
              </span>
              <Icon of={ChevronDown} size={12} />
            </MenuButton>
          ) : (
            <NameField
              name={project.name}
              onDone={(next) => {
                if (next !== null && next !== project.name) store.dispatch(setProjectName(next));
                const back = renaming === 'keyboard';
                setRenaming(null);
                if (back) requestAnimationFrame(() => menuButton.current?.focus());
              }}
            />
          )}
          <SaveState dirty={dirty} saved={saved} room={room} />
          <Tooltip
            text={dirty ? t('projectBar.saveTooltip') : t('projectBar.nothingToSave')}
            {...(dirty ? { keys: 'save' as const } : {})}
          >
            <button
              type="button"
              className="tool save-button"
              data-testid="save"
              // Not `disabled`: a disabled button shows no tooltip, and this one
              // says why it has nothing to do (R-06).
              aria-disabled={!dirty || undefined}
              onClick={() => {
                if (dirty) onSave();
              }}
            >
              {t('actions.save')}
              {dirty && room === 'wide' && <KeyCap command="save" />}
            </button>
          </Tooltip>
        </div>

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
              <Icon of={ChevronDown} size={12} />
            </MenuButton>
          </div>
          <div className="split primary">
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
                    ? t('projectBar.problemsNone')
                    : t('projectBar.problems', { counts: problems })
                }
                onClick={(event) => onShowProblems(pressOf(event))}
              >
                {indicator.state === 'clear' ? (
                  <Icon of={Check} size={14} />
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

        {/* Past the rule is the application, not this project (8.7). */}
        <div className="project-app" role="group" aria-label={t('projectBar.application')}>
          <Tooltip text={t('projectBar.settingsTooltip')} keys="settings">
            <button
              type="button"
              className="tool quiet icon-only settings-button"
              data-testid="settings"
              aria-label={t(updateAvailable ? 'projectBar.settingsUpdate' : 'projectBar.settings')}
              onClick={onSettings}
            >
              <Icon of={Settings} />
              {updateAvailable && <span className="update-mark" data-testid="update-mark" />}
            </button>
          </Tooltip>
          <MenuButton
            label={t('projectBar.help')}
            tooltip={t('projectBar.helpTooltip')}
            keys="help"
            testId="help-menu"
            className="tool quiet icon-only"
            align="end"
            triggerRef={helpRef}
            entries={helpMenu({ openSample: onOpenSample, about: onAbout }, t)}
          >
            <Icon of={CircleHelp} />
          </MenuButton>
        </div>

        {/* Said politely, once per change (§2): the save state and the problems.
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
          </span>
        </div>
      </header>
      {gone !== null && (
        <MessageDialog
          title={t('menu.recentGone')}
          testId="recent-gone"
          onClose={() => setGone(null)}
        >
          <p className="dialog-part">{gone}</p>
          <p>{t('menu.recentGoneDetail')}</p>
        </MessageDialog>
      )}
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
 * Saved: a check and "Saved". Unsaved: an open dot and "Unsaved changes" —
 * "Unsaved" in a narrow window, the dot alone in a cramped one. Nothing for a
 * new project that has nothing in it yet.
 */
function SaveState({ dirty, saved, room }: { dirty: boolean; saved: boolean; room: Room }) {
  const { t } = useI18n();
  if (!dirty && !saved) return <span className="save-state" data-testid="save-state" />;
  const words = dirty
    ? room === 'wide'
      ? t('projectBar.unsaved')
      : t('projectBar.unsavedShort')
    : t('projectBar.saved');
  return (
    <span className={dirty ? 'save-state unsaved' : 'save-state'} data-testid="save-state">
      <Icon of={dirty ? Circle : Check} size={dirty ? 8 : 12} />
      <span className={room === 'cramped' ? 'visually-hidden' : undefined}>{words}</span>
    </span>
  );
}

/**
 * The name, being renamed: Enter or leaving keeps it, Escape puts it back.
 * One edit, so one undo step — typed into the bar before U.7, every letter
 * was a step of its own.
 */
function NameField({ name, onDone }: { name: string; onDone: (next: string | null) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (next: string | null): void => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
  return (
    <span className="project-rename">
      <ProjectMark />
      <input
        ref={input}
        className="project-name-input"
        data-testid="project-name-input"
        aria-label={t('projectBar.name')}
        value={draft}
        placeholder={t('app.untitled')}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish(draft);
          else if (event.key === 'Escape') {
            event.stopPropagation();
            finish(null);
          }
        }}
        onBlur={(event) => {
          // The field's own menu is not leaving it (U.20).
          if (!intoMenu(event.relatedTarget)) finish(draft);
        }}
      />
    </span>
  );
}
/** The icon's stitching (build/icon.svg), in the 16 px box: down, along and up. */
const POCKET_HOLES: readonly (readonly [number, number])[] = [
  [4.6, 6.2],
  [4.6, 8.65],
  [4.6, 11.1],
  [6.87, 11.1],
  [9.13, 11.1],
  [11.4, 11.1],
  [11.4, 8.65],
  [11.4, 6.2],
];

/**
 * The Project menu's face (8.7): the icon's card pocket, drawn as the rail
 * draws a piece — the outline at the cut weight, the stitching as holes — in
 * the current colour. Never tan: the accent is the maker's own focus and the
 * primary action (UI Foundations §5.3).
 */
function ProjectMark() {
  return (
    <svg className="icon" width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2 2.5H5.46A2.62 2.62 0 0 0 10.54 2.5H14V12.4A1.3 1.3 0 0 1 12.7 13.7H3.3A1.3 1.3 0 0 1 2 12.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {POCKET_HOLES.map(([x, y]) => (
        <circle key={`${String(x)},${String(y)}`} cx={x} cy={y} r={0.65} fill="currentColor" />
      ))}
    </svg>
  );
}

/** `LeatherCAD print test — LeatherCAD`, with a leading dot while there is unsaved work. */
export function windowTitle(project: Project, dirty: boolean, t: Translate): string {
  const name = project.name.trim() === '' ? t('app.untitled') : project.name.trim();
  return t(dirty ? 'app.windowTitleUnsaved' : 'app.windowTitle', { name });
}
