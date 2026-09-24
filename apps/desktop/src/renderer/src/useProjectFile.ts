import type { Document, DocumentStore } from '@leathercad/document';
import { evaluate, exportReadiness, type ExportReadiness, type Project } from '@leathercad/domain';
import { buildExportScene, describeOversized, exportPdf, pageSetupFor } from '@leathercad/export';
import { LCP_EXTENSION, loadProject, saveProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useRef, useState } from 'react';

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
  exportPdfFile: () => Promise<ExportReadiness | null>;
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

        const bytes = saveProject(store.getState().document.project, {
          applicationVersion: appVersion,
          now: () => new Date(),
          ...(createdUtc.current === undefined ? {} : { createdUtc: createdUtc.current }),
        });

        await platform.writeFile(target, bytes);
        savedDocument.current = store.getState().document;
        setState({ path: target, error: null, savedAt: new Date().toLocaleTimeString() });
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

  const open = useCallback(async () => {
    try {
      const platform = host();
      const target = await platform.showOpenDialog({
        title: 'Open project',
        filters: FILTERS,
      });
      if (target === null) return;

      const loaded = loadProject(await platform.readFile(target));
      store.reset({ project: loaded.project });
      savedDocument.current = store.getState().document;
      createdUtc.current = loaded.manifest.createdUtc;
      setState({ path: target, error: null, savedAt: null });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [host, store]);

  /**
   * Writes a print-ready PDF and opens it in the system viewer.
   *
   * The application deliberately never drives a printer — the user prints
   * from an ordinary viewer — so handing them the open file is where our
   * responsibility ends.
   */
  const exportPdfFile = useCallback(async (): Promise<ExportReadiness | null> => {
    try {
      const platform = host();
      const project = store.getState().document.project;

      const suggested = (project.name || 'Untitled').replace(/\.[^.]+$/, '');
      const target = await platform.showSaveDialog({
        title: 'Export PDF',
        defaultPath: `${suggested}.pdf`,
        filters: PDF_FILTERS,
      });
      if (target === null) return null;

      const scene = buildExportScene(evaluate(project), project.name);
      const { bytes, pagination } = await exportPdf(scene, {
        // The project's own paper, not the exporter's fallback. Until this
        // existed, `DEFAULT_PAGE_SETUP` applied to every export ever made and
        // nobody could print on A3.
        setup: pageSetupFor(project.settings),
        applicationVersion: appVersion,
        now: () => new Date(),
      });

      await platform.writeFile(target.endsWith('.pdf') ? target : `${target}.pdf`, bytes);

      // Oversized parts are reported, never scaled down or clipped. Silently
      // shrinking a template is the one failure this application exists to
      // prevent.
      const problems = pagination.oversized.map(describeOversized);
      setState((previous) => ({
        ...previous,
        error: problems.length === 0 ? null : problems.join(' '),
        savedAt: new Date().toLocaleTimeString(),
      }));

      await platform.openInExternalViewer(target.endsWith('.pdf') ? target : `${target}.pdf`);

      // Read from the project that was just exported, and reported *after* the
      // file is written: export warns, and never blocks (§5).
      const readiness = exportReadiness(project);
      const quiet =
        readiness.omitted.length === 0 &&
        readiness.errors === 0 &&
        readiness.warnings === 0 &&
        readiness.infos === 0;
      return quiet ? null : readiness;
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
    newProject,
    adoptRecovered,
    isDirty,
    exportPdfFile,
    markSaved,
    savedDocument,
  };
}
