import { afterEach, describe, expect, it, vi } from 'vitest';

import { observePixelRatio, resizeBackingStore } from './canvasDensity.js';

afterEach(() => vi.unstubAllGlobals());

describe('display density (PERF-011)', () => {
  it('observes every transition in both directions and releases its current listener', () => {
    const queries: Array<{ media: string; events: EventTarget; listeners: Set<unknown> }> = [];
    let density = 1;
    vi.stubGlobal('window', {
      get devicePixelRatio() {
        return density;
      },
      matchMedia: (media: string) => {
        const events = new EventTarget();
        const listeners = new Set<unknown>();
        queries.push({ media, events, listeners });
        return {
          addEventListener: (type: string, listener: EventListener) => {
            listeners.add(listener);
            events.addEventListener(type, listener);
          },
          removeEventListener: (type: string, listener: EventListener) => {
            listeners.delete(listener);
            events.removeEventListener(type, listener);
          },
        };
      },
    });
    const changed = vi.fn();
    const stop = observePixelRatio(changed);
    const transitions = [2, 1.25, 2, 1];
    for (const [i, next] of transitions.entries()) {
      density = next;
      queries[i]?.events.dispatchEvent(new Event('change'));
      expect(queries.at(-1)?.media).toBe(`(resolution: ${next}dppx)`);
      expect(queries.filter((q) => q.listeners.size > 0)).toHaveLength(1);
      expect(changed).toHaveBeenCalledTimes(i + 1);
    }
    stop();
    expect(queries.every((q) => q.listeners.size === 0)).toBe(true);
    for (const query of queries) query.events.dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenCalledTimes(transitions.length);
  });

  it('writes only dimensions that changed, avoiding redundant backing allocations and clears', () => {
    let width = 640;
    let height = 480;
    const writes: string[] = [];
    const canvas = {
      get width() {
        return width;
      },
      set width(value: number) {
        width = value;
        writes.push('width');
      },
      get height() {
        return height;
      },
      set height(value: number) {
        height = value;
        writes.push('height');
      },
    };
    resizeBackingStore(canvas, 640, 480);
    expect(writes).toEqual([]);
    resizeBackingStore(canvas, 1280, 960);
    resizeBackingStore(canvas, 1280, 960);
    expect(writes).toEqual(['width', 'height']);
    resizeBackingStore(canvas, 1280, 480);
    expect(writes).toEqual(['width', 'height', 'height']);
    resizeBackingStore(canvas, 640, 480);
    expect(writes).toEqual(['width', 'height', 'height', 'width']);
  });
});
