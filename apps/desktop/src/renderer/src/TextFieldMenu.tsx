import { useEffect, useState } from 'react';

import { fieldMenu, isTextField } from './fieldMenu.js';
import { useI18n } from './i18n.js';
import { IS_MAC } from './keyCaps.js';
import { commandFor, keysOf, matches } from './keymap.js';
import { ContextMenu } from './Menu.js';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** Whether some of a field's text is selected: what Cut and Copy act on. */
function hasSelection(field: Field): boolean {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return (field.selectionStart ?? 0) !== (field.selectionEnd ?? 0);
  }
  return getSelection()?.isCollapsed === false;
}

/**
 * A field's right-click menu (U.20), for every text field in the window and
 * its dialogs, mounted once. Heard on the window before anything else, so a
 * right-click in a field — Parts' rename too — is the field's, never the
 * board's menu under it. Shift+F10 and the Menu key open it at the field.
 *
 * It is placed beside the field in the document — in its dialog, or the
 * landmark it is in — so it is above a dialog the field is in, and read as
 * part of the region it came from. Its items act on the field as its keys do. Focus goes back to the field
 * whenever the menu closes, so a field that finishes when it is left — the
 * project's name, a row's — is still being edited.
 *
 * And Ctrl+A is a field's: outside one it selects nothing, where Chromium
 * would paint the whole window.
 */
export function TextFieldMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState<{
    readonly field: Field;
    readonly at: { readonly x: number; readonly y: number };
    readonly selected: boolean;
  } | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      if (!isTextField(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const field = event.target;
      // The keyboard's menu comes with no button (-1), and opens under the field.
      const box = field.getBoundingClientRect();
      const at =
        event.button === -1
          ? { x: box.left, y: box.bottom }
          : { x: event.clientX, y: event.clientY };
      setOpen({ field, at, selected: hasSelection(field) });
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTextField(event.target)) return;
      // Chromium's select-all outside a field, unless the maker gave the
      // window that key (U.12): then it is that command's, not prevented here.
      if (
        keysOf('selectAll').some((binding) => matches(event, binding, IS_MAC)) &&
        commandFor(event, IS_MAC) === null
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (open === null) return null;
  const { field } = open;
  // Each acts on the field with focus back in it, as its key would.
  const edit = (command: 'cut' | 'copy' | 'selectAll'): void => {
    field.focus();
    document.execCommand(command);
  };
  return (
    <ContextMenu
      key={`${String(open.at.x)},${String(open.at.y)}`}
      at={open.at}
      from={field}
      label={t('fieldMenu.label')}
      testId="field-menu"
      entries={fieldMenu(
        t,
        { selected: open.selected },
        {
          cut: () => edit('cut'),
          copy: () => edit('copy'),
          // Chromium refuses a page's own `paste`: the text is read, then
          // typed in, so the field hears it as typing and undo takes it back.
          paste: () => {
            field.focus();
            void navigator.clipboard
              .readText()
              .then((text) => document.execCommand('insertText', false, text))
              .catch(() => undefined);
          },
          selectAll: () => edit('selectAll'),
        },
      )}
      onClose={() => {
        if (field.isConnected) field.focus();
        setOpen(null);
      }}
    />
  );
}
