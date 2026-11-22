import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import {
  enter,
  expectDiagnostics,
  exportPdfTo,
  featureRow,
  holeCounts,
  panel,
  saveAs,
  size,
} from './journeys.js';
import { expectNoViolations, openApp, openSample } from './launchApp.js';
import { piecesInPdf } from './pdfPieces.js';

/**
 * R16: the bifold from its template, to its PDF. Its seams are the ones the
 * template declares, which are none (seams spec §2, D20): the card pockets
 * are punched through the lining with the outer, as a stack, so no edge of
 * one is sewn to holes of another, and nothing is checked or flagged. Asked
 * to sew a pocket to the outer's own stitching, the verdict says the two do
 * not pair, and nothing is kept. Its pocket holds a payment card, and the
 * PDF carries the outer, the lining with its two slots and the pocket.
 */

test('the bifold from its template: its seams, a card that fits, and the PDF measured (R16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-r16-bifold-'));
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    await openSample(window);
    const fields = panel(window);
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');

    // ── Its seams: none declared ────────────────────────────────────────────
    await featureRow(window, 'Card pocket', 'Stitch holes').click();
    const seams = window.getByTestId('seam-panel');
    await expect(seams.getByTestId('seam-row')).toHaveCount(0);

    // Sewn to the outer's stitching along its bottom, the holes do not pair:
    // 24 on the pocket's bottom, 51 on the outer's foot. Cancelled, nothing kept.
    await featureRow(window, 'Outer', 'Stitch holes').click({ modifiers: ['Shift'] });
    await seams.getByTestId('sew-together').click();
    const sides = seams.getByTestId('seam-side');
    await sides
      .nth(0)
      .getByTestId('seam-holes')
      .selectOption({ label: 'Card pocket › Stitch holes' });
    await sides.nth(0).getByTestId('seam-where').selectOption('between');
    await sides.nth(0).getByLabel('From', { exact: true }).selectOption('0');
    await sides.nth(0).getByLabel('To', { exact: true }).selectOption('1');
    await sides.nth(1).getByTestId('seam-holes').selectOption({ label: 'Outer › Stitch holes' });
    await sides.nth(1).getByTestId('seam-where').selectOption('between');
    await sides.nth(1).getByLabel('From', { exact: true }).selectOption('3');
    await sides.nth(1).getByLabel('To', { exact: true }).selectOption('0');
    const verdict = seams.getByTestId('seam-verdict');
    await expect(verdict).toHaveText(/24 ≠ 51 holes/);
    await expect(verdict).toHaveAttribute('data-severity', 'error');
    await seams.getByTestId('seam-cancel').click();
    await expect(seams.getByTestId('seam-row')).toHaveCount(0);
    await expect(window.getByTestId('undo')).toBeDisabled();

    // ── The pocket holds a payment card, with 3 mm of ease: 89 mm across ───
    await featureRow(window, 'Card pocket', 'Stitch line').click();
    await expect(fields.getByTestId('pocket-width')).toHaveText('89 mm');
    await fields.getByTestId('pocket-holds').selectOption('id-1');
    await enter(fields.getByRole('textbox', { name: 'Ease' }), '3');
    await expect(fields.getByTestId('pocket-across')).toHaveText(
      'Fits: 89 mm across for 85.6 mm and 3 mm ease.',
    );
    await expect(fields.getByTestId('feature-problems')).toHaveCount(0);
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');
    await expectNoViolations(window, 'the bifold’s pocket holding a card');

    // ── What the file holds ─────────────────────────────────────────────────
    const project = await saveAs(app, window, join(dir, 'Bifold.lcp'));
    expect(project.seams ?? []).toEqual([]);
    expectDiagnostics(project, []);
    expect(holeCounts(project)).toEqual({
      'Outer › Stitch holes': 146,
      'Card pocket › Stitch holes': 52,
    });

    // With nothing selected, the summary counts the pocket twice.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Escape');
    const summary = fields.getByTestId('production-summary');
    await expect(summary.getByTestId('production-pieces')).toContainText('To cut4');
    await expect(summary.getByTestId('production-holes')).toHaveText('Holes to punch250');

    // ── The PDF: each piece, its size and holes, and the lining's slots ────
    const pdf = join(dir, 'Bifold.pdf');
    await exportPdfTo(app, window, pdf);
    expect(
      piecesInPdf(pdf)
        .map((p) => `${size(p.widthMm, p.heightMm)}, ${p.holes} holes, ${p.cutOuts} cut-outs`)
        .sort(),
    ).toEqual([
      '200.000 × 95.000, 0 holes, 2 cut-outs',
      '200.000 × 95.000, 146 holes, 0 cut-outs',
      '95.000 × 60.000, 52 holes, 0 cut-outs',
    ]);
  } finally {
    await window.screenshot({ path: test.info().outputPath('bifold.png') });
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
