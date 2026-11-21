import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { loadProject, saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

const cardHolder = resolve(import.meta.dirname, '../fixtures/regressions/card-holder-1.6.lcp');

test('sew two hole sets inline, cancel, commit, edit and unsew in single undo steps (9.6b)', async () => {
  const saved = join(mkdtempSync(join(tmpdir(), 'leathercad-sewing-')), 'Sewn.lcp');
  copyFileSync(cardHolder, saved);
  const { app, window } = await openApp({ args: [saved], size: [1440, 1000] });
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, saved);
    await window.getByTestId('feature-row-pocket-holes').click();
    await window.getByTestId('feature-row-outer-holes').click({ modifiers: ['Shift'] });
    await window.getByTestId('sew-together').click();
    const panel = window.getByTestId('seam-panel');
    await expect(panel.getByTestId('seam-side')).toHaveCount(2);
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await panel.getByTestId('seam-cancel').click();
    await expect(panel.getByTestId('seam-row')).toHaveCount(0);
    // The context menu starts the same workflow.
    await window.getByTestId('feature-row-pocket-holes').click({ button: 'right' });
    await window.getByTestId('context-sew').click();
    const sides = panel.getByTestId('seam-side');
    // Explicit chooser supports a fold, and also changing which piece is first.
    await sides.nth(0).getByTestId('seam-holes').selectOption('pocket-holes');
    await sides.nth(1).getByTestId('seam-holes').selectOption('outer-holes');
    await sides.nth(0).getByTestId('seam-where').selectOption('between');
    await sides.nth(0).getByLabel('From', { exact: true }).selectOption('0');
    await sides.nth(0).getByLabel('To', { exact: true }).selectOption('start');
    await sides.nth(1).getByTestId('seam-where').selectOption('from');
    await sides.nth(1).getByLabel('From', { exact: true }).selectOption('3');
    await sides.nth(1).getByLabel('Direction', { exact: true }).selectOption('previous');
    await expect(panel.getByTestId('seam-verdict')).toHaveText(/11 = 11 holes · drift 0.61 mm/);
    await expect(panel.getByTestId('seam-verdict')).toHaveAttribute('data-severity', 'warning');
    await expectNoViolations(window, 'live seam preview');
    await window.screenshot({ path: test.info().outputPath('seam-preview.png') });
    await panel.getByTestId('seam-commit').click();
    await window.getByTestId('feature-row-pocket-holes').click();
    await expect(panel.getByTestId('seam-row')).toHaveCount(1);
    await expect(window.getByTestId('selection-bar-seam')).toContainText('Sewn to Outer');
    await window.getByTestId('problems-toggle').click();
    const row = window.getByTestId('problems-panel').locator('[data-code="SEAM_HOLES_DRIFT"]');
    await expect(row).toContainText('Pocket');
    await expect(row).toContainText('Outer');
    await row.click();
    await window.getByTestId('problems-toggle').click();
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    const p = loadProject(readFileSync(saved)).project;
    expect(p.seams).toHaveLength(1);
    expect(p.seams?.[0]).toMatchObject({
      a: { holeSetId: 'pocket-holes', stretch: { fromAnchor: 0, toAnchor: 'start' } },
      b: { holeSetId: 'outer-holes', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
    });
    await panel.getByTestId('seam-edit').click();
    await panel
      .getByTestId('seam-side')
      .nth(1)
      .getByLabel('Direction', { exact: true })
      .selectOption('next');
    await panel.getByTestId('seam-cancel').click();
    await expect(panel.getByTestId('seam-verdict')).toHaveText(/11 = 11 holes · drift 0.61 mm/);
    await panel.getByTestId('seam-edit').click();
    await panel
      .getByTestId('seam-side')
      .nth(1)
      .getByLabel('Direction', { exact: true })
      .selectOption('next');
    await panel.getByTestId('seam-commit').click();
    await window.getByTestId('undo').click();
    await expect(panel.getByTestId('seam-verdict')).toHaveText(/11 = 11 holes · drift 0.61 mm/);
    await panel.getByTestId('seam-unsew').click();
    await expect(panel.getByTestId('seam-row')).toHaveCount(0);
    await window.getByTestId('undo').click();
    await expect(panel.getByTestId('seam-row')).toHaveCount(1);
    await expectNoViolations(window, 'saved seam and unsew undo');
  } finally {
    await window.screenshot({ path: test.info().outputPath('seam-final.png') });
    await closeApp(app);
  }
});

test('Shift- and Ctrl-click in Parts add and remove hole sets, as on the board (QA5)', async () => {
  const { app, window } = await openApp({ args: [cardHolder], size: [1440, 1000] });
  try {
    const pocket = window.getByTestId('feature-row-pocket-holes');
    const outer = window.getByTestId('feature-row-outer-holes');
    await pocket.click();
    await outer.click({ modifiers: ['Shift'] });
    await expect(pocket).toHaveAttribute('aria-selected', 'true');
    await expect(outer).toHaveAttribute('aria-selected', 'true');
    await outer.click({ modifiers: ['ControlOrMeta'] });
    await expect(outer).toHaveAttribute('aria-selected', 'false');
    await expect(pocket).toHaveAttribute('aria-selected', 'true');
    await outer.click({ modifiers: ['ControlOrMeta'] });
    await expect(outer).toHaveAttribute('aria-selected', 'true');
    await expectNoViolations(window, 'two rows picked in Parts');
    // Keyboard selection still moves a single pick with the focus.
    await outer.press('ArrowUp');
    await expect(outer).toHaveAttribute('aria-selected', 'false');
  } finally {
    await closeApp(app);
  }
});

test('Sew together from one hole set starts its second side on another piece (QA5)', async () => {
  const saved = join(mkdtempSync(join(tmpdir(), 'leathercad-sew-one-')), 'Sewn.lcp');
  copyFileSync(cardHolder, saved);
  const { app, window } = await openApp({ args: [saved], size: [1440, 1000] });
  try {
    await window.getByTestId('feature-row-pocket-holes').click();
    await window.getByTestId('sew-together').click();
    const panel = window.getByTestId('seam-panel');
    const sides = panel.getByTestId('seam-side');
    await expect(sides.nth(0).getByTestId('seam-holes')).toHaveValue('pocket-holes');
    await expect(sides.nth(1).getByTestId('seam-holes')).toHaveValue('outer-holes');
    // Its stretch is still the maker's: the outer's left side, up from its bottom corner.
    await sides.nth(1).getByTestId('seam-where').selectOption('from');
    await sides.nth(1).getByLabel('From', { exact: true }).selectOption('3');
    await sides.nth(1).getByLabel('Direction', { exact: true }).selectOption('previous');
    await expect(panel.getByTestId('seam-verdict')).toHaveText(/11 = 11 holes/);
    await panel.getByTestId('seam-commit').click();
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    expect(loadProject(readFileSync(saved)).project.seams).toMatchObject([
      { a: { holeSetId: 'pocket-holes' }, b: { holeSetId: 'outer-holes' } },
    ]);
  } finally {
    await closeApp(app);
  }
});

test('fully orphaned seams remain editable and removable from empty Properties', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-orphan-seam-')), 'Orphan.lcp');
  const p = loadProject(readFileSync(cardHolder)).project;
  const side = { holeSetId: 'gone', stretch: { kind: 'whole' } } as const;
  writeFileSync(
    file,
    saveProject(
      { ...p, seams: [{ id: 'orphan', a: side, b: side }] },
      { applicationVersion: '1.7.0', now: () => new Date('2026-11-10T00:00:00Z') },
    ),
  );
  const { app, window } = await openApp({ args: [file], size: [1440, 1000] });
  try {
    const panel = window.getByTestId('seam-panel');
    await expect(panel.getByTestId('seam-row')).toHaveCount(1);
    await panel.getByTestId('seam-edit').click();
    await expect(panel.getByTestId('seam-commit')).toBeDisabled();
    await panel
      .getByTestId('seam-side')
      .nth(0)
      .getByTestId('seam-holes')
      .selectOption('outer-holes');
    await panel
      .getByTestId('seam-side')
      .nth(1)
      .getByTestId('seam-holes')
      .selectOption('pocket-holes');
    await expect(panel.getByTestId('seam-commit')).toBeEnabled();
    await panel.getByTestId('seam-commit').click();
    await window.getByTestId('feature-row-outer-holes').click();
    await expect(panel.getByTestId('seam-row')).toHaveCount(1);
    await expect(panel.getByTestId('seam-verdict')).toHaveAttribute('data-severity', 'error');
    await window.getByTestId('undo').click();
    await expect(panel.getByTestId('seam-verdict')).toContainText('missing');
    await panel.getByTestId('seam-unsew').click();
    await expect(window.getByTestId('seam-row')).toHaveCount(0);
    await window.getByTestId('undo').click();
    await expect(panel.getByTestId('seam-row')).toHaveCount(1);
    await expectNoViolations(window, 'orphaned seam controls');
  } finally {
    await closeApp(app);
  }
});
