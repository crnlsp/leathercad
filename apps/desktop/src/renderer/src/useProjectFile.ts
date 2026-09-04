import type { DocumentStore } from '@leathercad/document';
import { LCP_EXTENSION, loadProject, saveProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useRef, useState } from 'react';

export interface ProjectFileState {
  readonly path: string | null;
  readonly error: string | null;
  readonly savedAt: string | null;
}

const FILTERS = [{ name: 'LeatherCAD project', extensions: [LCP_EXTENSION] }];

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

  return { state, save, open, markSaved, savedDocument };
}
