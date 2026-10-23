import { DocumentStore, emptyDocument, setProjectName } from '@leathercad/document';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';

import {
  ProjectTabs,
  activeAfterClose,
  cycled,
  isDirty,
  isPristine,
  newTab,
  nextUntitled,
  tabName,
  type ProjectTab,
} from './projectTabs.js';

/**
 * Project tabs (8.12): one window, a project per tab, as in Notepad. The list
 * is never empty, and an untouched *Untitled* gives way to the project opened
 * over it.
 */

let made = 0;
function aTab(name = 'Untitled'): ProjectTab {
  made += 1;
  const id = `tab-${String(made)}`;
  return newTab(id, new DocumentStore(emptyDocument(`project-${id}`, name)));
}

/** A tab whose project has been changed since it was opened. */
function anEditedTab(): ProjectTab {
  const tab = aTab();
  tab.store.dispatch(setProjectName('Wallet'));
  return tab;
}

function tabsOf(...tabs: ProjectTab[]): ProjectTabs {
  const list = new ProjectTabs(tabs[0]!);
  for (const tab of tabs.slice(1)) list.open(tab);
  return list;
}

describe('a tab', () => {
  it('starts saved: an untouched project has nothing to lose', () => {
    expect(isDirty(aTab())).toBe(false);
  });

  it('is unsaved once edited, and saved again when undone back', () => {
    const tab = anEditedTab();
    expect(isDirty(tab)).toBe(true);
    tab.store.undo();
    expect(isDirty(tab)).toBe(false);
  });

  it('is pristine only while untitled, untouched and empty', () => {
    expect(isPristine(aTab())).toBe(true);

    const undone = anEditedTab();
    undone.store.undo();
    // Clean again, but with a history to redo: someone worked here.
    expect(isPristine(undone)).toBe(false);

    const opened = aTab();
    opened.file = { path: '/p/Wallet.lcp', error: null, savedAt: null };
    expect(isPristine(opened)).toBe(false);

    const recovered = aTab();
    recovered.savedDocument = null;
    expect(isPristine(recovered)).toBe(false);
  });
});

describe('a tab’s name', () => {
  const { t } = createI18n('en');

  it('is its project’s', () => {
    expect(tabName(aTab('Wallet'), t)).toBe('Wallet');
  });

  it('is its file’s for a project with no name of its own, the former default among them', () => {
    for (const unnamed of ['', '  ', 'Untitled']) {
      const tab = aTab(unnamed);
      tab.file = { path: '/p/Portfel.lcp', error: null, savedAt: null };
      expect(tabName(tab, t)).toBe('Portfel');
    }
  });

  it('is Untitled for a new one, numbered from the second', () => {
    expect(tabName(newTab('a', aTab('').store, 1), t)).toBe('Untitled');
    expect(tabName(newTab('b', aTab('').store, 2), t)).toBe('Untitled 2');
    expect(tabName(newTab('c', aTab('Untitled').store, 3), t)).toBe('Untitled 3');
  });
});

describe('a new Untitled’s number', () => {
  const untitled = (number: number, path: string | null = null): ProjectTab => {
    const tab = newTab(`u${String(number)}`, aTab('').store, number);
    tab.file = { path, error: null, savedAt: null };
    return tab;
  };

  it('is the lowest no open, never-saved tab has', () => {
    expect(nextUntitled([])).toBe(1);
    expect(nextUntitled([untitled(1), untitled(2)])).toBe(3);
    expect(nextUntitled([untitled(1), untitled(3)])).toBe(2);
    // Saved, it is called by its file, and its number is free again.
    expect(nextUntitled([untitled(1, '/p/Wallet.lcp')])).toBe(1);
    // A project from a file has none.
    expect(nextUntitled([aTab('Wallet')])).toBe(1);
  });
});

describe('New', () => {
  it('always adds a tab, even beside an untouched Untitled', () => {
    const first = aTab();
    const tabs = new ProjectTabs(first);
    const next = aTab();
    tabs.add(next);
    expect(tabs.tabs).toEqual([first, next]);
    expect(tabs.active).toBe(next);
  });
});

describe('opening a project', () => {
  it('replaces an untouched Untitled', () => {
    const first = aTab();
    const tabs = new ProjectTabs(first);
    const wallet = aTab('Wallet');
    tabs.open(wallet);
    expect(tabs.tabs).toEqual([wallet]);
    expect(tabs.active).toBe(wallet);
  });

  it('adds a tab at the end when the active one holds work', () => {
    const first = anEditedTab();
    const tabs = new ProjectTabs(first);
    const wallet = aTab('Wallet');
    tabs.open(wallet);
    expect(tabs.tabs).toEqual([first, wallet]);
    expect(tabs.active).toBe(wallet);
  });

  it('is found again by its file', () => {
    const wallet = aTab('Wallet');
    wallet.file = { path: '/p/Wallet.lcp', error: null, savedAt: null };
    const tabs = tabsOf(anEditedTab(), wallet);
    expect(tabs.byPath('/p/Wallet.lcp')).toBe(wallet);
    expect(tabs.byPath('/p/Belt.lcp')).toBeUndefined();
  });
});

describe('closing a tab', () => {
  it('moves to the tab on its right, or on its left for the last', () => {
    expect(activeAfterClose(['a', 'b', 'c'], 'b', 'b')).toBe('c');
    expect(activeAfterClose(['a', 'b', 'c'], 'c', 'c')).toBe('b');
    expect(activeAfterClose(['a', 'b', 'c'], 'a', 'c')).toBe('a');
    expect(activeAfterClose(['a'], 'a', 'a')).toBeNull();
  });

  it('leaves none when it was the last: the window shows its start screen', () => {
    const only = anEditedTab();
    const tabs = new ProjectTabs(only);
    tabs.close(only.id);
    expect(tabs.tabs).toEqual([]);
    expect(tabs.active).toBeNull();

    // Opened from the start screen, a project is the one tab again.
    const wallet = aTab('Wallet');
    tabs.open(wallet);
    expect(tabs.tabs).toEqual([wallet]);
    expect(tabs.active).toBe(wallet);
  });

  it('leaves an active tab in the list while any is open, and none only when none is', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.tuple(fc.constantFrom('close', 'cycle', 'activate'), fc.nat()), {
          maxLength: 20,
        }),
        (count, steps) => {
          const tabs = tabsOf(...Array.from({ length: count }, () => anEditedTab()));
          for (const [step, n] of steps) {
            const target = tabs.tabs[n % Math.max(tabs.tabs.length, 1)];
            if (step === 'close' && target !== undefined) tabs.close(target.id);
            else if (step === 'cycle') tabs.cycle(n % 2 === 0 ? 1 : -1);
            else if (target !== undefined) tabs.activate(target.id);
            if (tabs.tabs.length === 0) expect(tabs.active).toBeNull();
            else expect(tabs.tabs).toContain(tabs.active);
            expect(new Set(tabs.tabs.map((tab) => tab.id)).size).toBe(tabs.tabs.length);
          }
        },
      ),
    );
  });
});

describe('cycling', () => {
  it('goes round the ends both ways', () => {
    expect(cycled(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(cycled(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(cycled(['a'], 'a', 1)).toBe('a');
  });

  it('comes back to where it started after a full turn', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.nat(), (count, start) => {
        const ids = Array.from({ length: count }, (_, i) => String(i));
        const from = ids[start % count]!;
        let at = from;
        for (let i = 0; i < count; i++) at = cycled(ids, at, 1);
        expect(at).toBe(from);
        expect(cycled(ids, cycled(ids, from, 1), -1)).toBe(from);
      }),
    );
  });
});

describe('the window', () => {
  it('is told of every change, with a new snapshot', () => {
    const tabs = tabsOf(anEditedTab(), aTab());
    const seen: unknown[] = [];
    tabs.subscribe(() => seen.push(tabs.getSnapshot()));
    const before = tabs.getSnapshot();
    tabs.cycle(1);
    tabs.update(tabs.active!.id, (tab) => {
      tab.view = 'sheets';
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(before);
    expect(seen[1]).not.toBe(seen[0]);
  });

  it('gets a new list when a tab changes, so an effect over the tabs sees a save', () => {
    const tabs = tabsOf(anEditedTab());
    const before = tabs.tabs;
    tabs.update(tabs.active!.id, (tab) => {
      tab.savedDocument = tab.store.getState().document;
    });
    expect(tabs.tabs).not.toBe(before);
    expect(tabs.tabs).toEqual(before);
  });
});

describe('moving a tab (8.12)', () => {
  it('puts it where it is dropped, the active one still active', () => {
    const [a, b, c] = [anEditedTab(), anEditedTab(), anEditedTab()];
    const tabs = tabsOf(a, b, c);
    tabs.activate(b.id);
    tabs.move(a.id, 2);
    expect(tabs.tabs).toEqual([b, c, a]);
    expect(tabs.active).toBe(b);
    // Past either end, it stops there.
    tabs.move(a.id, -5);
    expect(tabs.tabs).toEqual([a, b, c]);
    tabs.move(a.id, 99);
    expect(tabs.tabs).toEqual([b, c, a]);
  });

  it('keeps every tab, once, whatever is moved where', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.array(fc.tuple(fc.nat(), fc.integer({ min: -2, max: 9 })), { maxLength: 15 }),
        (count, moves) => {
          const all = Array.from({ length: count }, () => anEditedTab());
          const tabs = tabsOf(...all);
          for (const [which, to] of moves) tabs.move(tabs.tabs[which % count]!.id, to);
          expect([...tabs.tabs].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
            [...all].sort((x, y) => x.id.localeCompare(y.id)),
          );
        },
      ),
    );
  });
});
