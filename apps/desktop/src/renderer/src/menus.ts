import type { RecentFile } from '@leathercad/platform';
import type { LucideIcon } from 'lucide-react';

/**
 * What a menu holds (8.7), as data: the Project and Help menus, a part's
 * actions, and 8.8's right-click menu are lists of these, drawn by
 * `MenuButton`. Data, so a test can read a menu — its shortcuts, above all —
 * without a DOM.
 */
export interface MenuItem {
  /** Its `data-testid`. */
  readonly id: string;
  readonly label: string;
  readonly onChoose: () => void;
  /** The shortcut shown at the right, as `shortcuts.ts` writes keys: `CmdOrCtrl+N`. */
  readonly keys?: string;
  /** A second line, in the dimmer text. */
  readonly note?: string;
  readonly icon?: LucideIcon;
  readonly danger?: boolean;
}

export type MenuEntry =
  | ({ readonly kind: 'item' } & MenuItem)
  | { readonly kind: 'separator' }
  /** A named run of items; with none, a line saying what would fill it. */
  | {
      readonly kind: 'group';
      readonly label: string;
      readonly items: readonly MenuItem[];
      readonly empty: string;
    };

/**
 * Where the arrow keys, Home and End move a menu's focus, among `count`
 * items: down and up wrap at the ends, as menus do. -1 for any other key, or
 * an empty menu.
 */
export function focusAfter(key: string, current: number, count: number): number {
  if (count === 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return -1;
  }
}

/**
 * The Project menu (8.7): the project and its files. The actions come first
 * and the recent projects after — the list grows and shrinks, and the actions
 * stay under the pointer. Save and Export PDF are buttons on the bar, so they
 * are not repeated here; clearing the list is in Settings, so this menu holds
 * nothing destructive.
 */
export function projectMenu(
  actions: {
    readonly newProject: () => void;
    readonly open: () => void;
    readonly saveAs: () => void;
    readonly openRecent: (path: string) => void;
  },
  recent: readonly RecentFile[],
): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'new',
      label: 'New project',
      keys: 'CmdOrCtrl+N',
      onChoose: actions.newProject,
    },
    { kind: 'item', id: 'open', label: 'Open…', keys: 'CmdOrCtrl+O', onChoose: actions.open },
    {
      kind: 'item',
      id: 'save-as',
      label: 'Save as…',
      keys: 'CmdOrCtrl+Shift+S',
      onChoose: actions.saveAs,
    },
    { kind: 'separator' },
    {
      kind: 'group',
      label: 'Recent projects',
      empty: 'Projects you open or save appear here.',
      items: recent.map((file, index) => {
        const { name, folder } = recentParts(file.shown);
        return {
          id: `recent-${String(index)}`,
          label: name,
          note: folder,
          onChoose: () => actions.openRecent(file.path),
        };
      }),
    },
  ];
}

/**
 * The Help menu (8.7): help, and the application. Never configuration — that
 * is Settings'. The sample is here because it is the app's tutorial by design
 * (8.3): a finished pattern to take apart.
 */
export function helpMenu(actions: {
  readonly openSample: () => void;
  readonly about: () => void;
}): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'help-open-sample',
      label: 'Open sample project',
      onChoose: actions.openSample,
    },
    { kind: 'separator' },
    { kind: 'item', id: 'help-about', label: 'About LeatherCAD', onChoose: actions.about },
  ];
}

/**
 * A recent project's two lines (8.7): its name without `.lcp`, then its
 * folder — so two projects of one name in different folders can be told
 * apart. Either separator, since a Windows path uses `\`.
 */
export function recentParts(shown: string): { name: string; folder: string } {
  const cut = Math.max(shown.lastIndexOf('/'), shown.lastIndexOf('\\'));
  return {
    name: shown.slice(cut + 1).replace(/\.lcp$/i, ''),
    folder: cut === 0 ? shown.slice(0, 1) : shown.slice(0, Math.max(cut, 0)),
  };
}
