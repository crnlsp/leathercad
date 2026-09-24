import { readdirSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from './atomicWrite.js';

/** A copy a crashed session left behind, as found at startup. */
export interface AbandonedCopy {
  /** The session it came from: `<pid>-<start time>`. Also its file name, without `.lcp`. */
  readonly id: string;
  /** When it was last written, ISO 8601 — what the offer tells the maker. */
  readonly savedAt: string;
  readonly data: Uint8Array;
}

/** `<pid>-<start>.lcp`: a recovery copy, and the only file this store reads. */
const COPY = /^(\d+)-(\d+)\.lcp$/;
/** `<pid>-<start>.lcp.<hex>.tmp`: a write that has not been renamed into place yet. */
const SCRAP = /^(\d+)-(\d+)\.lcp\.[0-9a-f]+\.tmp$/;
const ID = /^\d+-\d+$/;

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
 * **One file per session**, named for the process and the moment it started,
 * so two copies of the app running at once never overwrite or delete each
 * other's. A copy is written atomically — a temporary file renamed into place —
 * so a reader only ever sees a whole one, and a crash mid-write leaves the
 * previous copy intact. A copy whose process is no longer running belongs to a
 * session that did not end cleanly; that is what startup offers.
 *
 * It never reads or writes anything but its own `<pid>-<start>.lcp` files, so
 * it cannot touch a project, wherever that is. No Electron here: the directory,
 * the session and the liveness check are given, so it is tested on real files.
 */
export class RecoveryStore {
  readonly id: string;
  private readonly adopted = new Set<string>();
  private keep = false;

  constructor(
    private readonly directory: string,
    session: { readonly pid: number; readonly startedAt: number },
    private readonly isAlive: (pid: number) => boolean = processIsAlive,
  ) {
    this.id = `${String(session.pid)}-${String(session.startedAt)}`;
  }

  /** Replaces this session's copy with `data`, whole or not at all. */
  async write(data: Uint8Array): Promise<void> {
    await writeFileAtomic(this.pathOf(this.id), data);
  }

  /** Removes this session's copy: the project is saved, or empty, again. */
  async clear(): Promise<void> {
    await unlink(this.pathOf(this.id)).catch(() => undefined);
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
      if (id === this.id || this.adopted.has(id) || this.isAlive(Number(copy[1]))) continue;
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
    this.adopted.add(id);
    await Promise.resolve();
  }

  /**
   * Sets aside a copy that did not load: renamed to `.corrupt`, so it is never
   * offered again but is kept for anyone who wants to look at it.
   */
  async markCorrupt(id: string): Promise<void> {
    this.checkId(id);
    await rename(this.pathOf(id), `${this.pathOf(id)}.corrupt`).catch(() => undefined);
  }

  /** The window crashed: everything stays on disk for the next start to offer. */
  keepOnQuit(): void {
    this.keep = true;
  }

  /**
   * A clean exit: this session's copy and the ones it took over go. Synchronous,
   * because the process is on its way out and will not wait for a promise.
   */
  releaseOnQuit(): void {
    if (this.keep) return;
    for (const id of [this.id, ...this.adopted]) {
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
        if (name.startsWith(`${this.id}.lcp.`) && name.endsWith('.tmp')) {
          unlinkSync(join(this.directory, name));
        }
      }
    } catch {
      // No directory: nothing was ever written.
    }
  }

  private checkId(id: string): void {
    // Only a session id names a file here: never a path, never a project.
    if (!ID.test(id)) throw new Error(`Not a recovery copy: ${id}`);
  }

  private pathOf(id: string): string {
    return join(this.directory, `${id}.lcp`);
  }
}
