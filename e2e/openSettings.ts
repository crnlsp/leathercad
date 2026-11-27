import { expect, type Page } from '@playwright/test';

/** Settings, as a maker reaches it with the pointer: ☰, then its last item. */
export async function openSettings(window: Page): Promise<void> {
  await window.getByTestId('project-menu').click();
  await window.getByTestId('menu-settings').click();
  await expect(window.getByTestId('settings-dialog')).toBeVisible();
}
