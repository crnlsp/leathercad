import { setProjectName, type DocumentStore } from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import { describeSheets } from '@leathercad/export';

import { SheetIndicator } from './SheetIndicator.js';
import { sheetPlanFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

/**
 * The project bar (F.8): **the project, and what it will print.**
 *
 * Left, the project itself: its name as the window's one title, and whether it
 * is saved, with the file actions that manage it. Right, where the workflow
 * ends: the sheets it will print on, and *Export PDF* — the one primary action
 * in the window. Nothing here edits the pattern; that is the work bar's.
 */
export function ProjectBar({
  project,
  store,
  dirty,
  saved,
  onNew,
  onOpen,
  onSave,
  onExport,
}: {
  project: Project;
  store: DocumentStore;
  dirty: boolean;
  /** The project has a file it was last saved to, or opened from. */
  saved: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
}) {
  return (
    <header className="project-bar" data-testid="project-bar">
      {/* The product's name is the window title's and the icon's to carry;
          the document outline still starts with it. */}
      <h1 className="visually-hidden">LeatherCAD</h1>
      <div className="project-identity">
        <Tooltip text="Project name — used for the file name and the PDF footer">
          <input
            className="project-name"
            data-testid="project-name"
            aria-label="Project name"
            value={project.name}
            placeholder="Untitled"
            onChange={(event) => store.dispatch(setProjectName(event.target.value))}
          />
        </Tooltip>
        {/* Said once, beside the project it is about. */}
        <span
          className={dirty ? 'save-state unsaved' : 'save-state'}
          data-testid="save-state"
          aria-live="polite"
        >
          {dirty ? 'Unsaved changes' : saved ? 'Saved' : ''}
        </span>
        <Tooltip text="Save (Ctrl+S) · Save as (Ctrl+Shift+S)">
          <button type="button" className="tool" data-testid="save" onClick={onSave}>
            Save
          </button>
        </Tooltip>
        <Tooltip text="Start a new project (Ctrl+N)">
          <button type="button" className="tool quiet" data-testid="new" onClick={onNew}>
            New
          </button>
        </Tooltip>
        <Tooltip text="Open a project (Ctrl+O)">
          <button type="button" className="tool quiet" data-testid="open" onClick={onOpen}>
            Open
          </button>
        </Tooltip>
      </div>

      <div className="project-output" role="group" aria-label="Output">
        <SheetIndicator project={project} store={store} />
        <Tooltip
          text={`Export ${describeSheets(sheetPlanFor(project))} as a print-ready PDF at 1:1 (Ctrl+E)`}
        >
          <button
            type="button"
            className="tool primary"
            data-testid="export-pdf"
            onClick={onExport}
          >
            Export PDF
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

/** `LeatherCAD print test — LeatherCAD`, with a leading dot while there is unsaved work. */
export function windowTitle(project: Project, dirty: boolean): string {
  const name = project.name.trim() === '' ? 'Untitled' : project.name.trim();
  return `${dirty ? '• ' : ''}${name} — LeatherCAD`;
}
