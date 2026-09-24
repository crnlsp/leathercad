import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 6.4a: choose the paper.
 *
 * Before it, every export was A4 portrait, and the only answer to a strap too
 * long for A4 was a message naming a paper the maker had no way to choose. This
 * walks that workflow: a strap that does not fit — tiled across two sheets
 * since 7.2a — the paper turned, exported again whole at 1:1, and the choice
 * kept with the project.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

function field(window: Page, label: string) {
  return window
    .getByTestId('property-panel')
    .locator('label', { hasText: new RegExp(`^${label}`) })
    .locator('input');
}

async function type(window: Page, label: string, value: number): Promise<void> {
  await field(window, label).fill(String(value));
  await field(window, label).press('Enter');
}

function pageCount(pdf: string): number {
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  return Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
}

/** The sheet size pdfinfo reads from the file, in points. */
function pageSize(pdf: string): string {
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  return /Page size:\s+([\d.]+ x [\d.]+) pts/.exec(info)?.[1] ?? info;
}

test('a strap too long for A4 portrait is printed whole by turning the paper, and the choice is kept', async () => {
  const stamp = Date.now();
  const pdf = join(tmpdir(), `leathercad-e2e-paper-${stamp}.pdf`);
  const project = join(tmpdir(), `leathercad-e2e-paper-${stamp}.lcp`);
  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await app.evaluate(
      ({ dialog, shell }, paths) => {
        // Called as (window, options): the PDF and the project go to their own files.
        dialog.showSaveDialog = async (...args: unknown[]) => ({
          canceled: false,
          filePath: String((args.at(-1) as { defaultPath?: string }).defaultPath).endsWith('.pdf')
            ? paths.pdf
            : paths.project,
        });
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.project] });
        // Do not launch a real PDF viewer during a test run.
        shell.openPath = async () => '';
      },
      { pdf, project },
    );

    const paper = window.getByTestId('paper');
    const chosen = paper.locator('option:checked');

    // A new project prints on what every project printed on before: A4
    // portrait. With nothing drawn, the PDF is one sheet with the scale check,
    // and the paper choice says exactly that (7.4a).
    await expect(paper).toHaveValue('A4 portrait');
    await expect(chosen).toHaveText('1 sheet of A4, portrait, scale check only');

    // A strap, 250 × 100 mm: longer than A4 portrait's 190 mm printable width.
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 330, box.y + 260, { steps: 5 });
    await window.mouse.up();
    await type(window, 'Width', 250);
    await type(window, 'Height', 100);
    await window.getByTestId('part-name').fill('Strap');

    // Before exporting, the paper choice says what the PDF will be, and what
    // turning the paper would give instead.
    await expect(chosen).toHaveText('2 sheets of A4, portrait (Strap taped)');
    await expect(paper.locator('option[value="A4 landscape"]')).toHaveText(
      '1 sheet of A4, landscape',
    );
    await expect(window.getByTestId('sheet-glyph')).toHaveAttribute('data-sheets', '2');

    // Exported on A4 portrait: printed across two sheets at 1:1 (7.2a) — never
    // scaled, never left out — and the notice says so, with the way to print
    // it whole: turning the paper that is already in the printer.
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    const notice = window.getByTestId('export-notice');
    await expect(notice.getByTestId('export-tiled')).toContainText(
      '"Strap" is 250.0 × 100.0 mm, larger than A4 portrait: printed on 2 sheets, 1 × 2. It fits whole on A4 landscape.',
    );
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    expect(pageSize(pdf)).toBe('595.276 x 841.89');
    expect(pageCount(pdf)).toBe(2);
    await notice.getByText('Close').click();
    rmSync(pdf);

    // Turned. The choice is an edit to the project, so it is unsaved…
    await paper.selectOption('A4 landscape');
    await expect(chosen).toHaveText('1 sheet of A4, landscape');
    await expect(window.getByTestId('sheet-glyph')).toHaveAttribute('data-sheets', '1');
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');

    // …one undoable step, not a paper change and a separate turn…
    await window.getByTestId('undo').click();
    await expect(paper).toHaveValue('A4 portrait');
    await window.getByTestId('redo').click();
    await expect(paper).toHaveValue('A4 landscape');

    // …and the export uses it: the sheet is A4 landscape and the strap is on it.
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    await expect(window.getByTestId('export-notice')).toHaveCount(0);
    expect(pageSize(pdf)).toBe('841.89 x 595.276');
    expect(pageCount(pdf)).toBe(1);
    rmSync(pdf);

    // A maker in North America loads Letter. 612 × 792 pt is exactly 8.5 × 11 in.
    await paper.selectOption('Letter landscape');
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    expect(pageSize(pdf)).toBe('792 x 612');

    // Undone like any edit.
    await window.getByTestId('undo').click();
    await expect(paper).toHaveValue('A4 landscape');
    await window.getByTestId('redo').click();
    await expect(paper).toHaveValue('Letter landscape');

    // Saved with the project, and back when it is opened again.
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
    await window.getByTestId('new').click();
    await expect(paper).toHaveValue('A4 portrait');

    await window.getByTestId('open').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(paper).toHaveValue('Letter landscape');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
  } finally {
    await closeApp(app);
    rmSync(pdf, { force: true });
    rmSync(project, { force: true });
  }
});
