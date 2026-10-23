import { expect, type Page } from '@playwright/test';

/**
 * Chooses an item of the Project menu (8.7) — where *New project*, *Open…*
 * and *Save as…* live now the bar has no New and Open buttons. The items keep
 * the test ids the buttons had.
 */
export async function fromProjectMenu(
  window: Page,
  item: 'new' | 'open' | 'save-as' | 'rename',
): Promise<void> {
  await window.getByTestId('project-menu').click();
  await window.getByTestId(item).click();
}

/**
 * Renames the project as a maker does since U.7: *Rename…* in the Project
 * menu, whose button is the name, then the name typed and Enter.
 */
export async function renameProject(window: Page, name: string): Promise<void> {
  await fromProjectMenu(window, 'rename');
  const field = window.getByTestId('project-name-input');
  await field.fill(name);
  await field.press('Enter');
  await expect(field).toHaveCount(0);
}

/**
 * Chooses the paper and which way up from the paper button's popover (R-06),
 * which replaced the bar's one list of papers in U.7, and closes it again.
 */
export async function choosePaper(
  window: Page,
  paper: string,
  orientation: 'portrait' | 'landscape',
): Promise<void> {
  const popover = window.getByTestId('paper-popover');
  if ((await popover.count()) === 0) await window.getByTestId('paper-button').click();
  await popover.getByTestId('paper').selectOption(paper);
  await popover.getByTestId(`paper-${orientation}`).click();
  await window.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
}

/** The tab the window shows (8.12). */
export function activeTab(window: Page): ReturnType<Page['locator']> {
  return window.locator('[data-testid="project-tab"].active');
}

/**
 * Closes the project's tab with its close button (8.12) — the way, since
 * tabs, to throw unsaved work away and read a project again from disk, where
 * opening it again only went back to its tab. With `discard`, answers the
 * question unsaved work raises with *Don't save*.
 */
export async function closeActiveTab(
  window: Page,
  { discard = false }: { readonly discard?: boolean } = {},
): Promise<void> {
  await activeTab(window).getByTestId('close-tab').click();
  if (discard) await window.getByTestId('unsaved-discard').click();
  await expect(window.getByTestId('unsaved-dialog')).toHaveCount(0);
}
