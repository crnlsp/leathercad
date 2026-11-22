import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import {
  drawRectangle,
  enter,
  expectDiagnostics,
  exportPdfTo,
  featureRow,
  holeCounts,
  panel,
  saveAs,
  seamVerdicts,
  sew,
  shapePiece,
  size,
  stitchAndPunch,
} from './journeys.js';
import { expectNoViolations, openApp } from './launchApp.js';
import { piecesInPdf } from './pdfPieces.js';
import { fromProjectMenu, renameProject } from './projectMenu.js';

/**
 * R16: a five-piece bag, from a blank project. A front stitched round three
 * sides, duplicated for the back and sewn to it; a strap and a closure tab;
 * and an inside pocket copied from the card holder open in another tab and
 * pasted in. Checked as leatherwork — each piece's holes, the seam's verdict,
 * nothing to fix — and its PDF measured piece by piece.
 */

test('a five-piece bag, with a pocket copied from another tab: sewn, checked and measured (R16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-r16-bag-'));
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    const fields = panel(window);
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    await renameProject(window, 'Bag');

    // ── Front, 160 × 120, stitched 4 mm in round three sides ───────────────
    await drawRectangle(window, [150, 150, 350, 300]);
    await shapePiece(window, { name: 'Front', width: 160, height: 120, radii: [4, 4, 10, 10] });
    await stitchAndPunch(window, 4, 'Open at the top');

    // ── Back: the front duplicated, and named ───────────────────────────────
    await window.locator('[data-testid^="part-heading-"]', { hasText: 'Front' }).click();
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('ControlOrMeta+D');
    await expect(window.getByTestId('part-count')).toHaveText('2');
    await fields.getByTestId('part-name').fill('Back');

    // ── A strap and a closure tab, stitched all round ──────────────────────
    await drawRectangle(window, [150, 500, 450, 540]);
    await shapePiece(window, { name: 'Strap', width: 200, height: 20, radii: [10, 10, 10, 10] });
    await stitchAndPunch(window, 3);
    await drawRectangle(window, [550, 450, 620, 560]);
    await shapePiece(window, { name: 'Tab', width: 40, height: 60, radii: [5, 5, 5, 5] });
    await stitchAndPunch(window, 3);
    await expect(window.getByTestId('part-count')).toHaveText('4');

    // ── The inside pocket, copied from the card holder in another tab ──────
    await fromProjectMenu(window, 'new-template');
    await window.getByTestId('template-builtin:card-holder').dblclick();
    await expect(tabs).toHaveCount(2);
    await window.locator('[data-testid^="part-heading-"]', { hasText: 'Pocket' }).click({
      button: 'right',
    });
    await window.getByTestId('context-copy-pieces').click();
    await tabs.first().click();
    await expect(window.getByTestId('project-name')).toHaveText('Bag');
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.focus();
    await window.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await window.keyboard.press('ControlOrMeta+V');
    await expect(window.getByTestId('part-count')).toHaveText('5');
    await expect(fields.getByTestId('part-name')).toHaveValue('Pocket');
    // One inside the bag, where the card holder cut two.
    await enter(fields.getByRole('textbox', { name: 'Cut, number of pieces' }), '1');

    // ── Front sewn to back, along the whole of their stitching ─────────────
    await featureRow(window, 'Front', 'Stitch holes').click();
    await featureRow(window, 'Back', 'Stitch holes').click({ modifiers: ['Shift'] });
    await sew(
      window,
      { holes: 'Front › Stitch holes', between: ['start', 'end'] },
      { holes: 'Back › Stitch holes', between: ['start', 'end'] },
    );
    await featureRow(window, 'Front', 'Stitch holes').click();
    const verdict = window.getByTestId('seam-panel').getByTestId('seam-verdict');
    await expect(verdict).toHaveText(/98 = 98 holes · drift 0 mm/);
    await expect(verdict).toHaveAttribute('data-severity', 'info');
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');
    await expectNoViolations(window, 'a five-piece bag');

    // ── What the file holds ─────────────────────────────────────────────────
    const project = await saveAs(app, window, join(dir, 'Bag.lcp'));
    expect(project.parts.map((part) => `${part.name} ×${part.quantity}`)).toEqual([
      'Front ×1',
      'Back ×1',
      'Strap ×1',
      'Tab ×1',
      'Pocket ×1',
    ]);
    expectDiagnostics(project, []);
    expect(holeCounts(project)).toEqual({
      'Front › Stitch holes': 98,
      'Back › Stitch holes': 98,
      'Strap › Stitch holes': 105,
      'Tab › Stitch holes': 46,
      'Pocket › Stitch holes': 49,
    });
    expect(seamVerdicts(project)).toEqual(['98/98 0.00 info']);

    // ── The PDF: five pieces, each its size and its holes ──────────────────
    const pdf = join(dir, 'Bag.pdf');
    await exportPdfTo(app, window, pdf);
    expect(
      piecesInPdf(pdf)
        .map((p) => `${size(p.widthMm, p.heightMm)}, ${p.holes} holes`)
        .sort(),
    ).toEqual([
      '105.000 × 47.349, 49 holes',
      '160.000 × 120.000, 98 holes',
      '160.000 × 120.000, 98 holes',
      '200.000 × 20.000, 105 holes',
      '60.000 × 40.000, 46 holes',
    ]);
  } finally {
    await window.screenshot({ path: test.info().outputPath('bag.png') });
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
