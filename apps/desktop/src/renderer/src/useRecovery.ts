import { ResourceLimitError } from '@leathercad/core';
import type { Project } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useEffect, useRef, useState } from 'react';

import { encodeProject } from './lcpEncoder.js';
import type { ProjectTab, ProjectTabs } from './projectTabs.js';
import { RecoveryCopies } from './recoveryCopies.js';

/** A copy a crashed session left, loaded and ready to offer. */
export interface RecoveryOffer {
  readonly id: string;
  readonly savedAt: string;
  readonly project: Project | null;
}

/** How many unloadable copies startup will set aside before it stops looking. */
const MAX_CORRUPT = 10;

/**
 * Crash recovery in the renderer (slice 5.3b), a copy per tab since 8.12.
 *
 * - **Writing.** While a tab has unsaved work, at most once an interval — a
 *   minute — its project is written to that tab's recovery copy: never during
 *   a drag, and not again until it changes. Every tab, not only the one in
 *   front: a crash takes them all. The copy is made off the window's thread
 *   (`RecoveryCopies`, PERF-009); the main process owns the files and writes
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
}): {
  error: unknown;
  offer: RecoveryOffer | null;
  recover: () => Promise<void>;
  decline: () => Promise<void>;
} {
  const [error, setError] = useState<unknown>(null);
  const [offer, setOffer] = useState<RecoveryOffer | null>(null);
  // Each tab's document last written to its copy, so an unchanged project is
  // not written again, and the copies that exist are known.
  const [copies] = useState(() => new RecoveryCopies(host, encodeProject, () => new Date()));

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
        } catch (error) {
          if (error instanceof ResourceLimitError) {
            // Valid work beyond this build's capacity is not a corrupt file.
            setError(error);
            setOffer({ id: found.id, savedAt: found.savedAt, project: null });
            return;
          }
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
              if (copies.due(tab)) void copies.write(tab, appVersion).catch(() => undefined);
            }
          }, intervalMs);
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [appVersion, copies, host, tabs]);

  // A tab clean again, or closed: nothing of it to recover.
  useEffect(() => {
    copies.clearSettled(openTabs);
  }, [copies, openTabs, revision]);

  const recover = useCallback(async () => {
    if (offer === null || offer.project === null) return;
    let tab: ProjectTab;
    try {
      tab = adoptRecovered(offer.project);
    } catch (error) {
      // A resource refusal keeps both the offer and its only copy on disk.
      setError(error);
      return;
    }
    setError(null);
    setOffer(null);
    // The tab's own copy first, and only then is the old one let go (at a
    // clean exit): at every moment there is at least one copy on disk. Both
    // asked for at once, once the copy is made — the main process takes them
    // in that order — so a quit straight after recovering finds the old one
    // taken over, not left for the next start to offer again.
    await copies
      .write(tab, appVersion, () =>
        host()
          .resolveRecovery(offer.id, 'adopt')
          .catch(() => undefined),
      )
      .catch(() => undefined);
    // A crash with several tabs open left a copy of each: the next.
    await findNext();
  }, [adoptRecovered, appVersion, copies, findNext, host, offer]);

  const decline = useCallback(async () => {
    if (offer === null) return;
    setError(null);
    setOffer(null);
    // Dismissing a refused recovery keeps its file even through a clean exit:
    // this build has not made a usable replacement copy of it.
    if (offer.project === null || error instanceof ResourceLimitError) return;
    // Kept on disk until this session exits cleanly — never deleted on the spot.
    await host()
      .resolveRecovery(offer.id, 'adopt')
      .catch(() => undefined);
    await findNext();
  }, [error, findNext, host, offer]);

  return { error, offer, recover, decline };
}
