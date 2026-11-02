import { describe, expect, it } from 'vitest';

import { PointerValue } from './pointerValue.js';

describe('PointerValue (PERF-007)', () => {
  it('tells each subscriber once for each new value, and reads back the last', () => {
    const value = new PointerValue<number | null>(null);
    const heard: (number | null)[] = [];
    value.subscribe(() => heard.push(value.get()));
    value.set(1);
    value.set(2);
    value.set(null);
    expect(heard).toEqual([1, 2, null]);
    expect(value.get()).toBeNull();
  });

  it('tells nobody when set to the value it has', () => {
    const point = { x: 1, y: 2 };
    const value = new PointerValue<{ x: number; y: number } | null>(point);
    let heard = 0;
    value.subscribe(() => (heard += 1));
    value.set(point);
    expect(heard).toBe(0);
  });

  it('stops telling a subscriber that unsubscribed', () => {
    const value = new PointerValue(0);
    let heard = 0;
    const unsubscribe = value.subscribe(() => (heard += 1));
    value.set(1);
    unsubscribe();
    value.set(2);
    expect(heard).toBe(1);
  });
});
