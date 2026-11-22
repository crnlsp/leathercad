import { expect, test, type Locator, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { expectNoViolations, launchApp } from './launchApp.js';

/** The start screen, with every project closed (8.12, U.23). */
async function onStartScreen(run: (window: Page) => Promise<void>): Promise<void> {
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('start-screen')).toBeVisible();
    await run(window);
  } finally {
    await closeApp(app);
  }
}

test('the start screen offers the blank project first, then the templates drawn as cards (U.23, X10)', async () => {
  await onStartScreen(async (window) => {
    const cards = window.getByTestId('start-screen').locator('.start-cards > li > button');
    await expect(cards.first()).toHaveAttribute('data-testid', 'start-new');
    await expect(window.getByTestId('start-card-builtin:bifold-wallet')).toContainText(
      'Bifold wallet',
    );
    await expect(window.getByTestId('start-card-builtin:bifold-wallet').locator('img')).toHaveCount(
      1,
    );
    await expectNoViolations(window, 'the start screen');

    await window.getByTestId('start-card-builtin:card-holder').click();
    await expect(window.getByTestId('part-count')).toHaveText('2');
  });
});

test('a new project has one name and one key cap, on the start screen and in the Project menu (QA7, U20)', async () => {
  await onStartScreen(async (window) => {
    const card = window.getByTestId('start-new');
    await expect(window.locator('#start-title')).toHaveText('New project');
    await expect(card.locator('.start-card-name')).toHaveText(/^New project/);
    await window.getByTestId('project-menu').click();
    await expect(window.getByTestId('new')).toHaveText(/^New project/);
    await window.keyboard.press('Escape');

    const look = (kbd: Locator) =>
      kbd.evaluate((each) => {
        const style = getComputedStyle(each);
        return [style.font, style.color, style.backgroundColor, style.padding].join(' | ');
      });
    const openKey = window.getByTestId('start-open').locator('kbd');
    expect(await look(card.locator('kbd'))).toBe(await look(openKey));
  });
});

test('a project opened from the start screen by the keys leaves the focus on its board (X20)', async () => {
  await onStartScreen(async (window) => {
    const board = window.getByTestId('editor-canvas');
    // A card, by Enter.
    await window.getByTestId('start-card-builtin:key-fob').focus();
    await window.keyboard.press('Enter');
    await expect(board).toBeFocused();
    await window.keyboard.press('ControlOrMeta+w');
    await expect(window.getByTestId('start-screen')).toBeVisible();

    // A template chosen in the picker, by Enter: the button that opened it goes with the screen.
    await window.getByTestId('start-template').focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('template-builtin:bifold-wallet')).toBeVisible();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(board).toBeFocused();
  });
});
