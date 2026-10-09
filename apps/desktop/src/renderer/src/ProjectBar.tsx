import { setProjectName, type DocumentStore } from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import { isScaleCheckOnly } from '@leathercad/export';
import type { RecentFile } from '@leathercad/platform';
import { ChevronDown, CircleHelp, Settings } from 'lucide-react';

import type { Translate } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { MenuButton } from './Menu.js';
import { exportMenu, helpMenu, projectMenu } from './menus.js';
import { SheetIndicator } from './SheetIndicator.js';
import { describeSheets } from './sheetWords.js';
import { sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

/**
 * The project bar (F.8, 8.7): **the project, what it will print, and the
 * application.**
 *
 * Left, the project itself: its menu — new, open, save as, the recent
 * projects — its name as the window's one title, and whether it is saved.
 * Right, where the workflow ends: the sheets it will print on, *Export PDF*
 * for a file — with the menu of its other formats joined to it —
 * and *Print* — the one primary action in the window, green (7.6),
 * which opens LeatherCAD's own Print Preview. Past a rule, the application:
 * Settings and Help. Nothing here edits the pattern; that is the work bar's.
 */
export function ProjectBar({
  project,
  store,
  dirty,
  saved,
  onNew,
  onOpen,
  onSaveAs,
  recent,
  onProjectMenuOpen,
  onOpenRecent,
  onOpenSample,
  onAbout,
  onSettings,
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
  onNew: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  /** The Project menu's recent projects (8.7), most recent first. */
  recent: readonly RecentFile[];
  /** The Project menu is opening: its recent projects are asked for again. */
  onProjectMenuOpen: () => void;
  onOpenRecent: (path: string) => void;
  onOpenSample: () => void;
  onAbout: () => void;
  onSettings: () => void;
  onSave: () => void;
  onExport: () => void;
  /** *Export SVG…* and *Export DXF…* (6.2, 6.5), from the menu beside *Export PDF*. */
  onExportSvg: () => void;
  onExportDxf: () => void;
  onPrint: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="project-bar" data-testid="project-bar">
      {/* The product's name is the window title's and the icon's to carry;
          the document outline still starts with it. */}
      <h1 className="visually-hidden">LeatherCAD</h1>
      <div className="project-identity">
        <MenuButton
          label={t('projectBar.projectMenu')}
          tooltip={t('projectBar.projectMenuTooltip')}
          testId="project-menu"
          className="tool quiet project-menu-button"
          entries={projectMenu(
            { newProject: onNew, open: onOpen, saveAs: onSaveAs, openRecent: onOpenRecent },
            recent,
            t,
          )}
          onOpen={onProjectMenuOpen}
        >
          <ProjectMark />
          <Icon of={ChevronDown} size={12} />
        </MenuButton>
        <Tooltip text={t('projectBar.nameTooltip')}>
          <input
            className="project-name"
            data-testid="project-name"
            aria-label={t('projectBar.name')}
            value={project.name}
            placeholder={t('app.untitled')}
            onChange={(event) => store.dispatch(setProjectName(event.target.value))}
          />
        </Tooltip>
        {/* Said once, beside the project it is about. */}
        <span
          className={dirty ? 'save-state unsaved' : 'save-state'}
          data-testid="save-state"
          aria-live="polite"
        >
          {dirty ? t('projectBar.unsaved') : saved ? t('projectBar.saved') : ''}
        </span>
        <Tooltip text={t('projectBar.saveTooltip')} keys="save">
          <button type="button" className="tool" data-testid="save" onClick={onSave}>
            {t('actions.save')}
          </button>
        </Tooltip>
      </div>

      <div className="project-output" role="group" aria-label={t('projectBar.output')}>
        <SheetIndicator project={project} store={store} />
        <Tooltip
          text={t('projectBar.exportTooltip', { sheets: describeSheets(sheetPlanFor(project), t) })}
          keys="exportPdf"
        >
          <button type="button" className="tool" data-testid="export-pdf" onClick={onExport}>
            {t('projectBar.exportPdf')}
          </button>
        </Tooltip>
        {/* The other formats (6.2, 6.5), joined to *Export PDF*: files for a
            cutter or a vector editor, not paper. */}
        <MenuButton
          label={t('projectBar.exportMore')}
          tooltip={t('projectBar.exportMoreTooltip')}
          testId="export-more"
          className="tool quiet icon-only"
          align="end"
          entries={exportMenu(
            { svg: onExportSvg, dxf: onExportDxf },
            !isScaleCheckOnly(sheetPlanFor(project)),
            t,
          )}
        >
          <Icon of={ChevronDown} size={12} />
        </MenuButton>
        <Tooltip
          text={t('projectBar.printTooltip', { sheets: describeSheets(sheetPlanFor(project), t) })}
          keys="print"
        >
          <button type="button" className="tool primary" data-testid="print" onClick={onPrint}>
            {t('projectBar.print')}
          </button>
        </Tooltip>
      </div>

      {/* Past the rule is the application, not this project (8.7). */}
      <div className="project-app" role="group" aria-label={t('projectBar.application')}>
        <Tooltip text={t('projectBar.settingsTooltip')} keys="settings">
          <button
            type="button"
            className="tool quiet icon-only"
            data-testid="settings"
            aria-label={t('projectBar.settings')}
            onClick={onSettings}
          >
            <Icon of={Settings} />
          </button>
        </Tooltip>
        <MenuButton
          label={t('projectBar.help')}
          testId="help-menu"
          className="tool quiet icon-only"
          align="end"
          entries={helpMenu({ openSample: onOpenSample, about: onAbout }, t)}
        >
          <Icon of={CircleHelp} />
        </MenuButton>
      </div>
    </header>
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
