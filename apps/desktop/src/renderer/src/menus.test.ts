import { describe, expect, it } from 'vitest';

import { focusAfter, helpMenu, projectMenu, recentParts } from './menus.js';

describe('moving through a menu by keyboard (8.7)', () => {
  it('goes down and up, wrapping at either end, as menus do', () => {
    expect(focusAfter('ArrowDown', 0, 3)).toBe(1);
    expect(focusAfter('ArrowDown', 2, 3)).toBe(0);
    expect(focusAfter('ArrowUp', 0, 3)).toBe(2);
    expect(focusAfter('ArrowUp', 2, 3)).toBe(1);
  });

  it('starts from the first or last item when nothing in the menu has focus', () => {
    expect(focusAfter('ArrowDown', -1, 3)).toBe(0);
    expect(focusAfter('ArrowUp', -1, 3)).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(focusAfter('Home', 2, 3)).toBe(0);
    expect(focusAfter('End', 0, 3)).toBe(2);
  });

  it('leaves every other key, and an empty menu, alone', () => {
    expect(focusAfter('a', 0, 3)).toBe(-1);
    expect(focusAfter('Enter', 1, 3)).toBe(-1);
    expect(focusAfter('ArrowDown', -1, 0)).toBe(-1);
  });
});

describe('a recent project, in two lines (8.7)', () => {
  it('is its name without .lcp, then its folder', () => {
    expect(recentParts('~/Leather/wallets/Bifold wallet.lcp')).toEqual({
      name: 'Bifold wallet',
      folder: '~/Leather/wallets',
    });
  });

  it('reads Windows paths too', () => {
    expect(recentParts('~\\Leather\\Card holder.LCP')).toEqual({
      name: 'Card holder',
      folder: '~\\Leather',
    });
  });

  it('keeps the root when the project is at it', () => {
    expect(recentParts('/Wallet.lcp')).toEqual({ name: 'Wallet', folder: '/' });
  });
});

describe('the Project and Help menus (8.7)', () => {
  const noop = (): void => undefined;
  const actions = { newProject: noop, open: noop, saveAs: noop, openRecent: noop };

  it('puts the actions first and the recent projects after, so the actions stay put', () => {
    const entries = projectMenu(actions, [{ path: '/p/Wallet.lcp', shown: '/p/Wallet.lcp' }]);
    expect(entries.map((entry) => (entry.kind === 'item' ? entry.id : entry.kind))).toEqual([
      'new',
      'open',
      'save-as',
      'separator',
      'group',
    ]);
    const group = entries.at(-1)!;
    expect(group.kind === 'group' && group.items.map((item) => [item.label, item.note])).toEqual([
      ['Wallet', '/p'],
    ]);
  });

  it('opens a recent project by its whole path, not the one shown', () => {
    const opened: string[] = [];
    const entries = projectMenu({ ...actions, openRecent: (path) => opened.push(path) }, [
      { path: '/home/m/Wallet.lcp', shown: '~/Wallet.lcp' },
    ]);
    const group = entries.at(-1)!;
    if (group.kind !== 'group') throw new Error('no recent projects');
    group.items[0]!.onChoose();
    expect(opened).toEqual(['/home/m/Wallet.lcp']);
  });

  it('says what fills the recent list while it is empty', () => {
    const group = projectMenu(actions, []).at(-1)!;
    expect(group.kind === 'group' && group.empty).toBe('Projects you open or save appear here.');
  });

  it('keeps Help to help and the application: no configuration', () => {
    const labels = helpMenu({ openSample: noop, about: noop }).flatMap((entry) =>
      entry.kind === 'item' ? [entry.label] : [],
    );
    expect(labels).toEqual(['Open sample project', 'About LeatherCAD']);
  });
});
