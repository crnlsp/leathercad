import type { Document, DocumentStore } from '@leathercad/document';
import { exportReadiness, type ExportReadiness, type Project } from '@leathercad/domain';
import { exportPdf, type TiledPart } from '@leathercad/export';
import { LCP_EXTENSION, loadProject, saveProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useRef, useState } from 'react';

import { sheetPlanFor } from './sheets.js';

export interface ProjectFileState {
  readonly path: string | null;
  readonly error: string | null;
  readonly savedAt: string | null;
}

const FILTERS = [{ name: 'LeatherCAD project', extensions: [LCP_EXTENSION] }];
const PDF_FILTERS = [{ name: 'PDF', extensions: ['pdf'] }];

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
}

export function useProjectFile(
  store: DocumentStore,
  host: () => PlatformHost,
  appVersion: string,
  /** A fresh, empty document, for *New*. */
  blank: () => Document,
): {
  state: ProjectFileState;
  /** True once the project is written; false when the maker cancelled or the write failed. */
  save: (forcePrompt?: boolean) => Promise<boolean>;
  open: () => Promise<void>;
  /**
   * Opens a project the main process already granted — *Open Recent* (8.2).
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
  exportPdfFile: () => Promise<ExportReport | null>;
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
            title: 'Save project',
            defaultPath: `${store.getState().document.project.name || 'Untitled'}.${LCP_EXTENSION}`,
            filters: FILTERS,
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
        setState((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        }));
        return false;
      }
    },
    [appVersion, host, state.path, store],
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
        setState((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    [host, store],
  );

  const openSample = useCallback(async () => {
    try {
      const loaded = loadProject(await host().readSampleProject());
      store.reset({ project: loaded.project }, 'Open sample');
      savedDocument.current = store.getState().document;
      createdUtc.current = undefined;
      setState({ path: null, error: null, savedAt: null });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [host, store]);

  const open = useCallback(async () => {
    let target: string | null;
    try {
      target = await host().showOpenDialog({
        title: 'Open project',
        filters: FILTERS,
      });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
      return;
    }
    if (target !== null) await openPath(target);
  }, [host, openPath]);

  /**
   * Writes a print-ready PDF and opens it in the system viewer.
   *
   * The application deliberately never drives a printer — the user prints
   * from an ordinary viewer — so handing them the open file is where our
   * responsibility ends.
   */
  const exportPdfFile = useCallback(async (): Promise<ExportReport | null> => {
    try {
      const platform = host();
      const project = store.getState().document.project;

      // Only a project extension is taken off: "Wallet v1.2" is a name, and
      // cutting it at its last dot suggested "Wallet v1.pdf" (Q18).
      const suggested = (project.name || 'Untitled').replace(/\.lcp$/i, '');
      const target = await platform.showSaveDialog({
        title: 'Export PDF',
        defaultPath: `${suggested}.pdf`,
        filters: PDF_FILTERS,
      });
      if (target === null) return null;

      // The plan the maker has been looking at — the sheet count, Parts and
      // the Sheets view all read this same object — so the file is exactly
      // the print they were shown (7.4a).
      const plan = sheetPlanFor(project);
      const { bytes } = await exportPdf(plan, {
        applicationVersion: appVersion,
        now: () => new Date(),
      });

      await platform.writeFile(target.endsWith('.pdf') ? target : `${target}.pdf`, bytes);

      setState((previous) => ({
        ...previous,
        error: null,
        savedAt: new Date().toLocaleTimeString(),
      }));

      await platform.openInExternalViewer(target.endsWith('.pdf') ? target : `${target}.pdf`);

      // Read from the project that was just exported, and reported *after* the
      // file is written: export warns, and never blocks (§5). A part too large
      // for the sheet is printed across several (7.2a) — not a problem, but
      // something the maker needs to know to put the sheets together.
      const readiness = exportReadiness(project);
      const quiet =
        readiness.omitted.length === 0 &&
        readiness.errors === 0 &&
        readiness.warnings === 0 &&
        readiness.infos === 0 &&
        plan.pagination.tiled.length === 0;
      return quiet ? null : { readiness, tiled: plan.pagination.tiled };
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, [appVersion, host, store]);

  const newProject = useCallback(() => {
    store.reset(blank(), 'New project');
    savedDocument.current = store.getState().document;
    createdUtc.current = undefined;
    setState({ path: null, error: null, savedAt: null });
  }, [blank, store]);

  const adoptRecovered = useCallback(
    (project: Project) => {
      store.reset({ project }, 'Recover');
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
    markSaved,
    savedDocument,
  };
}

/**
 * Puts a project on *File › Open Recent*. A list that could not be updated
 * costs nothing that matters, so it never becomes an error on screen.
 */
async function noteRecent(platform: PlatformHost, path: string): Promise<void> {
  try {
    await platform.noteRecentFile(path);
  } catch {
    // The project itself is saved or open; only the menu is behind.
  }
}
