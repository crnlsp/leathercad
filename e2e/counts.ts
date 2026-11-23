import { expect, type Page } from '@playwright/test';

/**
 * The counts the status bar used to carry, read where the app now says them:
 * pieces in Parts' heading (or, folded, its strip's name), features in Parts'
 * rows, the selection in the announcer, problems in Print's indicator.
 */

/** How many pieces the project has, as Parts says it — open or folded. */
export async function pieceCount(window: Page): Promise<number | null> {
  const says = window.locator('[data-testid="parts-count"], [data-testid="parts-strip"]').first();
  if ((await says.count()) === 0) return null;
  const text = (await says.getAttribute('aria-label')) ?? (await says.textContent()) ?? '';
  const found = /\d+/.exec(text);
  return found === null ? null : Number(found[0]);
}

/** Waits for Parts to say `count` pieces. */
export async function expectPieces(window: Page, count: number | string): Promise<void> {
  await expect.poll(() => pieceCount(window), { message: 'pieces in Parts' }).toBe(Number(count));
}

/** How many features Parts lists, across every piece (its rows must be open). */
export function featureCount(window: Page): Promise<number> {
  return window.locator('[data-testid^="feature-row-"]').count();
}

/** Waits for Parts to list `count` features, across every piece (its rows must be open). */
export async function expectFeatures(window: Page, count: number | string): Promise<void> {
  await expect(window.locator('[data-testid^="feature-row-"]')).toHaveCount(Number(count));
}

/** What the selection holds, as the announcer counts it: pieces, or features. */
export type SelectedOf = 'pieces' | 'features';

/** The announcer's count and kind, read from the attributes it sets: no words, so no language. */
export async function selectedCount(window: Page): Promise<{ of: SelectedOf; count: number }> {
  const said = window.getByTestId('announce-selection');
  const of = (await said.getAttribute('data-of')) === 'features' ? 'features' : 'pieces';
  return { of, count: Number(await said.getAttribute('data-count')) };
}

/** Waits for the selection to hold nothing. */
export async function expectNothingSelected(window: Page): Promise<void> {
  await expect
    .poll(() => selectedCount(window), { message: 'selected' })
    .toMatchObject({
      count: 0,
    });
}

/** Waits for the selection to hold `count` pieces or features, which it must say it holds. */
export async function expectSelected(
  window: Page,
  count: number | string,
  of: SelectedOf,
): Promise<void> {
  await expect
    .poll(() => selectedCount(window), { message: 'selected' })
    .toEqual({ of, count: Number(count) });
}
