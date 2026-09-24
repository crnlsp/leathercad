import type { DocumentStore } from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import { loadProject, saveProject } from '@leathercad/persist';
import type { PlatformHost } from '@leathercad/platform';
import { useCallback, useEffect, useRef, useState } from 'react';

/** A copy a crashed session left, loaded and ready to offer. */
export interface RecoveryOffer {
  readonly id: string;
  readonly savedAt: string;
  readonly project: Project;
}

/** How many unloadable copies startup will set aside before it stops looking. */
const MAX_CORRUPT = 10;

/**
 * Crash recovery in the renderer (slice 5.3b).
 *
 * - **Writing.** While there is unsaved work, at most once an interval — a
 *   minute — the project is written to this session's recovery copy: never
 *   during a drag, and not again until it changes. The main process owns the
 *   file and writes it atomically.
 * - **Clearing.** When the project is clean again — saved, new, opened — the
 *   copy goes: a clean project has nothing to recover.
 * - **Offering.** At startup, the newest copy a crashed session left is loaded
 *   with `loadProject`, exactly as a file is. One that does not load is set
 *   aside, never fatal, and the next is tried.
 *
 * The file this recovers is never written: a recovered project opens untitled.
 */
export function useRecovery({
  store,
  host,
  appVersion,
  isDirty,
  dirty,
  adoptRecovered,
}: {
  store: DocumentStore;
  host: () => PlatformHost;
  appVersion: string;
  isDirty: () => boolean;
  /** The same as `isDirty()`, as React state, so clearing follows it. */
  dirty: boolean;
  adoptRecovered: (project: Project) => void;
}): { offer: RecoveryOffer | null; recover: () => Promise<void>; decline: () => Promise<void> } {
  const [offer, setOffer] = useState<RecoveryOffer | null>(null);
  // The document last written, so an unchanged project is not written again.
  const lastWritten = useRef<unknown>(null);

  const copyOf = useCallback(
    (project: Project) =>
      saveProject(project, { applicationVersion: appVersion, now: () => new Date() }),
    [appVersion],
  );

  // Startup: what did a crash leave?
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        for (let attempt = 0; attempt < MAX_CORRUPT; attempt++) {
          const found = await host().findRecovery();
          if (found === null || cancelled) return;
          try {
            const { project } = loadProject(found.data);
            if (!cancelled) setOffer({ id: found.id, savedAt: found.savedAt, project });
            return;
          } catch {
            // Incomplete or damaged: set aside, never trusted, never fatal.
            await host().resolveRecovery(found.id, 'corrupt');
          }
        }
      } catch {
        // No recovery at all is better than a startup that fails over it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [host]);

  // While dirty: a copy at most once an interval.
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    void host()
      .getRecoveryIntervalMs()
      .then(
        (intervalMs) => {
          if (cancelled) return;
          timer = window.setInterval(() => {
            const { document, inTransaction } = store.getState();
            if (!isDirty() || inTransaction || document === lastWritten.current) return;
            void host()
              .writeRecovery(copyOf(document.project))
              .then(
                () => {
                  lastWritten.current = document;
                },
                () => undefined,
              );
          }, intervalMs);
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [copyOf, host, isDirty, store]);

  // Clean again: nothing to recover.
  useEffect(() => {
    if (dirty) return;
    lastWritten.current = null;
    void host()
      .clearRecovery()
      .catch(() => undefined);
  }, [dirty, host]);

  const recover = useCallback(async () => {
    if (offer === null) return;
    adoptRecovered(offer.project);
    setOffer(null);
    // This session's own copy first, and only then is the old one let go (at a
    // clean exit): at every moment there is at least one copy on disk.
    const { document } = store.getState();
    await host()
      .writeRecovery(copyOf(document.project))
      .then(() => {
        lastWritten.current = document;
      })
      .catch(() => undefined);
    await host()
      .resolveRecovery(offer.id, 'adopt')
      .catch(() => undefined);
  }, [adoptRecovered, copyOf, host, offer, store]);

  const decline = useCallback(async () => {
    if (offer === null) return;
    setOffer(null);
    // Kept on disk until this session exits cleanly — never deleted on the spot.
    await host()
      .resolveRecovery(offer.id, 'adopt')
      .catch(() => undefined);
  }, [host, offer]);

  return { offer, recover, decline };
}
