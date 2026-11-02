import type { PlatformHost } from '@leathercad/platform';

import type { LcpJob } from './lcpJob.js';
import { isDirty, type ProjectTab } from './projectTabs.js';

/**
 * The recovery copies one window writes, a copy per tab (5.3b, 8.12), each
 * made into bytes off the window's thread (PERF-009).
 *
 * Each tab's document last written, or being written, to its copy is kept, and
 * set before the copy is made — not after it lands — so a save while it is
 * being made finds it to clear. A copy is made one at a time for a tab, and
 * written only if it is still that tab's when it is ready: a tab saved or
 * closed meanwhile has nothing to recover, and a copy written after its clear
 * would be offered after a crash as unsaved work that is in fact on disk. The
 * main process runs writes and clears in the order they are asked.
 */
export class RecoveryCopies {
  private readonly written = new Map<string, unknown>();
  private readonly making = new Set<string>();

  constructor(
    private readonly host: () => PlatformHost,
    private readonly encode: (job: LcpJob) => Promise<Uint8Array>,
    private readonly now: () => Date,
  ) {}

  /**
   * Whether a tab's copy is due: unsaved work, no gesture under way, changed
   * since its copy, and no copy of it being made now.
   */
  due(tab: ProjectTab): boolean {
    const { document, inTransaction } = tab.store.getState();
    return (
      isDirty(tab) &&
      !inTransaction &&
      !this.making.has(tab.id) &&
      this.written.get(tab.id) !== document
    );
  }

  /**
   * Makes a tab's copy of its document as it is now, and asks for it to be
   * written; `alongside`, when given, is asked at the same moment, after the
   * write, whether the copy is written or not.
   */
  async write(
    tab: ProjectTab,
    applicationVersion: string,
    alongside?: () => Promise<void>,
  ): Promise<void> {
    const { document } = tab.store.getState();
    this.written.set(tab.id, document);
    this.making.add(tab.id);

    let bytes: Uint8Array;
    try {
      bytes = await this.encode({
        project: document.project,
        applicationVersion,
        at: this.now().toISOString(),
      });
    } catch (error) {
      this.unwritten(tab, document);
      await alongside?.();
      throw error;
    } finally {
      this.making.delete(tab.id);
    }

    // Saved, reloaded or closed while it was made: not this tab's copy now.
    if (this.written.get(tab.id) !== document) {
      await alongside?.();
      return;
    }
    try {
      await Promise.all([this.host().writeRecovery(tab.id, bytes), alongside?.()]);
    } catch (error) {
      this.unwritten(tab, document);
      throw error;
    }
  }

  /** Forgets, and clears, the copies of tabs clean again or closed: nothing of them to recover. */
  clearSettled(open: readonly ProjectTab[]): void {
    for (const id of [...this.written.keys()]) {
      const tab = open.find((each) => each.id === id);
      if (tab !== undefined && isDirty(tab)) continue;
      this.written.delete(id);
      void this.host()
        .clearRecovery(id)
        .catch(() => undefined);
    }
  }

  /** Not written: written again at the next interval. */
  private unwritten(tab: ProjectTab, document: unknown): void {
    if (this.written.get(tab.id) === document) this.written.set(tab.id, null);
  }
}
