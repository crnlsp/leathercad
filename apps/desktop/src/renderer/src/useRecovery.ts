import type { Project } from '@leathercad/domain';
import { loadProject, saveProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isDirty, type ProjectTab, type ProjectTabs } from './projectTabs.js';

/** A copy a crashed session left, loaded and ready to offer. */
export interface RecoveryOffer {
  readonly id: string;
  readonly savedAt: string;
  readonly project: Project;
}

/** How many unloadable copies startup will set aside before it stops looking. */
const MAX_CORRUPT = 10;

/**
 * Crash recovery in the renderer (slice 5.3b), a copy per tab since 8.12.
 *
 * - **Writing.** While a tab has unsaved work, at most once an interval — a
 *   minute — its project is written to that tab's recovery copy: never during
 *   a drag, and not again until it changes. Every tab, not only the one in
 *   front: a crash takes them all. The main process owns the files and writes
 *   them atomically.
 * - **Clearing.** When a tab is clean again — saved, reloaded — or closed, its
 *   copy goes: there is nothing of it to recover.
 * - **Offering.** At startup, the copies a crashed session left are offered
 *   one at a time, newest first, each loaded with `loadProject` exactly as a
 *   file is and recovered into a tab of its own. One that does not load is
 *   set aside, never fatal, and the next is tried.
 *
 * The file this recovers is never written: a recovered project opens untitled.
 */
export function useRecovery({
  tabs,
  openTabs,
  revision,
  host,
  appVersion,
  adoptRecovered,
}: {
  tabs: ProjectTabs;
  /** The open tabs, as the window last read them: a change looks at the copies again. */
  openTabs: readonly ProjectTab[];
  /** Changes as the active tab's document does, so a tab saved or undone clean is seen. */
  revision: unknown;
  host: () => PlatformHost;
  appVersion: string;
  /** Opens the recovered project in a tab of its own (8.12), and gives the tab back. */
  adoptRecovered: (project: Project) => ProjectTab;
}): { offer: RecoveryOffer | null; recover: () => Promise<void>; decline: () => Promise<void> } {
  const [offer, setOffer] = useState<RecoveryOffer | null>(null);
  // Each tab's document last written to its copy, so an unchanged project is
  // not written again, and the copies that exist are known.
  const written = useRef(new Map<string, unknown>());

  const copyOf = useCallback(
    (project: Project) =>
      saveProject(project, { applicationVersion: appVersion, now: () => new Date() }),
    [appVersion],
  );

  /** The next copy a crash left, loaded; one that does not load is set aside. */
  const findNext = useCallback(async () => {
    try {
      for (let attempt = 0; attempt < MAX_CORRUPT; attempt++) {
        const found = await host().findRecovery();
        if (found === null) return;
        try {
          const { project } = loadProject(found.data);
          setOffer({ id: found.id, savedAt: found.savedAt, project });
          return;
        } catch {
          // Incomplete or damaged: set aside, never trusted, never fatal.
          await host().resolveRecovery(found.id, 'corrupt');
        }
      }
    } catch {
      // No recovery at all is better than a startup that fails over it.
    }
  }, [host]);

  // Startup: what did a crash leave?
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current) return;
    looked.current = true;
    void findNext();
  }, [findNext]);

  /** Writes a tab's copy, and remembers the document it holds. */
  const writeCopy = useCallback(
    async (tab: ProjectTab) => {
      const { document } = tab.store.getState();
      await host().writeRecovery(tab.id, copyOf(document.project));
      written.current.set(tab.id, document);
    },
    [copyOf, host],
  );

  // While any tab is dirty: its copy, at most once an interval.
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    void host()
      .getRecoveryIntervalMs()
      .then(
        (intervalMs) => {
          if (cancelled) return;
          timer = window.setInterval(() => {
            for (const tab of tabs.tabs) {
              const { document, inTransaction } = tab.store.getState();
              if (!isDirty(tab) || inTransaction) continue;
              if (written.current.get(tab.id) === document) continue;
              void writeCopy(tab).catch(() => undefined);
            }
          }, intervalMs);
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [host, tabs, writeCopy]);

  // A tab clean again, or closed: nothing of it to recover.
  useEffect(() => {
    for (const id of [...written.current.keys()]) {
      const tab = openTabs.find((each) => each.id === id);
      if (tab !== undefined && isDirty(tab)) continue;
      written.current.delete(id);
      void host()
        .clearRecovery(id)
        .catch(() => undefined);
    }
  }, [host, openTabs, revision]);

  const recover = useCallback(async () => {
    if (offer === null) return;
    const tab = adoptRecovered(offer.project);
    setOffer(null);
    // The tab's own copy first, and only then is the old one let go (at a
    // clean exit): at every moment there is at least one copy on disk.
    await writeCopy(tab).catch(() => undefined);
    await host()
      .resolveRecovery(offer.id, 'adopt')
      .catch(() => undefined);
    // A crash with several tabs open left a copy of each: the next.
    await findNext();
  }, [adoptRecovered, findNext, host, offer, writeCopy]);

  const decline = useCallback(async () => {
    if (offer === null) return;
    setOffer(null);
    // Kept on disk until this session exits cleanly — never deleted on the spot.
    await host()
      .resolveRecovery(offer.id, 'adopt')
      .catch(() => undefined);
    await findNext();
  }, [findNext, host, offer]);

  return { offer, recover, decline };
}
