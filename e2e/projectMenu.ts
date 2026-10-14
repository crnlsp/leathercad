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
