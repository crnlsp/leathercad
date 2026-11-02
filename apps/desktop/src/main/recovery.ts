import { readdirSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from './atomicWrite.js';

/** A copy a crashed session left behind, as found at startup. */
export interface AbandonedCopy {
  /**
   * Its file name, without `.lcp`: the session it came from, `<pid>-<start
   * time>`, and since 8.12 the tab, `-<tab id>`. A copy from 1.5 or earlier,
   * one per session, has no tab.
   */
  readonly id: string;
  /** When it was last written, ISO 8601 — what the offer tells the maker. */
  readonly savedAt: string;
  readonly data: Uint8Array;
}

/**
 * `<pid>-<start>-<tab>.lcp`: a recovery copy, and the only file this store
 * reads. The tab is a ULID (8.12); 1.5 wrote one copy per session, without
 * one, and such a copy is still found.
 */
const COPY = /^(\d+)-(\d+)(?:-[0-9A-Z]{26})?\.lcp$/;
/** A write that has not been renamed into place yet: the copy's name, `.<hex>.tmp`. */
const SCRAP = /^(\d+)-(\d+)(?:-[0-9A-Z]{26})?\.lcp\.[0-9a-f]+\.tmp$/;
const ID = /^\d+-\d+(?:-[0-9A-Z]{26})?$/;
/** A tab's id, as the renderer names its copy: a ULID, never a path. */
const TAB = /^[0-9A-Z]{26}$/;

/**
 * Whether a process is running. Signal 0 checks without sending anything; a
 * process that exists but is not ours (EPERM) is running too.
 */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The recovery copies of crash recovery (slice 5.3b), in one directory.
 *
 * **One file per tab of a session** (8.12), named for the process, the moment
 * it started and the tab, so two copies of the app running at once never
 * overwrite or delete each other's, and each open project has its own. A copy is written atomically — a temporary file renamed into place —
 * so a reader only ever sees a whole one, and a crash mid-write leaves the
 * previous copy intact. A copy whose process is no longer running belongs to a
 * session that did not end cleanly; that is what startup offers.
 *
 * It never reads or writes anything but its own `<pid>-<start>.lcp` files, so
 * it cannot touch a project, wherever that is. No Electron here: the directory,
 * the session and the liveness check are given, so it is tested on real files.
 */
export class RecoveryStore {
  /** This session: `<pid>-<start>`, moved on each time its renderer dies. */
  private id: string;
  /** The tabs this session has written a copy for, since its renderer last died. */
  private readonly tabs = new Set<string>();
  private readonly adopted = new Set<string>();
  /** Copies of this session's own renderers that died: offered, never cleared. */
  private readonly orphaned = new Set<string>();
  /** How many of this session's renderers have died: each next one is named past them. */
  private deaths = 0;
  /** Set by a clean exit: from here on, a copy that lands is removed. */
  private released = false;
  /** This session's writes and clears, one after another in the order asked. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly session: { readonly pid: number; readonly startedAt: number },
    private readonly isAlive: (pid: number) => boolean = processIsAlive,
  ) {
    this.id = `${String(session.pid)}-${String(session.startedAt)}`;
  }

  /**
   * Replaces a tab's copy with `data`, whole or not at all.
   *
   * Writes and clears run **in the order they were asked**. A write is a
   * temporary file and a rename; a clear that ran while one was in flight was
   * undone when the rename landed after it — so a project saved mid-write kept
   * a stale copy, which a later start would offer as newer unsaved work.
   */
  async write(tab: string, data: Uint8Array): Promise<void> {
    this.checkTab(tab);
    // Named when asked: a write the renderer asked for just before it died
    // lands in that renderer's copy, not the next window's.
    this.tabs.add(tab);
    const path = this.pathOf(`${this.id}-${tab}`);
    return this.inOrder(async () => {
      if (this.released) return;
      await writeFileAtomic(path, data);
      // A clean exit released this session while the write was in flight.
      if (this.released) await unlink(path).catch(() => undefined);
    });
  }

  /** Removes a tab's copy: its project is saved, or closed, or clean again. */
  async clear(tab: string): Promise<void> {
    this.checkTab(tab);
    const path = this.pathOf(`${this.id}-${tab}`);
    return this.inOrder(() => unlink(path).catch(() => undefined));
  }

  /** Runs `task` after everything asked before it, whether that succeeded or not. */
  private inOrder(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * The newest copy a crashed session left, or null.
   *
   * Sweeps a dead session's half-written temporary files on the way — they are
   * never read — and leaves a live session's alone, since it may be mid-write.
   * A copy this session has already answered for is not offered again.
   */
  async findAbandoned(): Promise<AbandonedCopy | null> {
    await mkdir(this.directory, { recursive: true });
    const names = await readdir(this.directory);

    for (const name of names) {
      const scrap = SCRAP.exec(name);
      if (scrap !== null && !this.isAlive(Number(scrap[1]))) {
        await unlink(join(this.directory, name)).catch(() => undefined);
      }
    }

    const candidates: { id: string; modified: Date }[] = [];
    for (const name of names) {
      const copy = COPY.exec(name);
      if (copy === null) continue;
      const id = name.slice(0, -'.lcp'.length);
      if (this.isOwn(id) || this.adopted.has(id)) continue;
      if (!this.orphaned.has(id) && this.isAlive(Number(copy[1]))) continue;
      const info = await stat(join(this.directory, name)).catch(() => null);
      if (info !== null) candidates.push({ id, modified: info.mtime });
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    const newest = candidates[0]!;
    const data = await readFile(this.pathOf(newest.id));
    return {
      id: newest.id,
      savedAt: newest.modified.toISOString(),
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  }

  /**
   * Takes over a crashed session's copy: kept on disk, not offered again this
   * session, and deleted at a clean exit. Answering *Not now* — or recovering,
   * once this session has written its own copy — is never an immediate delete.
   */
  async adopt(id: string): Promise<void> {
    this.checkId(id);
    // After the writes asked before it — recovering asks for the tab's own
    // copy and this at once — so one copy of the work is on disk at every
    // moment. Asked by a window that has died since, it goes where that
    // window's adoptions went: to the next window.
    const asker = this.id;
    return this.inOrder(() => {
      (this.id === asker ? this.adopted : this.orphaned).add(id);
      return Promise.resolve();
    });
  }

  /** Resolves once every write, clear and adoption asked for so far has run: what a clean exit waits for. */
  settled(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  /**
   * Sets aside a copy that did not load: renamed to `.corrupt`, so it is never
   * offered again but is kept for anyone who wants to look at it.
   */
  async markCorrupt(id: string): Promise<void> {
    this.checkId(id);
    await rename(this.pathOf(id), `${this.pathOf(id)}.corrupt`).catch(() => undefined);
  }

  /**
   * The window's renderer died, taking its unsaved work with it. The process
   * lives on — to a quit, or on macOS to a new window — so the dead renderer's
   * copy, and any it had taken over, are set aside: offered to the next window
   * though this process lives, never cleared by it, and kept at quit for the
   * next start unless a window takes them over again. The next window writes
   * and clears a copy of its own.
   */
  rendererGone(): void {
    for (const tab of this.tabs) this.orphaned.add(`${this.id}-${tab}`);
    this.tabs.clear();
    for (const id of this.adopted) this.orphaned.add(id);
    this.adopted.clear();
    // A start time no other process of this pid can have: this one is running.
    const next = this.session.startedAt + ++this.deaths;
    this.id = `${String(this.session.pid)}-${String(next)}`;
  }

  /**
   * A clean exit: this session's copy and the ones it took over go. Synchronous,
   * because the process is on its way out; the quit waits for `settled` first,
   * so what the window asked for has landed, and a write asked for after this
   * is removed as it lands.
   */
  releaseOnQuit(): void {
    this.released = true;
    const own = [...this.tabs].map((tab) => `${this.id}-${tab}`);
    for (const id of [...own, ...this.adopted]) {
      try {
        unlinkSync(this.pathOf(id));
      } catch {
        // Already gone, or never written: a clean exit either way.
      }
    }
    this.sweepOwnScraps();
  }

  private sweepOwnScraps(): void {
    try {
      for (const name of readdirSync(this.directory)) {
        if (name.startsWith(`${this.id}-`) && name.endsWith('.tmp')) {
          unlinkSync(join(this.directory, name));
        }
      }
    } catch {
      // No directory: nothing was ever written.
    }
  }

  /** A copy this session is writing: its session part is this one's. Never offered to itself. */
  private isOwn(id: string): boolean {
    return id === this.id || id.startsWith(`${this.id}-`);
  }

  private checkTab(tab: string): void {
    // A tab's id names its copy: never a path, never anything but a ULID.
    if (!TAB.test(tab)) throw new Error(`Not a tab: ${tab}`);
  }

  private checkId(id: string): void {
    // Only a session id names a file here: never a path, never a project.
    if (!ID.test(id)) throw new Error(`Not a recovery copy: ${id}`);
  }

  private pathOf(id: string): string {
    return join(this.directory, `${id}.lcp`);
  }
}
