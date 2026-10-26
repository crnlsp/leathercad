import type { RecentFile } from '@leathercad/platform';

import type { Translate } from '../../shared/i18n.js';
import type { IconName } from './icons/names.js';
import type { CommandId } from './keymap.js';

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
  /** How it was chosen: a keyboard's choice gives focus back where it came from (U.4). */
  readonly onChoose: (how?: 'keyboard' | 'pointer') => void;
  /** The command whose key is shown at the right, from the keymap (U.3). */
  readonly keys?: CommandId;
  /** A second line, in the dimmer text. */
  readonly note?: string;
  readonly icon?: IconName;
  readonly danger?: boolean;
  /**
   * Why it cannot be chosen now (8.8). The item stays, greyed, and says this
   * in place of its note — a menu that drops what it cannot do moves the rest
   * about, and never says why (X1).
   */
  readonly refusal?: string | undefined;
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
 * Items whose reason the item after them gives too (8.8): each maps to the
 * last of its run, which says it for all of them — two Flips refused for one
 * reason say it once, not twice. A separator ends a run.
 */
export function sharedReasons(entries: readonly MenuEntry[]): Map<string, string> {
  const said = new Map<string, string>();
  let after: MenuItem | null = null;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.kind !== 'item' || entry.refusal === undefined) {
      after = null;
      continue;
    }
    if (after?.refusal === entry.refusal) said.set(entry.id, said.get(after.id) ?? after.id);
    after = entry;
  }
  return said;
}

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
 * nothing destructive. *Rename…* (U.7) is here because the name is this
 * menu's button: it turns the name into the field it was before.
 */
export function projectMenu(
  actions: {
    readonly newProject: () => void;
    /** A new project from one of the templates (8.12): the picker. */
    readonly newFromTemplate: () => void;
    readonly open: () => void;
    readonly saveAs: () => void;
    /** Saves the project as one of the maker's templates (8.12). */
    readonly saveAsTemplate: () => void;
    readonly rename: (how?: 'keyboard' | 'pointer') => void;
    readonly openRecent: (path: string) => void;
  },
  recent: readonly RecentFile[],
  t: Translate,
  /**
   * Why *Save as* and *Rename* cannot be chosen: no project is open, on the
   * start screen (8.12). Undefined while one is.
   */
  noProject?: string,
): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'new',
      label: t('menu.new'),
      keys: 'newProject',
      onChoose: actions.newProject,
    },
    {
      kind: 'item',
      id: 'new-template',
      label: t('menu.newFromTemplate'),
      onChoose: actions.newFromTemplate,
    },
    {
      kind: 'item',
      id: 'open',
      label: t('menu.open'),
      keys: 'openProject',
      onChoose: actions.open,
    },
    {
      kind: 'item',
      id: 'save-as',
      label: t('menu.saveAs'),
      keys: 'saveAs',
      onChoose: actions.saveAs,
      refusal: noProject,
    },
    {
      kind: 'item',
      id: 'save-template',
      label: t('menu.saveAsTemplate'),
      onChoose: actions.saveAsTemplate,
      refusal: noProject,
    },
    {
      kind: 'item',
      id: 'rename',
      label: t('menu.rename'),
      note: t('menu.renameNote'),
      onChoose: actions.rename,
      refusal: noProject,
    },
    { kind: 'separator' },
    {
      kind: 'group',
      label: t('menu.recent'),
      empty: t('menu.recentEmpty'),
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
 * A tab's own menu (8.12), from a right-click on it or the menu key: what can
 * be done to that project and its file. What needs a file — reload, show,
 * copy its path, move it to the Trash — says so while there is none.
 */
export function tabMenu(
  actions: {
    readonly rename: (how?: 'keyboard' | 'pointer') => void;
    readonly save: () => void;
    readonly saveAs: () => void;
    readonly saveAsTemplate: () => void;
    readonly reload: () => void;
    readonly duplicate: () => void;
    readonly showInFolder: () => void;
    readonly copyPath: () => void;
    readonly trash: () => void;
    readonly close: () => void;
    readonly closeOthers: () => void;
  },
  facts: { readonly hasFile: boolean; readonly othersOpen: boolean },
  t: Translate,
): MenuEntry[] {
  const noFile = facts.hasFile ? undefined : t('tabMenu.noFile');
  return [
    { kind: 'item', id: 'tab-rename', label: t('tabMenu.rename'), onChoose: actions.rename },
    {
      kind: 'item',
      id: 'tab-save',
      label: t('tabMenu.save'),
      keys: 'save',
      onChoose: actions.save,
    },
    {
      kind: 'item',
      id: 'tab-save-as',
      label: t('tabMenu.saveAs'),
      keys: 'saveAs',
      onChoose: actions.saveAs,
    },
    {
      kind: 'item',
      id: 'tab-save-template',
      label: t('menu.saveAsTemplate'),
      onChoose: actions.saveAsTemplate,
    },
    {
      kind: 'item',
      id: 'tab-reload',
      label: t('tabMenu.reload'),
      note: t('tabMenu.reloadNote'),
      onChoose: actions.reload,
      refusal: noFile,
    },
    {
      kind: 'item',
      id: 'tab-duplicate',
      label: t('tabMenu.duplicate'),
      onChoose: actions.duplicate,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'tab-show',
      label: t('tabMenu.showInFolder'),
      onChoose: actions.showInFolder,
      refusal: noFile,
    },
    {
      kind: 'item',
      id: 'tab-copy-path',
      label: t('tabMenu.copyPath'),
      onChoose: actions.copyPath,
      refusal: noFile,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'tab-trash',
      label: t('tabMenu.trash'),
      danger: true,
      onChoose: actions.trash,
      refusal: noFile,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'tab-close',
      label: t('tabMenu.close'),
      keys: 'closeTab',
      onChoose: actions.close,
    },
    {
      kind: 'item',
      id: 'tab-close-others',
      label: t('tabMenu.closeOthers'),
      onChoose: actions.closeOthers,
      refusal: facts.othersOpen ? undefined : t('tabMenu.onlyTab'),
    },
  ];
}

/**
 * What *+* on the tab strip opens (8.12): a tab for a new project, or for one
 * the maker has — chosen on disk, or one of the recent projects, the Project
 * menu's own list. Each opens in a tab of its own; one already open goes to
 * its tab.
 */
export function newTabMenu(
  actions: {
    readonly newProject: () => void;
    readonly newFromTemplate: () => void;
    readonly open: () => void;
    readonly openRecent: (path: string) => void;
  },
  recent: readonly RecentFile[],
  t: Translate,
): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'tab-new',
      label: t('menu.new'),
      keys: 'newProject',
      onChoose: actions.newProject,
    },
    {
      kind: 'item',
      id: 'tab-template',
      label: t('menu.newFromTemplate'),
      onChoose: actions.newFromTemplate,
    },
    {
      kind: 'item',
      id: 'tab-open',
      label: t('menu.open'),
      keys: 'openProject',
      onChoose: actions.open,
    },
    { kind: 'separator' },
    {
      kind: 'group',
      label: t('menu.recent'),
      empty: t('menu.recentEmpty'),
      items: recent.map((file, index) => {
        const { name, folder } = recentParts(file.shown);
        return {
          id: `tab-recent-${String(index)}`,
          label: name,
          note: folder,
          onChoose: () => actions.openRecent(file.path),
        };
      }),
    },
  ];
}

/**
 * The other formats of *Export PDF* (6.2, 6.5), in the menu beside it: the files
 * a laser cutter, a plotter, a CNC program or a vector editor reads, in
 * millimetres. Not repeated in the Project menu — an export is the bar's.
 *
 * With nothing to export the items stay, and say so: a menu that drops what it
 * cannot do moves the rest about, and never says why (X1).
 */
export function exportMenu(
  actions: { readonly svg: () => void; readonly dxf: () => void },
  canExport: boolean,
  t: Translate,
): MenuEntry[] {
  const refusal = canExport ? undefined : t('menu.exportNothing');
  return [
    {
      kind: 'item',
      id: 'export-svg',
      label: t('menu.exportSvg'),
      note: t('menu.exportSvgNote'),
      refusal,
      onChoose: actions.svg,
    },
    {
      kind: 'item',
      id: 'export-dxf',
      label: t('menu.exportDxf'),
      note: t('menu.exportDxfNote'),
      refusal,
      onChoose: actions.dxf,
    },
  ];
}

/**
 * The Help menu (8.7): help, and the application. Never configuration — that
 * is Settings'. The sample is here because it is the app's tutorial by design
 * (8.3): a finished pattern to take apart.
 */
export function helpMenu(
  actions: {
    readonly about: () => void;
  },
  t: Translate,
): MenuEntry[] {
  // The sample wallet is a template since 8.14: New project from template.
  return [{ kind: 'item', id: 'help-about', label: t('menu.about'), onChoose: actions.about }];
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
