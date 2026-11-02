import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listenForContextMenuKeys } from './keyboardContextMenu.js';

/** DOM and browser events are the boundary: Node supplies EventTarget. */
class FocusedElement extends EventTarget {
  select = false;
  getBoundingClientRect() {
    return { left: 40, bottom: 90 };
  }
  closest(selector: string) {
    return selector === 'select' && this.select ? this : null;
  }
}
class BrowserPointerEvent extends Event {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  constructor(type: string, init: PointerEventInit) {
    super(type, init);
    this.button = init.button ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}

let focused: FocusedElement;
beforeEach(() => {
  focused = new FocusedElement();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: focused });
  vi.stubGlobal('Element', FocusedElement);
  vi.stubGlobal('PointerEvent', BrowserPointerEvent);
});
afterEach(() => vi.unstubAllGlobals());

function key(init: Record<string, unknown> = {}, type = 'keydown'): Event {
  return Object.assign(new Event(type, { cancelable: true }), {
    code: 'F10',
    key: 'F10',
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...init,
  });
}

describe('keyboard context menus (#194)', () => {
  it.each([true, false])(
    'opens exactly one keyboard menu without a native default (isMac=%s)',
    (isMac) => {
      const menus: Event[] = [];
      focused.addEventListener('contextmenu', (event) => menus.push(event));
      listenForContextMenuKeys(isMac);
      const event = key();
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(menus).toHaveLength(1);
      expect(menus[0]).toMatchObject({
        button: -1,
        clientX: 40,
        clientY: 90,
        bubbles: true,
        cancelable: true,
      });
    },
  );

  it('hears the Menu key through the same fixed keymap entry', () => {
    const menu = vi.fn();
    focused.addEventListener('contextmenu', menu);
    listenForContextMenuKeys(true);
    window.dispatchEvent(key({ code: 'ContextMenu', key: 'ContextMenu', shiftKey: false }));
    expect(menu).toHaveBeenCalledTimes(1);
  });

  it('leaves unrelated, modified and already-handled keys alone', () => {
    const menu = vi.fn();
    focused.addEventListener('contextmenu', menu);
    listenForContextMenuKeys(true);
    const handled = key();
    handled.preventDefault();
    for (const event of [
      key({ shiftKey: false }),
      key({ metaKey: true }),
      key({ altKey: true }),
      handled,
    ]) {
      window.dispatchEvent(event);
    }
    expect(menu).not.toHaveBeenCalled();
  });

  it('leaves a select to its own browser keyboard handling', () => {
    focused.select = true;
    listenForContextMenuKeys(false);
    const event = key();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes the key listener on cleanup', () => {
    const menu = vi.fn();
    focused.addEventListener('contextmenu', menu);
    listenForContextMenuKeys(true)();
    const event = key();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(menu).not.toHaveBeenCalled();
  });

  it('suppresses the handled key release even when focus or modifiers changed', () => {
    const menu = vi.fn();
    focused.addEventListener('contextmenu', menu);
    listenForContextMenuKeys(false);
    window.dispatchEvent(key());
    const release = key({ shiftKey: false }, 'keyup');
    window.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(true);
    expect(menu).toHaveBeenCalledTimes(1);
    const another = key({ shiftKey: false }, 'keyup');
    window.dispatchEvent(another);
    expect(another.defaultPrevented).toBe(false);
  });

  it('leaves unrelated releases alone and removes release handling on cleanup', () => {
    const stop = listenForContextMenuKeys(false);
    window.dispatchEvent(key());
    const unrelated = key({ code: 'KeyA' }, 'keyup');
    window.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    stop();
    const release = key({}, 'keyup');
    window.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(false);
  });
});
