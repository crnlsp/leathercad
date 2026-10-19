import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';

/**
 * A project that opens is shown whole. The camera used to stay where it was,
 * so the sample wallet opened with its card pocket off the board and its
 * lining cut in half, until the maker found Fit.
 */

const zoomOf = (window: Page): Promise<string> =>
  window
    .getByTestId('zoom-control')
    .textContent()
    .then((text) => text ?? '');

/** Fit, then the zoom it lands on: what an opened project should already show. */
async function expectFitted(window: Page): Promise<void> {
  const opened = await zoomOf(window);
  await window.getByTestId('zoom-fit').click();
  await expect(window.getByTestId('zoom-control')).toHaveText(opened);
}

async function launch(): Promise<{
  app: Awaited<ReturnType<typeof launchApp>>;
  window: Page;
  before: string;
}> {
  const app = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window, before: await zoomOf(window) };
}

test('an opened project is framed: Fit then changes nothing', async () => {
  const { app, window, before } = await launch();
  try {
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    // The sample is larger than the empty board's view: framing it zooms out.
    await expect(window.getByTestId('zoom-control')).not.toHaveText(before);
    await expectFitted(window);
  } finally {
    await closeApp(app);
  }
});

test('a project opened from the Sheets view is framed in Design too', async () => {
  const { app, window, before } = await launch();
  try {
    await window.getByTestId('view-sheets').click();
    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-open-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');

    await window.getByTestId('view-design').click();
    await expect(window.getByTestId('zoom-control')).not.toHaveText(before);
    await expectFitted(window);
  } finally {
    await closeApp(app);
  }
});
