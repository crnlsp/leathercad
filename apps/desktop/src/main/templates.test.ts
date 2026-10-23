import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Templates } from './templates.js';

/** Project templates (8.12): the built-in ones and the maker's own, on real files. */

let root: string;
let mine: string;
let wallet: string;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array | null): string | null =>
  data === null ? null : new TextDecoder().decode(data);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'leathercad-templates-'));
  mine = join(root, 'templates');
  wallet = join(root, 'bifold-wallet.lcp');
  writeFileSync(wallet, 'the wallet');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('templates', () => {
  it('lists the built-in ones, then the maker’s by name', async () => {
    const templates = new Templates({ 'bifold-wallet': wallet }, mine);
    await templates.save('Watch strap', bytes('strap'), false);
    await templates.save('Belt', bytes('belt'), false);
    expect((await templates.list()).map((entry) => entry.id)).toEqual([
      'builtin:bifold-wallet',
      'mine:Belt',
      'mine:Watch strap',
    ]);
    expect(text(await templates.read('builtin:bifold-wallet'))).toBe('the wallet');
    expect(text(await templates.read('mine:Belt'))).toBe('belt');
  });

  it('never saves over one of the same name unless asked to replace it', async () => {
    const templates = new Templates({}, mine);
    await templates.save('Belt', bytes('first'), false);
    expect(await templates.save('Belt', bytes('second'), false)).toEqual({
      kind: 'exists',
      name: 'Belt',
    });
    expect(readFileSync(join(mine, 'Belt.lcp'), 'utf8')).toBe('first');
    expect(await templates.save('Belt', bytes('second'), true)).toEqual({
      kind: 'saved',
      name: 'Belt',
    });
    expect(readFileSync(join(mine, 'Belt.lcp'), 'utf8')).toBe('second');
  });

  it('names nothing outside its folder: a name is a file name, an id is a template', async () => {
    const templates = new Templates({ 'bifold-wallet': wallet }, mine);
    expect(await templates.save('../escape', bytes('x'), false)).toEqual({ kind: 'invalid' });
    expect(await templates.read('mine:../bifold-wallet')).toBeNull();
    expect(await templates.read(wallet)).toBeNull();
    expect(await templates.read('builtin:unknown')).toBeNull();
  });

  it('removes one of the maker’s, never a built-in one', async () => {
    const templates = new Templates({ 'bifold-wallet': wallet }, mine);
    await templates.save('Belt', bytes('belt'), false);
    await templates.remove('mine:Belt');
    await templates.remove('builtin:bifold-wallet');
    expect(existsSync(join(mine, 'Belt.lcp'))).toBe(false);
    expect(existsSync(wallet)).toBe(true);
  });
});
