import { describe, expect, it } from 'vitest';

import { focusAfter } from './menus.js';

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
