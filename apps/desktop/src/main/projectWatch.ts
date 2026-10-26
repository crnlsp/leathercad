import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

/** What happened to an open project's file outside the app (8.12). */
export type OutsideChange = 'changed' | 'gone';

/** How long a burst of events for one file is let settle: an editor's save is several. */
const SETTLE_MS = 300;

/**
 * Watches the files of the open projects for changes made outside the app
 * (8.12): another editor, a sync client, a file manager moving one away.
 *
 * It watches each file's **folder**, not the file: a program that saves the
 * way this app does — a temporary file renamed over the old one — leaves a
 * watch on the old file looking at nothing. A change is a new modification
 * time, against the one last seen; the app's own writes are told to it
 * (`saw`), so they are never news. No Electron here: the clock, the folder
 * watch and `stat` are Node's, and it is tested on real files.
 */
export class ProjectWatch {
  /** Each watched file's modification time, as last seen — null when it was not there. */
  private readonly known = new Map<string, number | null>();
  private readonly folders = new Map<string, FSWatcher>();
  private readonly settling = new Map<string, NodeJS.Timeout>();

  constructor(private readonly onChange: (path: string, change: OutsideChange) => void) {}

  /** Watches exactly these files from now on; the rest are let go. */
  async watch(paths: readonly string[]): Promise<void> {
    const wanted = new Set(paths);
    for (const path of [...this.known.keys()]) {
      if (!wanted.has(path)) this.known.delete(path);
    }
    for (const path of wanted) {
      if (!this.known.has(path)) this.known.set(path, await modified(path));
    }
    const folders = new Set([...wanted].map((path) => dirname(path)));
    for (const [folder, watcher] of this.folders) {
      if (!folders.has(folder)) {
        watcher.close();
        this.folders.delete(folder);
      }
    }
    for (const folder of folders) {
      if (this.folders.has(folder)) continue;
      try {
        const watcher = watch(folder, (_event, name) => this.heard(folder, name));
        // A folder that goes away ends its watch; its files are then gone.
        watcher.on('error', () => this.forgetFolder(folder));
        this.folders.set(folder, watcher);
      } catch {
        // A folder that cannot be watched — gone already, or a network drive
        // that does not tell — is simply not watched.
      }
    }
  }

  /** The app wrote this file itself: what it holds now is not news. */
  async saw(path: string): Promise<void> {
    if (this.known.has(path)) this.known.set(path, await modified(path));
  }

  /** Stops every watch: the app is quitting. */
  close(): void {
    for (const watcher of this.folders.values()) watcher.close();
    for (const timer of this.settling.values()) clearTimeout(timer);
    this.folders.clear();
    this.settling.clear();
    this.known.clear();
  }

  private heard(folder: string, name: string | Buffer | null): void {
    // Some platforms do not say which file: every watched one there is looked at.
    const paths = [...this.known.keys()].filter(
      (path) => dirname(path) === folder && (name === null || basename(path) === String(name)),
    );
    for (const path of paths) {
      clearTimeout(this.settling.get(path));
      this.settling.set(
        path,
        setTimeout(() => {
          this.settling.delete(path);
          void this.look(path);
        }, SETTLE_MS),
      );
    }
  }

  private forgetFolder(folder: string): void {
    this.folders.get(folder)?.close();
    this.folders.delete(folder);
    for (const path of this.known.keys()) if (dirname(path) === folder) void this.look(path);
  }

  /** Compares the file with what was last seen, and says what changed. */
  async look(path: string): Promise<void> {
    if (!this.known.has(path)) return;
    const before = this.known.get(path) ?? null;
    const now = await modified(path);
    if (now === before || !this.known.has(path)) return;
    this.known.set(path, now);
    if (now === null) this.onChange(path, 'gone');
    else this.onChange(path, 'changed');
  }
}

async function modified(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
