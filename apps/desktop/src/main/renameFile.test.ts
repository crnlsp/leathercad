import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { projectFileName, renameProjectFile } from './renameFile.js';

/**
 * Renaming a project renames its file (8.12) — never over another one. Run
 * on real files, as the recovery store's tests are.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-rename-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function aProject(name: string, content = name): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe('the file name a project name gives', () => {
  it('is the name, trimmed, with the project extension', () => {
    expect(projectFileName('  Wallet v1.2 ')).toBe('Wallet v1.2.lcp');
    expect(projectFileName('Portfel na karty')).toBe('Portfel na karty.lcp');
  });

  it('is none for a name no file can have, by Windows’ rules everywhere', () => {
    for (const name of ['', '  ', '.', '..', 'a/b', 'a\\b', 'Belt: brown', 'why?', 'tab\there']) {
      expect(projectFileName(name), name).toBeNull();
    }
    for (const name of ['CON', 'nul', 'Com1', 'LPT9.old', 'Wallet.', 'Wallet ', 'x'.repeat(201)]) {
      expect(projectFileName(name), name).toBeNull();
    }
  });
});

describe('renaming a project’s file', () => {
  it('moves it to the new name, in the same folder, with its contents', async () => {
    const from = aProject('Belt.lcp', 'the belt');
    const outcome = await renameProjectFile(from, 'Watch strap');
    expect(outcome).toEqual({ kind: 'renamed', path: join(dir, 'Watch strap.lcp') });
    expect(existsSync(from)).toBe(false);
    expect(readFileSync(join(dir, 'Watch strap.lcp'), 'utf8')).toBe('the belt');
  });

  it('never replaces another file of that name: both stay as they were', async () => {
    const from = aProject('Belt.lcp', 'the belt');
    aProject('Wallet.lcp', 'the wallet');
    expect(await renameProjectFile(from, 'Wallet')).toEqual({ kind: 'exists', file: 'Wallet.lcp' });
    expect(readFileSync(from, 'utf8')).toBe('the belt');
    expect(readFileSync(join(dir, 'Wallet.lcp'), 'utf8')).toBe('the wallet');
  });

  it('touches nothing for a name no file can have', async () => {
    const from = aProject('Belt.lcp');
    expect(await renameProjectFile(from, 'Belt/../../etc')).toEqual({ kind: 'invalid' });
    expect(existsSync(from)).toBe(true);
  });

  it('has nothing to do for the name it has', async () => {
    const from = aProject('Belt.lcp');
    expect(await renameProjectFile(from, ' Belt ')).toEqual({ kind: 'unchanged', path: from });
  });

  it('changes the case alone', async () => {
    const from = aProject('belt.lcp', 'the belt');
    const outcome = await renameProjectFile(from, 'Belt');
    expect(outcome).toEqual({ kind: 'renamed', path: join(dir, 'Belt.lcp') });
    expect(readFileSync(join(dir, 'Belt.lcp'), 'utf8')).toBe('the belt');
  });
});
