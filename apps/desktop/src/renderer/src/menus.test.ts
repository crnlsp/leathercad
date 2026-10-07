import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import {
  exportMenu,
  focusAfter,
  helpMenu,
  projectMenu,
  recentParts,
  sharedReasons,
  type MenuEntry,
} from './menus.js';

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
  const { t } = createI18n('en');

  it('puts the actions first and the recent projects after, so the actions stay put', () => {
    const entries = projectMenu(actions, [{ path: '/p/Wallet.lcp', shown: '/p/Wallet.lcp' }], t);
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
    const entries = projectMenu(
      { ...actions, openRecent: (path) => opened.push(path) },
      [{ path: '/home/m/Wallet.lcp', shown: '~/Wallet.lcp' }],
      t,
    );
    const group = entries.at(-1)!;
    if (group.kind !== 'group') throw new Error('no recent projects');
    group.items[0]!.onChoose();
    expect(opened).toEqual(['/home/m/Wallet.lcp']);
  });

  it('says what fills the recent list while it is empty', () => {
    const group = projectMenu(actions, [], t).at(-1)!;
    expect(group.kind === 'group' && group.empty).toBe('Projects you open or save appear here.');
  });

  it('keeps Help to help and the application: no configuration', () => {
    const labels = helpMenu({ openSample: noop, about: noop }, t).flatMap((entry) =>
      entry.kind === 'item' ? [entry.label] : [],
    );
    expect(labels).toEqual(['Open sample project', 'About LeatherCAD']);
  });
});

describe('the export menu (6.2, 6.5)', () => {
  const { t } = createI18n('en');
  const noop = (): void => undefined;
  const items = (entries: MenuEntry[]) =>
    entries.flatMap((entry) => (entry.kind === 'item' ? [entry] : []));

  it('offers SVG and DXF, in millimetres, and says what each is for', () => {
    const [svg, dxf, ...rest] = items(exportMenu({ svg: noop, dxf: noop }, true, t));
    expect(rest).toEqual([]);
    expect([svg!.id, svg!.label, svg!.refusal]).toEqual(['export-svg', 'Export SVG…', undefined]);
    expect([dxf!.id, dxf!.label, dxf!.refusal]).toEqual(['export-dxf', 'Export DXF…', undefined]);
    expect(svg!.note).toContain('Millimetres');
    expect(dxf!.note).toContain('millimetres');
  });

  it('runs the action of the item chosen, and no other', () => {
    const chosen: string[] = [];
    const [svg, dxf] = items(
      exportMenu({ svg: () => chosen.push('svg'), dxf: () => chosen.push('dxf') }, true, t),
    );
    dxf!.onChoose();
    svg!.onChoose();
    expect(chosen).toEqual(['dxf', 'svg']);
  });

  it('stays, and says why, when nothing prints: a menu that drops an item moves the rest', () => {
    const refused = items(exportMenu({ svg: noop, dxf: noop }, false, t));
    expect(refused.map((item) => item.refusal)).toEqual([
      'Nothing to export yet. No part has a line to cut.',
      'Nothing to export yet. No part has a line to cut.',
    ]);
  });
});

describe('a reason several items share (8.8)', () => {
  const noop = (): void => undefined;
  const refused = (id: string, refusal?: string): MenuEntry => ({
    kind: 'item',
    id,
    label: id,
    onChoose: noop,
    refusal,
  });

  it('is said once, under the last of a run, and the others point to it', () => {
    const said = sharedReasons([
      refused('a', 'Locked'),
      refused('b', 'Locked'),
      refused('c', 'Locked'),
      refused('d'),
    ]);
    expect(said).toEqual(
      new Map([
        ['a', 'c'],
        ['b', 'c'],
      ]),
    );
  });

  it('is said again after a separator, or for a different reason', () => {
    const said = sharedReasons([
      refused('a', 'Locked'),
      { kind: 'separator' },
      refused('b', 'Locked'),
      refused('c', 'Empty'),
    ]);
    expect(said.size).toBe(0);
  });
});
