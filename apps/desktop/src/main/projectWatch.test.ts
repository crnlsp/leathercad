import { mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProjectWatch, type OutsideChange } from './projectWatch.js';

/**
 * A project's file changed outside the app (8.12). Judged by `look`, which the
 * folder's watch calls once its events settle — called here directly, so no
 * test waits on the operating system's timing.
 */

let dir: string;
let heard: [string, OutsideChange][];
let watch: ProjectWatch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-watch-'));
  heard = [];
  watch = new ProjectWatch((path, change) => heard.push([path, change]));
});

afterEach(() => {
  watch.close();
  rmSync(dir, { recursive: true, force: true });
});

function aProject(name: string): string {
  const path = join(dir, name);
  writeFileSync(path, 'a project');
  utimesSync(path, new Date(1_000_000), new Date(1_000_000));
  return path;
}

describe('a project changed outside the app', () => {
  it('is news when its modification time moves', async () => {
    const path = aProject('Belt.lcp');
    await watch.watch([path]);
    await watch.look(path);
    expect(heard).toEqual([]);

    utimesSync(path, new Date(2_000_000), new Date(2_000_000));
    await watch.look(path);
    expect(heard).toEqual([[path, 'changed']]);
    // Said once, not again for the same change.
    await watch.look(path);
    expect(heard).toHaveLength(1);
  });

  it('is gone when it is moved away or deleted', async () => {
    const path = aProject('Belt.lcp');
    await watch.watch([path]);
    unlinkSync(path);
    await watch.look(path);
    expect(heard).toEqual([[path, 'gone']]);
  });

  it('is not news when the app wrote it itself', async () => {
    const path = aProject('Belt.lcp');
    await watch.watch([path]);
    utimesSync(path, new Date(3_000_000), new Date(3_000_000));
    await watch.saw(path);
    await watch.look(path);
    expect(heard).toEqual([]);
  });

  it('says nothing about a file no longer watched', async () => {
    const path = aProject('Belt.lcp');
    const other = aProject('Wallet.lcp');
    await watch.watch([path, other]);
    await watch.watch([other]);
    utimesSync(path, new Date(4_000_000), new Date(4_000_000));
    await watch.look(path);
    expect(heard).toEqual([]);
  });
});
