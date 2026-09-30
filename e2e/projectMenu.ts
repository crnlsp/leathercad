import type { Page } from '@playwright/test';

/**
 * Chooses an item of the Project menu (8.7) — where *New project*, *Open…*
 * and *Save as…* live now the bar has no New and Open buttons. The items keep
 * the test ids the buttons had.
 */
export async function fromProjectMenu(
  window: Page,
  item: 'new' | 'open' | 'save-as',
): Promise<void> {
  await window.getByTestId('project-menu').click();
  await window.getByTestId(item).click();
}
