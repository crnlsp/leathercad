/**
 * Keys that belong to what is open on top (U.20): a dialog's Tab, and an open
 * list's every key.
 */

/**
 * Where Tab goes from stop `index` of a dialog's `count` (U.20): round from
 * the last to the first and back, and into the dialog from outside it (-1),
 * at the end Tab was heading for. Null where the browser's own step stays
 * inside, and for a dialog with nothing to stop on.
 */
export function wrapTab(index: number, count: number, back: boolean): number | null {
  if (count === 0) return null;
  if (index < 0) return back ? count - 1 : 0;
  if (back) return index === 0 ? count - 1 : null;
  return index === count - 1 ? 0 : null;
}

const STOPS = 'a[href], button, input, select, textarea, [tabindex]';

/** A dialog's tab stops, in order: enabled, shown, and not taken out of Tab's way. */
function stopsIn(dialog: Element): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(STOPS)].filter(
    (element) =>
      element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
  );
}

/**
 * Keeps Tab inside the dialog on top (U.20). Every dialog says it is modal,
 * and its backdrop takes the pointer, but Tab walked out of it into the
 * window behind, where a key could act on what the dialog hides. Installed
 * once, for every dialog. A menu open in it keeps its own Tab, which closes it.
 */
export function keepTabInDialogs(document: Document): void {
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      const dialog = dialogs[dialogs.length - 1];
      if (dialog === undefined) return;
      const active = document.activeElement;
      if (active?.closest('[role="menu"]')) return;
      const stops = stopsIn(dialog);
      const next = wrapTab(stops.indexOf(active as HTMLElement), stops.length, event.shiftKey);
      if (next === null) return;
      event.preventDefault();
      stops[next]?.focus();
    },
    true,
  );
}

/**
 * Gives the focus back to what had it before a dialog opened, once the last
 * dialog has closed (U.19). Without it, Esc out of Print or Settings left the
 * focus on nothing, and a maker on the keys started again from the top of
 * the window. Installed once, for every dialog. A dialog that sends the focus
 * somewhere itself, or whose opener is gone, is left as it is.
 */
export function returnFocusFromDialogs(document: Document): void {
  let before: HTMLElement | null = null;
  let open = false;
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[aria-modal="true"]') === null) {
        before = target;
      }
    },
    true,
  );
  new MutationObserver(() => {
    const now = document.querySelector('[aria-modal="true"]') !== null;
    const closed = open && !now;
    open = now;
    if (!closed || before === null || !before.isConnected) return;
    const active = document.activeElement;
    if (active === null || active === document.body) before.focus();
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Keeps every key pressed in a select's open list to the list (U.20). Since
 * the list is the page's own (`appearance: base-select`), its keys reach the
 * page: Escape closing the list closed the dialog under it too, and a letter
 * typed to find an option chose a tool. The list still hears them.
 */
export function keepKeysInOpenLists(document: Document): void {
  document.addEventListener(
    'keydown',
    (event) => {
      const list = event.target instanceof Element ? event.target.closest('select') : null;
      if (list?.matches(':open') === true) event.stopPropagation();
    },
    true,
  );
}
