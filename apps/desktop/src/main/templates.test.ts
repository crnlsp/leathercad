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

describe('managing templates (8.14)', () => {
  it('renames one of the maker’s, never over another, and what is kept about it follows', async () => {
    const templates = new Templates({}, mine);
    await templates.save('Belt', bytes('belt'), false);
    await templates.save('Strap', bytes('strap'), false);
    await templates.describe('mine:Belt', 'Brown, 38 mm', ['belts']);
    expect(await templates.rename('mine:Belt', 'Strap')).toEqual({ kind: 'exists', name: 'Strap' });
    expect(await templates.rename('mine:Belt', 'Belt 38')).toEqual({
      kind: 'saved',
      name: 'Belt 38',
    });
    const renamed = (await templates.list()).find((entry) => entry.id === 'mine:Belt 38');
    expect(renamed).toMatchObject({ description: 'Brown, 38 mm', tags: ['belts'] });
    expect(await templates.rename('builtin:x', 'Anything')).toEqual({ kind: 'invalid' });
  });

  it('duplicates any template under the first free name, its words along, not its pin', async () => {
    const templates = new Templates({ 'bifold-wallet': wallet }, mine);
    expect(await templates.duplicate('builtin:bifold-wallet', 'Bifold wallet')).toEqual({
      kind: 'saved',
      name: 'Bifold wallet',
    });
    await templates.describe('mine:Bifold wallet', 'Mine now', ['wallets']);
    await templates.pin('mine:Bifold wallet', true);
    expect(await templates.duplicate('mine:Bifold wallet', 'Bifold wallet')).toEqual({
      kind: 'saved',
      name: 'Bifold wallet 2',
    });
    const copy = (await templates.list()).find((entry) => entry.id === 'mine:Bifold wallet 2');
    expect(copy).toMatchObject({ description: 'Mine now', tags: ['wallets'], pinned: false });
    expect(text(await templates.read('mine:Bifold wallet 2'))).toBe('the wallet');
  });

  it('imports a file under its own name, and exports a template to one', async () => {
    const templates = new Templates({ 'bifold-wallet': wallet }, mine);
    const outside = join(root, 'Watch strap.lcp');
    writeFileSync(outside, 'a strap');
    expect(await templates.importFrom(outside)).toEqual({ kind: 'saved', name: 'Watch strap' });
    const shared = join(root, 'shared.lcp');
    await templates.exportTo('builtin:bifold-wallet', shared);
    expect(readFileSync(shared, 'utf8')).toBe('the wallet');
  });

  it('pins, remembers use, and keeps tidy words; forgets them with the template', async () => {
    let clock = 1000;
    const templates = new Templates({ 'bifold-wallet': wallet }, mine, () => clock);
    await templates.pin('builtin:bifold-wallet', true);
    await templates.used('builtin:bifold-wallet');
    clock = 2000;
    await templates.save('Belt', bytes('belt'), false);
    await templates.describe('mine:Belt', '  Brown  ', [' belts ', 'belts', '', 'leather']);
    await templates.used('mine:Belt');
    const [built, belt] = await templates.list();
    expect(built).toMatchObject({ pinned: true, usedAt: 1000 });
    expect(belt).toMatchObject({ description: 'Brown', tags: ['belts', 'leather'], usedAt: 2000 });
    expect(belt?.created).not.toBeNull();

    await templates.remove('mine:Belt');
    await templates.save('Belt', bytes('belt again'), false);
    expect((await templates.list()).find((entry) => entry.id === 'mine:Belt')).toMatchObject({
      description: '',
      usedAt: null,
    });
  });

  it('gives a file only for one of the maker’s, and never lists its own index', async () => {
    const templates = new Templates({ 'bifold-wallet': wallet }, mine);
    await templates.save('Belt', bytes('belt'), false);
    await templates.pin('mine:Belt', true);
    expect(templates.fileOf('mine:Belt')).toBe(join(mine, 'Belt.lcp'));
    expect(templates.fileOf('builtin:bifold-wallet')).toBeNull();
    expect((await templates.list()).map((entry) => entry.id)).toEqual([
      'builtin:bifold-wallet',
      'mine:Belt',
    ]);
  });
});
