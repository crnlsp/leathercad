import type { Document, DocumentStore } from '@leathercad/document';
import { exportReadiness, type ExportReadiness, type Project } from '@leathercad/domain';
import { exportPdf, exportSvg, type TiledPart } from '@leathercad/export';
import {
  CURRENT_FORMAT_VERSION,
  InvalidProjectFileError,
  LCP_EXTENSION,
  NewerFormatError,
  loadProject,
  saveProject,
} from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useRef, useState } from 'react';

import type { Translate } from '../../shared/i18n.js';
import { describeProblemWithSubject } from './problemText.js';
import { sheetPlanFor } from './sheets.js';

export interface ProjectFileState {
  readonly path: string | null;
  /**
   * What went wrong with the last save, open or export, as it was thrown: put
   * into words where it is shown (`fileErrorText`), so it follows a change of
   * language like everything else.
   */
  readonly error: unknown;
  readonly savedAt: string | null;
}

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
   * paper*; an SVG (6.2) is a file for a machine, and it says what is *in the
   * file*. The facts are the same ones.
   */
  readonly format: ExportFormat;
}

export type ExportFormat = 'pdf' | 'svg';

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
  store: DocumentStore,
  host: () => PlatformHost,
  appVersion: string,
  /** A fresh, empty document, for *New*. */
  blank: () => Document,
  /** The interface's words, for the file dialogs. */
  t: Translate,
): {
  state: ProjectFileState;
  /** True once the project is written; false when the maker cancelled or the write failed. */
  save: (forcePrompt?: boolean) => Promise<boolean>;
  open: () => Promise<void>;
  /**
   * Opens a project the main process already granted — a recent project (8.2, 8.7).
   * The caller asks about unsaved work first, as for `open`.
   */
  openPath: (target: string) => Promise<void>;
  /**
   * Opens the sample project that ships with the app (8.3), **untitled** and
   * unchanged: *Save* asks where, and closing it untouched asks nothing. The
   * caller asks about unsaved work first, as for `open`.
   */
  openSample: () => Promise<void>;
  /** Starts an empty, untitled project. The caller asks about unsaved work first. */
  newProject: () => void;
  /**
   * Opens a recovered project **untitled and unsaved** (5.3b): it has no path,
   * so *Save* asks where, and the file it once came from is never written.
   */
  adoptRecovered: (project: Project) => void;
  /**
   * Whether the document differs from what was last saved or opened. By
   * identity: undoing back to the saved document makes it clean again.
   */
  isDirty: () => boolean;
  /**
   * Exports, then says what the maker should check. Null when they cancelled
   * or it failed — and null too when there is nothing to say, so a clean
   * export stays silent.
   */
  exportPdfFile: (shown?: Uint8Array) => Promise<ExportReport | null>;
  /** The same, for an SVG (6.2): written, not opened. */
  exportSvgFile: () => Promise<ExportReport | null>;
  markSaved: () => void;
  savedDocument: React.MutableRefObject<unknown>;
} {
  const [state, setState] = useState<ProjectFileState>({
    path: null,
    error: null,
    savedAt: null,
  });
  // The document the app starts with counts as saved: an untouched project has
  // nothing to lose, and a close guard must not ask about a blank page (5.3a).
  const savedDocument = useRef<unknown>(store.getState().document);
  const createdUtc = useRef<string | undefined>(undefined);

  const markSaved = useCallback(() => {
    savedDocument.current = store.getState().document;
  }, [store]);

  const save = useCallback(
    async (forcePrompt = false) => {
      try {
        const platform = host();
        let target = state.path;

        if (target === null || forcePrompt) {
          target = await platform.showSaveDialog({
            title: t('file.saveTitle'),
            defaultPath: `${store.getState().document.project.name || t('app.untitled')}.${LCP_EXTENSION}`,
            filters: [{ name: t('file.project'), extensions: [LCP_EXTENSION] }],
          });
          // A cancelled dialog is not an error; it is the user changing their
          // mind, and must not leave a message on screen.
          if (target === null) return false;
          if (!target.endsWith(`.${LCP_EXTENSION}`)) target = `${target}.${LCP_EXTENSION}`;
        }

        // The document these bytes are made from is the one marked saved — not
        // whatever the store holds once the write returns. An edit landing
        // during a slow write is not on disk, so it must stay unsaved (Q16).
        const written = store.getState().document;
        const bytes = saveProject(written.project, {
          applicationVersion: appVersion,
          now: () => new Date(),
          ...(createdUtc.current === undefined ? {} : { createdUtc: createdUtc.current }),
        });

        await platform.writeFile(target, bytes);
        savedDocument.current = written;
        setState({ path: target, error: null, savedAt: new Date().toLocaleTimeString() });
        void noteRecent(platform, target);
        return true;
      } catch (error) {
        setState((previous) => ({ ...previous, error }));
        return false;
      }
    },
    [appVersion, host, state.path, store, t],
  );

  const openPath = useCallback(
    async (target: string) => {
      try {
        const platform = host();
        const loaded = loadProject(await platform.readFile(target));
        store.reset({ project: loaded.project });
        savedDocument.current = store.getState().document;
        createdUtc.current = loaded.manifest.createdUtc;
        setState({ path: target, error: null, savedAt: null });
        void noteRecent(platform, target);
      } catch (error) {
        setState((previous) => ({ ...previous, error }));
      }
    },
    [host, store],
  );

  const openSample = useCallback(async () => {
    try {
      const loaded = loadProject(await host().readSampleProject());
      store.reset({ project: loaded.project }, { action: 'open-sample' });
      savedDocument.current = store.getState().document;
      createdUtc.current = undefined;
      setState({ path: null, error: null, savedAt: null });
    } catch (error) {
      setState((previous) => ({ ...previous, error }));
    }
  }, [host, store]);

  const open = useCallback(async () => {
    let target: string | null;
    try {
      target = await host().showOpenDialog({
        title: t('file.openTitle'),
        filters: [{ name: t('file.project'), extensions: [LCP_EXTENSION] }],
      });
    } catch (error) {
      setState((previous) => ({ ...previous, error }));
      return;
    }
    if (target !== null) await openPath(target);
  }, [host, openPath, t]);

  /**
   * Writes a print-ready PDF and opens it in the system viewer: *Export PDF*,
   * and the Print Preview's *Save PDF…* where LeatherCAD cannot print itself
   * (7.6), which hands over the bytes it showed rather than writing new ones.
   */
  const exportPdfFile = useCallback(
    async (shown?: Uint8Array): Promise<ExportReport | null> => {
      try {
        const platform = host();
        const project = store.getState().document.project;

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

        setState((previous) => ({
          ...previous,
          error: null,
          savedAt: new Date().toLocaleTimeString(),
        }));

        await platform.openInExternalViewer(target);

        // Reported *after* the file is written: export warns, and never blocks (§5).
        return exportReportFor(project);
      } catch (error) {
        setState((previous) => ({ ...previous, error }));
        return null;
      }
    },
    [appVersion, host, store, t],
  );

  /**
   * Writes the drawing as an SVG (6.2): the board's arrangement in true
   * millimetres, for a laser cutter, a plotter or a vector editor.
   *
   * It is the scene the PDF is written from, so it holds exactly what the PDF
   * prints. Nothing opens it afterwards — the main process opens only the PDF
   * it has exported, and a cutter's software is the maker's to start — so what
   * the maker is told is what to check, as after a PDF.
   */
  const exportSvgFile = useCallback(async (): Promise<ExportReport | null> => {
    try {
      const platform = host();
      const project = store.getState().document.project;
      const target = await exportTarget(platform, project, 'svg', {
        title: t('file.exportSvgTitle'),
        filter: t('file.svg'),
        untitled: t('app.untitled'),
      });
      if (target === null) return null;

      const { text } = exportSvg(sheetPlanFor(project).scene);
      await platform.writeFile(target, new TextEncoder().encode(text));

      setState((previous) => ({
        ...previous,
        error: null,
        savedAt: new Date().toLocaleTimeString(),
      }));
      return exportReportFor(project, 'svg');
    } catch (error) {
      setState((previous) => ({ ...previous, error }));
      return null;
    }
  }, [host, store, t]);

  const newProject = useCallback(() => {
    store.reset(blank(), { action: 'new-project' });
    savedDocument.current = store.getState().document;
    createdUtc.current = undefined;
    setState({ path: null, error: null, savedAt: null });
  }, [blank, store]);

  const adoptRecovered = useCallback(
    (project: Project) => {
      store.reset({ project }, { action: 'recover' });
      // Never saved in this session, and never to be saved over its original:
      // unsaved by construction.
      savedDocument.current = null;
      createdUtc.current = undefined;
      setState({ path: null, error: null, savedAt: null });
    },
    [store],
  );

  const isDirty = useCallback(() => savedDocument.current !== store.getState().document, [store]);

  return {
    state,
    save,
    open,
    openPath,
    openSample,
    newProject,
    adoptRecovered,
    isDirty,
    exportPdfFile,
    exportSvgFile,
    markSaved,
    savedDocument,
  };
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
  extension: 'pdf' | 'svg',
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
