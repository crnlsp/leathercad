import { setProjectName, type Document } from '@leathercad/document';
import { exportReadiness, type ExportReadiness, type Project } from '@leathercad/domain';
import { exportDxf, exportPdf, exportSvg, type TiledPart } from '@leathercad/export';
import {
  CURRENT_FORMAT_VERSION,
  InvalidProjectFileError,
  LCP_EXTENSION,
  NewerFormatError,
  loadProject,
  saveProject,
} from '@leathercad/persist';
import type { PlatformHost, TabCamera, TemplateSave } from '@leathercad/platform';
import { useCallback } from 'react';

import type { Translate } from '../../shared/i18n.js';
import { describeProblemWithSubject } from './problemText.js';
import {
  isUnnamed,
  nextUntitled,
  projectNameOf,
  type ProjectTab,
  type ProjectTabs,
} from './projectTabs.js';
import { sheetPlanFor } from './sheets.js';

/**
 * A file error in the interface's words (ADR 0018). A file from a newer
 * version, and a design whose reference graph is broken, are said in full;
 * anything below that — bytes that are not an archive, a schema violation,
 * the operating system refusing a write — is said as it was reported.
 */
export function fileErrorText(error: unknown, t: Translate): string {
  if (error instanceof NewerFormatError) {
    return t(error.savedBy === undefined ? 'file.newer' : 'file.newerNamed', {
      version: error.savedBy ?? '',
      format: error.fileVersion,
      current: CURRENT_FORMAT_VERSION,
    });
  }
  if (error instanceof InvalidProjectFileError && error.problems.length > 0) {
    const problems = error.problems.map((p) => describeProblemWithSubject(p, t)).join(' ');
    return t('file.invalid', { problems });
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Save and open, over the platform boundary.
 *
 * The renderer never touches the filesystem itself — every read and write goes
 * through `PlatformHost`, which is what keeps the shell replaceable. See
 * docs/architecture.md §5.
 */
/** What the maker is told after an export: what to check, and what spans sheets. */
export interface ExportReport {
  readonly readiness: ExportReadiness;
  readonly tiled: readonly TiledPart[];
  /**
   * What the export made. A PDF is paper, and the notice says what is *on the
   * paper*; an SVG or a DXF (6.2, 6.5) is a file for a machine, and it says
   * what is *in the file*. The facts are the same ones.
   */
  readonly format: ExportFormat;
}

export type ExportFormat = 'pdf' | 'svg' | 'dxf';

/** The formats of a drawing for a machine: a file, never opened afterwards. */
export type DrawingFormat = Exclude<ExportFormat, 'pdf'>;

/**
 * What the maker should know about a project's paper before using it, or null
 * when there is nothing to say. Export reports it once the file is written;
 * the Print Preview shows it before printing (7.6). A part too large for the
 * sheet is printed across several (7.2a) — not a problem, but something the
 * maker needs to know to put the sheets together.
 */
export function exportReportFor(
  project: Project,
  format: ExportFormat = 'pdf',
): ExportReport | null {
  const readiness = exportReadiness(project);
  // Sheets are the PDF's: a file for a cutter is the drawing, whole.
  const tiled = format === 'pdf' ? sheetPlanFor(project).pagination.tiled : [];
  const quiet =
    readiness.omitted.length === 0 &&
    readiness.errors === 0 &&
    readiness.warnings === 0 &&
    readiness.infos === 0 &&
    tiled.length === 0;
  return quiet ? null : { readiness, tiled, format };
}

export function useProjectFile(
  tabs: ProjectTabs,
  host: () => PlatformHost,
  appVersion: string,
  /**
   * A tab of its own for a project: its own store and history (8.12); for a
   * new one, which *Untitled* it is.
   */
  tabFor: (document: Document, untitled?: number) => ProjectTab,
  /** A fresh, empty document, for *New*. */
  blank: () => Document,
  /** The interface's words, for the file dialogs. */
  t: Translate,
  /** What went wrong opening a project with no tab open to say it in (8.12); null once one opens. */
  onStartError: (error: unknown) => void,
): {
  /** True once the project is written; false when the maker cancelled or the write failed. */
  save: (tab: ProjectTab, forcePrompt?: boolean) => Promise<boolean>;
  open: () => Promise<void>;
  /**
   * Opens a project the main process already granted — a launch, a second
   * launch, a recent project (8.2, 8.7, 8.11) — in a tab of its own, or goes
   * to the tab that already has it.
   */
  openPath: (target: string, restore?: TabRestore) => Promise<void>;
  /**
   * Work kept unsaved as the window last closed (8.12), in a tab of its own:
   * unsaved, with the file it belongs to if it had one.
   */
  restoreKept: (data: Uint8Array, path: string | null, restore: TabRestore) => ProjectTab | null;
  /** Starts an empty, untitled project in a tab of its own. */
  newProject: () => void;
  /**
   * A new project from a template (8.12), in a tab of its own: untitled and
   * unchanged, so Save asks where and closing it untouched asks nothing, and
   * a project of its own, with a new id. The template is never written.
   */
  newFromTemplate: (id: string) => Promise<void>;
  /** Saves a tab's project as one of the maker's templates (8.12). */
  saveAsTemplate: (tab: ProjectTab, name: string, replace: boolean) => Promise<TemplateSave>;
  /**
   * Opens a recovered project **untitled and unsaved** (5.3b): it has no path,
   * so *Save* asks where, and the file it once came from is never written.
   */
  adoptRecovered: (project: Project) => ProjectTab;
  /**
   * Exports, then says what the maker should check. Null when they cancelled
   * or it failed — and null too when there is nothing to say, so a clean
   * export stays silent.
   */
  exportPdfFile: (shown?: Uint8Array) => Promise<ExportReport | null>;
  /** The same, for a drawing as an SVG or a DXF (6.2, 6.5): written, not opened. */
  exportDrawingFile: (format: DrawingFormat) => Promise<ExportReport | null>;
  /**
   * Reads a tab's file again, as it was last saved (8.12), in the same tab:
   * its history starts again there. The caller asks about unsaved work first.
   */
  reload: (tab: ProjectTab) => Promise<void>;
  /** A copy of a tab's project in a new tab: unsaved, with no file, as recovered work is. */
  duplicate: (tab: ProjectTab) => void;
} {
  /** What went wrong, said in the tab it went wrong for — or on the start screen, with none. */
  const fail = useCallback(
    (tab: ProjectTab | null, error: unknown) => {
      if (tab === null) onStartError(error);
      else
        tabs.update(tab.id, (each) => {
          each.file = { ...each.file, error };
        });
    },
    [onStartError, tabs],
  );

  /**
   * A project read from a file or the sample, in a tab of its own: framed
   * whole when shown, or as the last session left it.
   */
  const show = useCallback(
    (
      document: Document,
      path: string | null,
      createdUtc: string | undefined,
      restore?: TabRestore,
    ) => {
      const tab = tabFor(document);
      tab.file = { path, error: null, savedAt: null };
      tab.createdUtc = createdUtc;
      tab.cameras.frameDrawing = true;
      if (restore !== undefined) {
        tab.view = restore.view;
        tab.cameras.restore = restore.camera;
      }
      tabs.open(tab);
      onStartError(null);
    },
    [onStartError, tabFor, tabs],
  );

  const save = useCallback(
    async (tab: ProjectTab, forcePrompt = false) => {
      try {
        const platform = host();
        let target = tab.file.path;

        if (target === null || forcePrompt) {
          target = await platform.showSaveDialog({
            title: t('file.saveTitle'),
            defaultPath: `${tab.store.getState().document.project.name || t('app.untitled')}.${LCP_EXTENSION}`,
            filters: [{ name: t('file.project'), extensions: [LCP_EXTENSION] }],
          });
          // A cancelled dialog is not an error; it is the user changing their
          // mind, and must not leave a message on screen.
          if (target === null) return false;
          if (!target.endsWith(`.${LCP_EXTENSION}`)) target = `${target}.${LCP_EXTENSION}`;
        }

        // A project with no name is named after the file it is first saved as
        // (8.12): its tab, the window's title and the next export say it.
        if (isUnnamed(tab.store.getState().document.project.name)) {
          tab.store.dispatch(setProjectName(projectNameOf(target)));
        }

        // The document these bytes are made from is the one marked saved — not
        // whatever the store holds once the write returns. An edit landing
        // during a slow write is not on disk, so it must stay unsaved (Q16).
        const written = tab.store.getState().document;
        const bytes = saveProject(written.project, {
          applicationVersion: appVersion,
          now: () => new Date(),
          ...(tab.createdUtc === undefined ? {} : { createdUtc: tab.createdUtc }),
        });

        await platform.writeFile(target, bytes);
        const path = target;
        tabs.update(tab.id, (each) => {
          each.savedDocument = written;
          each.file = { path, error: null, savedAt: new Date().toLocaleTimeString() };
        });
        void noteRecent(platform, target);
        return true;
      } catch (error) {
        fail(tab, error);
        return false;
      }
    },
    [appVersion, fail, host, t, tabs],
  );

  const openPath = useCallback(
    async (target: string, restore?: TabRestore) => {
      // Open already: its tab, as it is — never a second copy to save over the
      // first — and the tab bounces, so the maker sees it was open (8.12).
      const open = tabs.byPath(target);
      if (open !== undefined) {
        tabs.nudge(open.id);
        return;
      }
      try {
        const platform = host();
        const loaded = loadProject(await platform.readFile(target));
        show({ project: loaded.project }, target, loaded.manifest.createdUtc, restore);
        void noteRecent(platform, target);
      } catch (error) {
        fail(tabs.active, error);
      }
    },
    [fail, host, show, tabs],
  );

  const open = useCallback(async () => {
    let target: string | null;
    try {
      target = await host().showOpenDialog({
        title: t('file.openTitle'),
        filters: [{ name: t('file.project'), extensions: [LCP_EXTENSION] }],
      });
    } catch (error) {
      fail(tabs.active, error);
      return;
    }
    if (target !== null) await openPath(target);
  }, [fail, host, openPath, t, tabs]);

  /**
   * Writes a print-ready PDF and opens it in the system viewer: *Export PDF*,
   * and the Print Preview's *Save PDF…* where LeatherCAD cannot print itself
   * (7.6), which hands over the bytes it showed rather than writing new ones.
   */
  const exportPdfFile = useCallback(
    async (shown?: Uint8Array): Promise<ExportReport | null> => {
      const tab = tabs.active;
      if (tab === null) return null;
      try {
        const platform = host();
        const project = tab.store.getState().document.project;

        const target = await exportTarget(platform, project, 'pdf', {
          title: t('file.exportTitle'),
          filter: t('file.pdf'),
          untitled: t('app.untitled'),
        });
        if (target === null) return null;

        // The plan the maker has been looking at — the sheet count, Parts and
        // the Sheets view all read this same object — so the file is exactly
        // the print they were shown (7.4a).
        const plan = sheetPlanFor(project);
        const bytes =
          shown ??
          (await exportPdf(plan, { applicationVersion: appVersion, now: () => new Date() })).bytes;

        await platform.writeFile(target, bytes);
        exported(tabs, tab);

        await platform.openInExternalViewer(target);

        // Reported *after* the file is written: export warns, and never blocks (§5).
        return exportReportFor(project);
      } catch (error) {
        fail(tab, error);
        return null;
      }
    },
    [appVersion, fail, host, t, tabs],
  );

  /**
   * Writes the drawing as an SVG or a DXF (6.2, 6.5): the board's arrangement in
   * true millimetres, for a laser cutter, a plotter, a CNC program or a vector
   * editor.
   *
   * It is the scene the PDF is written from, so it holds exactly what the PDF
   * prints. Nothing opens it afterwards — the main process opens only the PDF
   * it has exported, and a cutter's software is the maker's to start — so what
   * the maker is told is what to check, as after a PDF.
   */
  const exportDrawingFile = useCallback(
    async (format: DrawingFormat): Promise<ExportReport | null> => {
      const tab = tabs.active;
      if (tab === null) return null;
      try {
        const platform = host();
        const project = tab.store.getState().document.project;
        const target = await exportTarget(platform, project, format, {
          title: t(format === 'svg' ? 'file.exportSvgTitle' : 'file.exportDxfTitle'),
          filter: t(format === 'svg' ? 'file.svg' : 'file.dxf'),
          untitled: t('app.untitled'),
        });
        if (target === null) return null;

        const scene = sheetPlanFor(project).scene;
        const { text } = format === 'svg' ? exportSvg(scene) : exportDxf(scene);
        await platform.writeFile(target, new TextEncoder().encode(text));
        exported(tabs, tab);
        return exportReportFor(project, format);
      } catch (error) {
        fail(tab, error);
        return null;
      }
    },
    [fail, host, t, tabs],
  );

  const newProject = useCallback(() => {
    tabs.add(tabFor(blank(), nextUntitled(tabs.tabs)));
    onStartError(null);
  }, [blank, onStartError, tabFor, tabs]);

  const adoptRecovered = useCallback(
    (project: Project) => {
      const tab = tabFor({ project });
      // Never saved in this session, and never to be saved over its original:
      // unsaved by construction.
      tab.savedDocument = null;
      tab.cameras.frameDrawing = true;
      tabs.open(tab);
      onStartError(null);
      return tab;
    },
    [onStartError, tabFor, tabs],
  );

  const reload = useCallback(
    async (tab: ProjectTab) => {
      const path = tab.file.path;
      if (path === null) return;
      try {
        const loaded = loadProject(await host().readFile(path));
        tab.store.reset({ project: loaded.project });
        tabs.update(tab.id, (each) => {
          each.savedDocument = each.store.getState().document;
          each.createdUtc = loaded.manifest.createdUtc;
          each.file = { path, error: null, savedAt: null };
        });
      } catch (error) {
        fail(tab, error);
      }
    },
    [fail, host, tabs],
  );

  const duplicate = useCallback(
    (tab: ProjectTab) => {
      // A project of its own: a new id, from the same place new projects get theirs.
      const project = { ...tab.store.getState().document.project, id: blank().project.id };
      const copy = tabFor({ project });
      copy.savedDocument = null;
      copy.cameras.frameDrawing = true;
      tabs.add(copy);
    },
    [blank, tabFor, tabs],
  );

  const newFromTemplate = useCallback(
    async (id: string) => {
      try {
        const data = await host().readTemplate(id);
        if (data === null) return;
        const loaded = loadProject(data);
        show({ project: { ...loaded.project, id: blank().project.id } }, null, undefined);
      } catch (error) {
        fail(tabs.active, error);
      }
    },
    [blank, fail, host, show, tabs],
  );

  const saveAsTemplate = useCallback(
    (tab: ProjectTab, name: string, replace: boolean): Promise<TemplateSave> => {
      const bytes = saveProject(tab.store.getState().document.project, {
        applicationVersion: appVersion,
        now: () => new Date(),
      });
      return host().saveTemplate(name, bytes, replace);
    },
    [appVersion, host],
  );

  const restoreKept = useCallback(
    (data: Uint8Array, path: string | null, restore: TabRestore): ProjectTab | null => {
      try {
        const loaded = loadProject(data);
        const tab = tabFor({ project: loaded.project });
        tab.file = { path, error: null, savedAt: null };
        tab.createdUtc = loaded.manifest.createdUtc;
        // Unsaved by construction: the work was never written to its file.
        tab.savedDocument = null;
        tab.view = restore.view;
        tab.cameras.restore = restore.camera;
        tab.cameras.frameDrawing = true;
        tabs.open(tab);
        return tab;
      } catch {
        // A copy that does not load is not worth a start that fails over it.
        return null;
      }
    },
    [tabFor, tabs],
  );

  return {
    newFromTemplate,
    saveAsTemplate,
    restoreKept,
    reload,
    duplicate,
    save,
    open,
    openPath,
    newProject,
    adoptRecovered,
    exportPdfFile,
    exportDrawingFile,
  };
}

/** How the last session left a tab (8.12): its view, and where its board was. */
export interface TabRestore {
  readonly view: 'design' | 'sheets';
  readonly camera: TabCamera | null;
}

/** An export was written: the tab's earlier error is gone, and the time is said. */
function exported(tabs: ProjectTabs, tab: ProjectTab): void {
  tabs.update(tab.id, (each) => {
    each.file = { ...each.file, error: null, savedAt: new Date().toLocaleTimeString() };
  });
}

/**
 * Asks where an export goes, and gives back the path it will be written to:
 * the one chosen, with the format's extension if the name typed has none. Null
 * when the maker cancels.
 *
 * The suggestion is the project's name. Only a project extension is taken off
 * it: "Wallet v1.2" is a name, and cutting it at its last dot suggested
 * "Wallet v1.pdf" (Q18).
 */
async function exportTarget(
  platform: PlatformHost,
  project: Project,
  extension: ExportFormat,
  words: { readonly title: string; readonly filter: string; readonly untitled: string },
): Promise<string | null> {
  const suggested = (project.name || words.untitled).replace(/\.lcp$/i, '');
  const target = await platform.showSaveDialog({
    title: words.title,
    defaultPath: `${suggested}.${extension}`,
    filters: [{ name: words.filter, extensions: [extension] }],
  });
  if (target === null) return null;
  return target.endsWith(`.${extension}`) ? target : `${target}.${extension}`;
}

/**
 * Puts a project on the recent projects (8.2, 8.7). A list that could not be updated
 * costs nothing that matters, so it never becomes an error on screen.
 */
async function noteRecent(platform: PlatformHost, path: string): Promise<void> {
  try {
    await platform.noteRecentFile(path);
  } catch {
    // The project itself is saved or open; only the menu is behind.
  }
}
