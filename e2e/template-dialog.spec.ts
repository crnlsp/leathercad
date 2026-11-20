import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

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

/** The open dialog answers with `path`, as if the maker chose it. */
async function choosing(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, path);
}

test('a file that is not a project is refused at import, with the reason, and not listed', async () => {
  await withApp(async (window, app) => {
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'not-a-project.lcp');
    writeFileSync(file, 'hello');
    await choosing(app, file);
    await fromProjectMenu(window, 'new-template');
    const dialog = window.getByTestId('template-dialog');
    // No templates of the maker's yet: Show and Sort are there, quiet (X11).
    await expect(dialog.locator('.template-bar')).toHaveClass(/quiet/);
    await dialog.getByTestId('template-import').click();
    await expect(dialog.getByTestId('template-import-problem')).toHaveText(
      '“not-a-project” wasn’t added to your templates. This file can’t be opened: it isn’t a LeatherCAD project, or it is damaged.',
    );
    await expect(dialog.locator('[data-template^="mine:"]')).toHaveCount(0);
    await expectNoViolations(window, 'template picker refusing an import');
  });
});

test('an imported project is listed under its own name, chosen and in view', async () => {
  await withApp(async (window, app) => {
    await choosing(app, join(import.meta.dirname, '..', 'fixtures', 'projects', 'card-holder.lcp'));
    await fromProjectMenu(window, 'new-template');
    const dialog = window.getByTestId('template-dialog');
    await dialog.getByTestId('template-show-builtin').click();
    await dialog.getByTestId('template-import').click();
    const imported = dialog.getByTestId('template-mine:Card holder');
    await expect(imported).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByTestId('template-show-all')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('.template-bar')).not.toHaveClass(/quiet/);
    await dialog.getByTestId('template-use').click();
    await expect(window.getByTestId('project-name')).toHaveText('Card holder');
  });
});

test('a template’s description is edited beside its drawing, at the smallest window', async () => {
  await withApp(
    async (window) => {
      await saveTemplate(window);
      const dialog = window.getByTestId('template-dialog');
      await expect(dialog.getByTestId('template-edit')).toHaveText('Edit pattern');
      await dialog.getByTestId('template-edit-details').click();
      const drawing = dialog.locator('.template-detail-body .template-preview');
      const form = dialog.locator('.template-words');
      await expect(drawing).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByTestId('template-words-save')).toBeInViewport();
      const [a, b] = [(await drawing.boundingBox())!, (await form.boundingBox())!];
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
      expect(b.y).toBeLessThan(a.y + a.height);
      await expectNoViolations(window, 'template picker editing a description');
    },
    { size: [860, 600] },
  );
});
