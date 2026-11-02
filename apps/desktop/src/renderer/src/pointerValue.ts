import { useSyncExternalStore } from 'react';

/**
 * Something that changes with every pointer move over the board — the point under the pointer,
 * where the pointer is on it — kept out of React state (PERF-007). The board sets it; only what
 * shows it subscribes, through `usePointerValue`, so a move renders the cursor readout or a
 * notice beside the pointer, and not the board or the window around it.
 */
export class PointerValue<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  readonly get = (): T => this.value;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Tells the subscribers, unless it is the value they have. */
  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const listener of this.listeners) listener();
  }
}

/** The value, rendering the caller again whenever it is set. */
export function usePointerValue<T>(source: PointerValue<T>): T {
  return useSyncExternalStore(source.subscribe, source.get);
}
