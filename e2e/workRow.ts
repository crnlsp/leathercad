import { expect, type Page } from '@playwright/test';

/**
 * Row 3, the tool row, as the maker sees it (MS.7): what it shows of "? all
 * keys", the group names and the Draw as choices, and whether it fits.
 */
async function readWorkRow(window: Page) {
  return window.getByTestId('work-bar').evaluate((bar) => {
    const edge = bar.getBoundingClientRect().right;
    const seen = (element: Element): boolean =>
      element.checkVisibility({ visibilityProperty: true }) &&
      element.getBoundingClientRect().width > 1;
    const options = bar.querySelector('[data-testid="tool-options"]');
    return {
      // Every part seen, its right edge inside the row's: the copies measured, never seen, aside.
      past: [...bar.querySelectorAll('*')]
        .filter((element) => seen(element) && element.getBoundingClientRect().right > edge + 0.5)
        .map((element) => `${element.tagName}.${element.getAttribute('class') ?? ''}`),
      allKeys: bar.querySelector('[data-testid="all-keys"] .work-hint') !== null,
      groupNames: [...(options?.querySelectorAll('.draw-group-name') ?? [])].some(seen),
      chips: options?.querySelector('[data-testid="draw-as-outline"]') !== null,
      select: options?.querySelector('[data-testid="draw-as-select"]') !== null,
      // A choice is one line, 24 px: a wrapped word would make it taller.
      tallestChoice: Math.max(
        0,
        ...[...(options?.querySelectorAll('button[data-testid^="draw-as-"]') ?? [])].map(
          (chip) => chip.getBoundingClientRect().height,
        ),
      ),
    };
  });
}

/** What row 3 shows once it has fitted itself to the window. */
export type WorkRowShown = Awaited<ReturnType<typeof readWorkRow>>;

/**
 * Waits for row 3 to fit the window, then checks it: nothing in it past its
 * right edge, no Draw as word wrapped, and what has given way gone in the
 * spec's order — "? all keys" before the group names, the names before the
 * chips become the select.
 *
 * The row fits itself in the frame its size changes in (`useWorkRowFit`), so
 * two frames after a resize it is fitted to it: a row read sooner may still
 * be fitted to the size before, and fit without being what this size keeps.
 */
export async function expectWorkRowFits(window: Page, where: string): Promise<WorkRowShown> {
  await window.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await expect.poll(async () => (await readWorkRow(window)).past, { message: where }).toEqual([]);
  const row = await readWorkRow(window);
  expect(row.tallestChoice, `${where}: a Draw as word wrapped`).toBeLessThanOrEqual(24);
  if (row.chips || row.select) {
    expect(row.chips !== row.select, `${where}: chips or the select, never both`).toBe(true);
    if (row.allKeys) expect(row.groupNames, `${where}: "? all keys" outlived the names`).toBe(true);
    if (row.groupNames) expect(row.chips, `${where}: the names outlived the chips`).toBe(true);
  }
  return row;
}
