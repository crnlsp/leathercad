import type { Page } from '@playwright/test';

/** What React rendered while it was counted. */
export interface RenderCounts {
  readonly commits: number;
  /** Component renders in all. */
  readonly renders: number;
  /** Renders by component name. */
  readonly by: Readonly<Record<string, number>>;
}

interface Counter {
  counting: boolean;
  counts: { commits: number; renders: number; by: Record<string, number> };
}

/**
 * Has `window` count what React renders, as React DevTools counts it (PERF-007): through the
 * hook React reports each commit to, even in a production build. A component rendered in a
 * commit when its fiber is new or carries React's `PerformedWork` flag; a subtree whose child
 * list is the one it had is one React skipped.
 *
 * React looks for the hook as it loads, so this reloads the window once: whatever it showed
 * starts again.
 */
export async function installRenderCounter(window: Page): Promise<void> {
  await window.context().addInitScript(() => {
    const PERFORMED_WORK = 1;
    // Function, class, forwardRef, memo and simple memo components.
    const COMPONENT = new Set([0, 1, 11, 14, 15]);
    interface Fiber {
      readonly tag: number;
      readonly type: {
        readonly displayName?: string;
        readonly name?: string;
        readonly render?: { readonly name?: string };
        readonly type?: { readonly name?: string };
      } | null;
      readonly flags: number;
      readonly alternate: Fiber | null;
      readonly child: Fiber | null;
      readonly sibling: Fiber | null;
    }
    const nameOf = (fiber: Fiber): string =>
      fiber.type?.displayName ??
      fiber.type?.name ??
      fiber.type?.render?.name ??
      fiber.type?.type?.name ??
      'anonymous';
    const counter: Counter = { counting: false, counts: { commits: 0, renders: 0, by: {} } };
    const visit = (first: Fiber | null): void => {
      for (let fiber = first; fiber !== null; fiber = fiber.sibling) {
        const prev = fiber.alternate;
        if (COMPONENT.has(fiber.tag) && (prev === null || (fiber.flags & PERFORMED_WORK) !== 0)) {
          const name = nameOf(fiber);
          counter.counts.renders += 1;
          counter.counts.by[name] = (counter.counts.by[name] ?? 0) + 1;
        }
        if (fiber.child !== null && (prev === null || fiber.child !== prev.child)) {
          visit(fiber.child);
        }
      }
    };
    const renderers = new Map<number, unknown>();
    Object.assign(window, {
      __renderCounter: counter,
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        supportsFiber: true,
        renderers,
        inject(renderer: unknown): number {
          renderers.set(renderers.size + 1, renderer);
          return renderers.size;
        },
        onScheduleFiberRoot(): void {},
        onCommitFiberRoot(_id: number, root: { readonly current: Fiber }): void {
          if (!counter.counting) return;
          counter.counts.commits += 1;
          visit(root.current.child);
        },
        onCommitFiberUnmount(): void {},
        onPostCommitFiberRoot(): void {},
        checkDCE(): void {},
      },
    });
  });
  await window.reload();
}

/** What React renders in `window` while `run` runs. `installRenderCounter` first. */
export async function countRenders(window: Page, run: () => Promise<void>): Promise<RenderCounts> {
  await window.evaluate(() => {
    const counter = (window as unknown as { __renderCounter: Counter }).__renderCounter;
    counter.counts = { commits: 0, renders: 0, by: {} };
    counter.counting = true;
  });
  await run();
  return window.evaluate(() => {
    const counter = (window as unknown as { __renderCounter: Counter }).__renderCounter;
    counter.counting = false;
    return counter.counts;
  });
}

/** Two animation frames: React has committed what the last input asked for, and painted. */
export function nextFrame(window: Page): Promise<void> {
  return window.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}
