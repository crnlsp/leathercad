import { keysOf, matches } from './keymap.js';

/**
 * Chromium supplies the keyboard's contextmenu event on Linux/Windows but
 * not macOS. Own the fixed shortcut on every platform, suppressing the browser
 * default so one key opens exactly one menu through the existing handlers.
 * Native mouse and accessibility contextmenu events keep their usual route.
 */
export function listenForContextMenuKeys(isMac: boolean): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !keysOf('contextMenu').some((key) => matches(event, key, isMac)))
      return;
    const target = event.target instanceof Element ? event.target : document.activeElement;
    if (target === null || target.closest('select') !== null) return;
    const box = target.getBoundingClientRect();
    event.preventDefault();
    // PointerEvent preserves button -1; Chromium normalises MouseEvent to 0.
    target.dispatchEvent(
      new PointerEvent('contextmenu', {
        bubbles: true,
        composed: true,
        cancelable: true,
        button: -1,
        clientX: box.left,
        clientY: box.bottom,
      }),
    );
  };
  // Capture before a dialog or field can keep keydown from reaching the window.
  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
}
