import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RecoveryStore } from './recovery.js';

/**
 * Crash recovery's file handling (slice 5.3b), against a real directory.
 *
 * Every rule here is about not losing, and not overwriting, someone's work:
 * a copy is whole or absent, a live session is never touched, a corrupt copy
 * is set aside rather than trusted, and nothing is deleted before its time.
 */

let dir: string;
const alive = new Set<number>();
const isAlive = (pid: number): boolean => alive.has(pid);
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const files = (): string[] => readdirSync(dir).sort();

function session(pid: number, startedAt = 1000): RecoveryStore {
  alive.add(pid);
  return new RecoveryStore(dir, { pid, startedAt }, isAlive);
}

/** Ends a session the way a crash does: the process is gone, its file stays. */
function crash(pid: number): void {
  alive.delete(pid);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-recovery-'));
  alive.clear();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writing a copy', () => {
  it('writes the whole copy under the session’s own name, with nothing left over', async () => {
    const store = session(101);
    await store.write(bytes('first'));
    await store.write(bytes('second'));

    expect(files()).toEqual(['101-1000.lcp']);
    expect(readFileSync(join(dir, '101-1000.lcp'), 'utf8')).toBe('second');
  });

  it('creates the directory it needs', async () => {
    const nested = join(dir, 'state', 'recovery');
    const store = new RecoveryStore(nested, { pid: 7, startedAt: 1 }, () => true);
    await store.write(bytes('x'));
    expect(readdirSync(nested)).toEqual(['7-1.lcp']);
  });

  it('clears only its own copy', async () => {
    const mine = session(101);
    const theirs = session(202);
    await mine.write(bytes('mine'));
    await theirs.write(bytes('theirs'));

    await mine.clear();
    await mine.clear(); // clearing twice is not an error
    expect(files()).toEqual(['202-1000.lcp']);
  });
});

describe('finding what a crash left behind', () => {
  it('offers nothing when there is nothing', async () => {
    expect(await session(1).findAbandoned()).toBeNull();
  });

  it('never offers a copy whose session is still running, nor its own', async () => {
    const other = session(202);
    await other.write(bytes('still working'));
    const me = session(101);
    await me.write(bytes('mine'));

    expect(await me.findAbandoned()).toBeNull();
  });

  it('offers a crashed session’s copy, the newest first', async () => {
    const older = session(301, 1);
    await older.write(bytes('older'));
    const newer = session(302, 2);
    await newer.write(bytes('newer'));
    crash(301);
    crash(302);
    utimesSync(join(dir, '301-1.lcp'), new Date(1_000_000), new Date(1_000_000));
    utimesSync(join(dir, '302-2.lcp'), new Date(2_000_000), new Date(2_000_000));

    const found = await session(101).findAbandoned();
    expect(found?.id).toBe('302-2');
    expect(new TextDecoder().decode(found!.data)).toBe('newer');
    expect(found?.savedAt).toBe(new Date(2_000_000).toISOString());
  });

  it('survives a crash in the middle of a write: the last whole copy is what is found', async () => {
    const crashed = session(401);
    await crashed.write(bytes('whole'));
    // The process died between writing the temporary file and renaming it.
    writeFileSync(join(dir, '401-1000.lcp.abc123.tmp'), 'half a zi');
    crash(401);

    const me = session(101);
    const found = await me.findAbandoned();
    expect(new TextDecoder().decode(found!.data)).toBe('whole');
    // The dead session's scrap is swept; nothing ever reads it.
    expect(files()).toEqual(['401-1000.lcp']);
  });

  it('leaves a live session’s temporary file alone — it may be mid-write', async () => {
    session(501);
    writeFileSync(join(dir, '501-1000.lcp.def456.tmp'), 'being written');
    await session(101).findAbandoned();
    expect(files()).toContain('501-1000.lcp.def456.tmp');
  });

  it('ignores files that are not recovery copies', async () => {
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    writeFileSync(join(dir, 'project.lcp'), 'a project somebody put here');
    expect(await session(101).findAbandoned()).toBeNull();
    expect(files()).toEqual(['notes.txt', 'project.lcp']);
  });
});

describe('answering the offer', () => {
  it('keeps a copy the maker declined, and lets it go only at a clean exit', async () => {
    const crashed = session(601);
    await crashed.write(bytes('declined'));
    crash(601);

    const me = session(101);
    const found = await me.findAbandoned();
    await me.adopt(found!.id);
    // Not offered twice in the same session, and still on disk.
    expect(await me.findAbandoned()).toBeNull();
    expect(files()).toEqual(['601-1000.lcp']);

    me.releaseOnQuit();
    expect(files()).toEqual([]);
  });

  it('sets a corrupt copy aside instead of offering it again or deleting it', async () => {
    const crashed = session(701);
    await crashed.write(bytes('not a zip at all'));
    crash(701);

    const me = session(101);
    const found = await me.findAbandoned();
    await me.markCorrupt(found!.id);

    expect(files()).toEqual(['701-1000.lcp.corrupt']);
    expect(await me.findAbandoned()).toBeNull();
  });

  it('refuses to act on anything but a recovery copy’s id', async () => {
    const me = session(101);
    await expect(me.adopt('../project')).rejects.toThrow();
    await expect(me.markCorrupt('/etc/passwd')).rejects.toThrow();
  });
});

describe('a clean exit', () => {
  it('removes this session’s copy and the ones it took over, and nobody else’s', async () => {
    const other = session(202);
    await other.write(bytes('theirs'));
    const me = session(101);
    await me.write(bytes('mine'));

    me.releaseOnQuit();
    expect(files()).toEqual(['202-1000.lcp']);
  });

  it('keeps everything when told the window crashed, so the next start can offer it', async () => {
    const me = session(101);
    await me.write(bytes('mine'));
    me.keepOnQuit();
    me.releaseOnQuit();
    expect(files()).toEqual(['101-1000.lcp']);
    expect(statSync(join(dir, '101-1000.lcp')).size).toBeGreaterThan(0);
  });
});
