import type { Translate } from '../../shared/i18n.js';
import type { MenuEntry } from './menus.js';

/** What a field's menu does: the editing every field already knows by its keys. */
export interface FieldActions {
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
}

/**
 * A field's right-click menu (U.20): Cut, Copy, Paste and Select all, in the
 * app's own menu and words — Chromium shows none, and Electron's would be in
 * its own English (ADR 0018). Their keys are the keymap's, heard by the field
 * itself. Cut and Copy wait for something selected, and say so.
 */
export function fieldMenu(
  t: Translate,
  field: { readonly selected: boolean },
  actions: FieldActions,
): MenuEntry[] {
  const unselected = field.selected ? undefined : t('fieldMenu.nothingSelected');
  return [
    {
      kind: 'item',
      id: 'field-cut',
      label: t('fieldMenu.cut'),
      keys: 'cut',
      refusal: unselected,
      onChoose: actions.cut,
    },
    {
      kind: 'item',
      id: 'field-copy',
      label: t('fieldMenu.copy'),
      keys: 'copy',
      refusal: unselected,
      onChoose: actions.copy,
    },
    {
      kind: 'item',
      id: 'field-paste',
      label: t('fieldMenu.paste'),
      keys: 'paste',
      onChoose: actions.paste,
    },
    {
      kind: 'item',
      id: 'field-select-all',
      label: t('fieldMenu.selectAll'),
      keys: 'selectAll',
      onChoose: actions.selectAll,
    },
  ];
}

/** The inputs a maker types words or numbers into; not a box, a dot or a slider. */
const TEXT_TYPES = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password']);

/** Whether a target is a field text is typed into: the only place a field menu opens. */
export function isTextField(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (target === null || !('tagName' in target)) return false;
  const element = target as {
    readonly tagName: string;
    readonly type?: string;
    readonly isContentEditable?: boolean;
  };
  if (element.tagName === 'INPUT') return TEXT_TYPES.has(element.type ?? 'text');
  return element.tagName === 'TEXTAREA' || element.isContentEditable === true;
}

/**
 * Whether focus is going into a menu, for a field that finishes when it is
 * left: the only menu that opens while a field has focus is the field's own,
 * and opening it is not the maker leaving the field.
 */
export function intoMenu(next: EventTarget | null): boolean {
  return next instanceof Element && next.closest('[role="menu"]') !== null;
}
