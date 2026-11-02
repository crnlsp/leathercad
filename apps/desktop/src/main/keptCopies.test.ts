import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KeptCopies } from './keptCopies.js';

/** Unsaved work kept as the window closes (8.12), against a real folder. */

let dir: string;
const WALLET = '01JB5M00000000000000WALLET';
const BELT = '01JB5M000000000000000BELT0';
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), 'leathercad-kept-')), 'unsaved');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('kept copies', () => {
  it('writes a tab’s copy whole, and reads it back', async () => {
    const kept = new KeptCopies(dir);
    await kept.write(WALLET, bytes('the wallet'));
    expect(new TextDecoder().decode((await kept.read(WALLET))!)).toBe('the wallet');
    expect(kept.wrote(WALLET)).toBe(true);
    expect(kept.wrote(BELT)).toBe(false);
  });

  it('knows only the copies this session wrote, not one left on disk', async () => {
    await new KeptCopies(dir).write(WALLET, bytes('last time'));
    const next = new KeptCopies(dir);
    expect(next.wrote(WALLET)).toBe(false);
    expect(await next.read(WALLET)).not.toBeNull();
  });

  it('removes the copies a session no longer names, and nothing else', async () => {
    const kept = new KeptCopies(dir);
    await kept.write(WALLET, bytes('the wallet'));
    await kept.write(BELT, bytes('the belt'));
    writeFileSync(join(dir, 'notes.txt'), 'not a copy');
    await kept.keepOnly(new Set([BELT]));
    expect(readdirSync(dir).sort()).toEqual([`${BELT}.lcp`, 'notes.txt']);
  });

  it('refuses a tab that is not a ULID: a tab never names a path', async () => {
    const kept = new KeptCopies(dir);
    await expect(kept.write('../../project', bytes('x'))).rejects.toThrow();
    expect(await kept.read('../../project')).toBeNull();
    expect(existsSync(dir)).toBe(false);
  });
});
