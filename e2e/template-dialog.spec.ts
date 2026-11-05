import { expect, test, type Page } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

async function saveTemplate(window: Page): Promise<void> {
  await drawAPanel(window, { parts: '1' });
  await fromProjectMenu(window, 'save-template');
  await window.getByTestId('template-name').fill('My panel');
  await window.getByTestId('template-save').click();
  await expect(window.getByTestId('save-template-dialog')).toHaveCount(0);
  await fromProjectMenu(window, 'new-template');
  await window.getByTestId('template-mine:My panel').click();
}

for (const key of ['Enter', 'Delete']) {
  test(`${key} while reading template details keeps the template and picker open`, async () => {
    await withApp(async (window) => {
      await saveTemplate(window);
      const dialog = window.getByTestId('template-dialog');
      const details = dialog.locator('.template-detail-body');
      await details.focus();
      await details.press(key);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('template-mine:My panel')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(dialog.getByTestId('template-removed')).toHaveCount(0);
      await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(1);
      await expect(details).toBeFocused();
      await details.press('Escape');
      await expect(dialog).toHaveCount(0);
    });
  });
}

test('the list still opens with Enter and removes with Delete, with Undo available', async () => {
  await withApp(async (window) => {
    await saveTemplate(window);
    const dialog = window.getByTestId('template-dialog');
    const list = dialog.getByTestId('template-list');
    await list.focus();
    await list.press('Delete');
    await expect(dialog.getByTestId('template-mine:My panel')).toHaveCount(0);
    await dialog.getByTestId('template-undo').click();
    await dialog.getByTestId('template-mine:My panel').click();
    await list.focus();
    await list.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(2);
    await expect(window.getByTestId('part-count')).toHaveText('1');
  });
});

test('the highlighted row padding selects and double-clicks open the template', async () => {
  await withApp(async (window) => {
    await fromProjectMenu(window, 'new-template');
    const option = window.getByTestId('template-builtin:key-fob');
    const row = option.locator('..');
    await row.click({ position: { x: 1, y: 1 } });
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await expectNoViolations(window, 'template picker with a row selected by its padding');
    await row.dblclick({ position: { x: 1, y: 1 } });
    await expect(window.getByTestId('template-dialog')).toHaveCount(0);
    await expect(window.getByTestId('project-name')).toHaveText('Key fob');
  });
});

test('pinning another row leaves the selection and project unchanged', async () => {
  await withApp(async (window) => {
    await fromProjectMenu(window, 'new-template');
    const dialog = window.getByTestId('template-dialog');
    const chosen = dialog.getByTestId('template-builtin:card-holder');
    await chosen.click();
    const pin = dialog.getByTestId('template-row-pin-builtin:key-fob');
    await pin.click();
    await expect(pin).toHaveClass(/active/);
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await pin.dblclick();
    await expect(dialog).toBeVisible();
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(1);
    await expectNoViolations(window, 'template picker with an independent pin button');
  });
});
