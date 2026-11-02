import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What reached the disk-facing calls, in order: `sync file`, `rename`, `sync directory`. */
const calls: string[] = [];

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    rename: (...args: Parameters<typeof actual.rename>) => {
      calls.push('rename');
      return actual.rename(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const isDirectory = (await handle.stat()).isDirectory();
      const sync = handle.sync.bind(handle);
      handle.sync = () => {
        calls.push(isDirectory ? 'sync directory' : 'sync file');
        return sync();
      };
      return handle;
    },
  };
});

import { writeFileAtomic } from './atomicWrite.js';

/** A project is hours of someone's work (Q35): flushed, written through links, permissions kept. */

let dir: string;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (path: string): string => readFileSync(path, 'utf8');
const posix = process.platform === 'win32' ? it.skip : it;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-atomic-'));
  calls.length = 0;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('writes a new file, in a folder that does not exist yet, and leaves no scrap', async () => {
    const path = join(dir, 'a', 'b', 'Wallet.lcp');
    await writeFileAtomic(path, bytes('one'));
    expect(text(path)).toBe('one');
    expect(readdirSync(join(dir, 'a', 'b'))).toEqual(['Wallet.lcp']);
  });

  it('replaces what was there', async () => {
    const path = join(dir, 'Wallet.lcp');
    writeFileSync(path, 'old');
    await writeFileAtomic(path, bytes('new'));
    expect(text(path)).toBe('new');
  });

  it('flushes the file before the rename, and the folder after it where a folder can be flushed', async () => {
    await writeFileAtomic(join(dir, 'Wallet.lcp'), bytes('one'));
    expect(calls).toEqual(
      process.platform === 'win32'
        ? ['sync file', 'rename']
        : ['sync file', 'rename', 'sync directory'],
    );
  });

  posix('writes through a symbolic link to its target, which stays a link', async () => {
    const real = join(dir, 'real');
    mkdirSync(real);
    const target = join(real, 'Wallet.lcp');
    writeFileSync(target, 'old');
    const link = join(dir, 'Wallet.lcp');
    symlinkSync(target, link);

    await writeFileAtomic(link, bytes('new'));

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(text(target)).toBe('new');
    expect(readdirSync(real)).toEqual(['Wallet.lcp']);
  });

  posix('writes through a link whose target is not there yet', async () => {
    const target = join(dir, 'Wallet.lcp');
    const link = join(dir, 'Link.lcp');
    symlinkSync('Wallet.lcp', link);

    await writeFileAtomic(link, bytes('new'));

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(text(target)).toBe('new');
  });

  posix('keeps the permissions the file had', async () => {
    const path = join(dir, 'Wallet.lcp');
    writeFileSync(path, 'old');
    chmodSync(path, 0o640);
    await writeFileAtomic(path, bytes('new'));
    expect(statSync(path).mode & 0o777).toBe(0o640);
  });

  it('leaves the previous file whole, removes its scrap and tells the caller when the write fails', async () => {
    const path = join(dir, 'Wallet.lcp');
    mkdirSync(path); // a folder where the file should go: the rename cannot succeed
    writeFileSync(join(path, 'inside'), 'kept');

    await expect(writeFileAtomic(path, bytes('new'))).rejects.toThrow();

    expect(text(join(path, 'inside'))).toBe('kept');
    expect(readdirSync(dir)).toEqual(['Wallet.lcp']);
    expect(existsSync(path)).toBe(true);
  });
});
