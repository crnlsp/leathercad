import type { DocumentStore } from '@leathercad/document';
import { evaluate, exportReadiness, type ExportReadiness } from '@leathercad/domain';
import { buildExportScene, describeOversized, exportPdf } from '@leathercad/export';
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
): {
  state: ProjectFileState;
  save: (forcePrompt?: boolean) => Promise<void>;
  open: () => Promise<void>;
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
  const savedDocument = useRef<unknown>(null);
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
          if (target === null) return;
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
      } catch (error) {
        setState((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        }));
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

  return { state, save, open, exportPdfFile, markSaved, savedDocument };
}
