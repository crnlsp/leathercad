import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { ONE_PRINTER, fakeCups } from './fakeCups.js';
import { launchApp, scanA11y, expectNoViolations } from './launchApp.js';
import { openPrintTest } from './printTest.js';

/**
 * An automated accessibility scan of the running window.
 *
 * axe checks what is rendered: names on controls, contrast, roles, labels. It
 * finds perhaps a third of real accessibility problems. The rest need a person
 * with a screen reader, which is why this scan is a floor and not a verdict.
 *
 * It ratchets. The violations present when the scan was added are listed in
 * KNOWN, each a recorded finding. A new one fails the test. So does a listed
 * one that has been fixed, so the list shrinks with the code rather than
 * going stale. See the engineering-tooling spec §4.
 */

/**
 * Rule id → what it found when recorded. Empty is the goal — and reached.
 *
 * Found on an empty document on 2026-09-23: no main landmark, three unnamed
 * <aside> panels, and content outside any landmark. All three were in the
 * workspace markup, and F.2 rebuilt it: the canvas column is the <main>
 * landmark, and every panel is named. The project name, labelled only by its
 * tooltip, was fixed when the scan was added.
 */
const KNOWN: Record<string, string> = {};

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await launchApp();
});

test.afterAll(async () => {
  await closeApp(app);
});

test('the main window has no accessibility violations beyond those recorded', async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // The version arrives through an effect, so it proves React has mounted
  // and the panels are on screen to be scanned. See shell.spec.ts.
  await expect(window.getByTestId('app-version')).not.toBeEmpty();

  const found = (await scanA11y(window)).map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length,
    first: violation.nodes[0]?.target.join(' '),
  }));

  const unexpected = found.filter((violation) => !(violation.rule in KNOWN));
  const fixed = Object.keys(KNOWN).filter((rule) => !found.some((v) => v.rule === rule));

  expect(unexpected, 'new accessibility violations').toEqual([]);
  expect(fixed, 'recorded violations that are gone — remove them from KNOWN').toEqual([]);
});

test('the F.2 layout at work has no accessibility violations either', async () => {
  // The first scan sees an empty document at the default size. This one sees
  // what F.2 added: the collapsed rail, a populated parts tree with its menus,
  // the problems drawer open, and Properties open over the board from its strip
  // below 1280 px (U.5).
  const instance = await launchApp();
  try {
    const window = await instance.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 330, box.y + 270, { steps: 5 });
    await window.mouse.up();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-line').click();
    const margin = panel.locator('label', { hasText: /^Edge margin/ }).locator('input');
    await margin.fill('60');
    await margin.press('Enter');
    await window.getByTestId('problems-toggle').click();

    await instance.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1000, 700);
    });
    await expect(window.getByTestId('tool-rail')).toHaveClass(/collapsed/);
    await window.getByTestId('toggle-properties').click();
    await expect(panel).toBeVisible();

    const found = (await scanA11y(window)).map((violation) => ({
      rule: violation.id,
      help: violation.help,
      first: violation.nodes[0]?.target.join(' '),
      nodes: violation.nodes.length,
    }));
    expect(found, 'accessibility violations in the working layout').toEqual([]);
  } finally {
    await closeApp(instance);
  }
});

test('the top bar’s menus, Settings, About and the Print Preview have no accessibility violations', async () => {
  // A printer listed (U.20), so Print shows its printer, its sheets'
  // checkboxes and Copies, which only a printer brings. Windows has no CUPS
  // and saves a PDF instead.
  const cups = fakeCups(ONE_PRINTER);
  const instance = await launchApp(
    process.platform === 'win32'
      ? {}
      : { env: { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` } },
  );
  try {
    const window = await instance.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    const scan = (what: string): Promise<void> => expectNoViolations(window, what);

    await window.getByTestId('project-menu').click();
    await scan('the Project menu, with no recent projects');
    await window.keyboard.press('Escape');
    await window.getByTestId('help-menu').click();
    await scan('the Help menu');
    await window.keyboard.press('Escape');

    await window.getByTestId('settings').click();
    for (const section of ['general', 'appearance', 'tools', 'shortcuts']) {
      await window.getByTestId(`settings-tab-${section}`).click();
      await scan(`Settings › ${section}`);
    }
    await window.getByTestId('settings-close').click();

    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-about').click();
    await scan('About');
    await window.getByTestId('about-notices').click();
    await expect(window.getByTestId('notices')).toBeVisible();
    await scan('the third-party notices (U.20)');
    await window.getByTestId('notices-close').click();
    await window.getByTestId('about-close').click();

    // A field's own menu (U.20).
    await window.getByTestId('project-menu').click();
    await window.getByTestId('rename').click();
    await window.getByTestId('project-name-input').click({ button: 'right' });
    await expect(window.getByTestId('field-menu')).toBeVisible();
    await scan('a field’s right-click menu');
    await window.keyboard.press('Escape');
    await window.keyboard.press('Escape');

    // 7.6: whichever this machine offers — its printers, or Save PDF.
    await window.getByTestId('print').click();
    const preview = window.getByTestId('print-preview');
    await expect(preview.locator('canvas').first()).toBeVisible();
    await expect(
      preview.getByTestId('print-no-scaling').or(preview.getByTestId('print-actual-size')),
    ).toBeVisible();
    if (process.platform !== 'win32') {
      await expect(preview.getByTestId('print-printer')).toHaveValue('LeatherCAD_Test');
      await expect(preview.getByTestId('print-include').first()).toBeVisible();
      await expect(preview.getByLabel('Copies')).toBeVisible();
    }
    await scan('the Print Preview');
  } finally {
    await closeApp(instance);
  }
});

test('what 1.5 added has no accessibility violations: a size being typed, the selection bar, a key changing, and Delete lit (U.19)', async () => {
  // The scans above see each surface at rest. These are the ones a maker
  // meets in the middle of the work, and a lit menu row, which axe sees only
  // while it is lit: the right-click menu's Delete was 4.2 : 1 under the
  // pointer until U.19.
  const instance = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-a11y-')) },
  });
  try {
    const window = await instance.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await instance.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    });
    const scan = (what: string): Promise<void> => expectNoViolations(window, what);

    // A rectangle typed before any click (U.16), and After the outline (U.18).
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.6);
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.type('105');
    await window.keyboard.press('Tab');
    await window.keyboard.type('75');
    await expect(window.getByTestId('drawing-defaults')).toBeVisible();
    await scan('a rectangle being typed, with After the outline');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // The selection bar, its next step focused (U.17).
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('F6');
    await expect(window.getByTestId('selection-bar-step').first()).toBeFocused();
    await scan('the selection bar, with focus in it');
    await window.keyboard.press('F6');

    // The right-click menu, Delete under the pointer and then the keyboard.
    const outline = window
      .getByTestId('parts-list')
      .locator('[data-testid^="feature-row-"]', { hasText: 'Outline' });
    await outline.click({ button: 'right' });
    const remove = window.getByTestId('context-delete');
    await remove.hover();
    await scan('the right-click menu, Delete under the pointer');
    await window.keyboard.press('Escape');

    // A key being changed, and the clash it makes (U.12).
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-shortcuts').click();
    await window.getByTestId('change-settings').click();
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('shortcut-clash')).toBeVisible();
    await scan('Settings › Keyboard shortcuts, a clash');
    await window.getByTestId('clash-cancel').click();
  } finally {
    await closeApp(instance);
  }
});

test('the top bar’s "Saved" has no accessibility violations with a project open', async () => {
  // "Saved" shows only once a project has a file; the print test is one.
  const instance = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-a11y-')) },
  });
  try {
    const window = await instance.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await openPrintTest(instance, window, join(tmpdir(), 'leathercad-e2e-a11y.pdf'));
    await expect(window.getByTestId('save-state')).toContainText('Saved');
    await expectNoViolations(window, 'the top bar with a saved project open');
  } finally {
    await closeApp(instance);
  }
});
