import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from './atomicWrite.js';

/** A tab's id, as the renderer names its kept copy: a ULID, never a path. */
const TAB = /^[0-9A-Z]{26}$/;
/** `<tab>.lcp`: a kept copy, and the only file this store reads or removes. */
const COPY = /^([0-9A-Z]{26})\.lcp$/;

/**
 * The unsaved work kept when the window closes (8.12), with *Keep unsaved
 * projects* on in Settings: one ordinary `.lcp` per tab, in a folder of the
 * app's own, opened again at the next start as unsaved work.
 *
 * Not crash recovery, which is for a session that did not end: this is for one
 * that ended as the maker asked. A copy is written whole or not at all, and
 * only a copy written this session can be named in the session it is kept
 * for. No Electron here; tested on real files.
 */
export class KeptCopies {
  /** The copies written this session: the only ones a session may name. */
  private readonly written = new Set<string>();

  constructor(private readonly directory: string) {}

  async write(tab: string, data: Uint8Array): Promise<void> {
    if (!TAB.test(tab)) throw new Error(`Not a tab: ${tab}`);
    await mkdir(this.directory, { recursive: true });
    await writeFileAtomic(this.pathOf(tab), data);
    this.written.add(tab);
  }

  /** Whether this session wrote the copy: what a kept session may name. */
  wrote(tab: string): boolean {
    return this.written.has(tab);
  }

  /** A kept copy's bytes, or null when there is none. */
  async read(tab: string): Promise<Uint8Array | null> {
    if (!TAB.test(tab)) return null;
    try {
      const data = await readFile(this.pathOf(tab));
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
      return null;
    }
  }

  /** Removes every kept copy but these: what the last session no longer names. */
  async keepOnly(tabs: ReadonlySet<string>): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return;
    }
    for (const name of names) {
      const copy = COPY.exec(name);
      if (copy !== null && !tabs.has(copy[1]!)) {
        await unlink(join(this.directory, name)).catch(() => undefined);
      }
    }
  }

  private pathOf(tab: string): string {
    return join(this.directory, `${tab}.lcp`);
  }
}
