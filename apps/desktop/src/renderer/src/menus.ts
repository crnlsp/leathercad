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
