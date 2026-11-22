import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { diagnose } from '../packages/domain/src/index.js';
import { boardMap } from './boardMap.js';
import { closeApp } from './closeApp.js';
import {
  drawRectangle,
  enter,
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
import { expectNoViolations, openApp, positionField } from './launchApp.js';
import { piecesInPdf } from './pdfPieces.js';

/**
 * R16, the first manufacturing journey: the card holder from a blank project
 * to its PDF, by the steps a maker takes — two rectangles typed to size, each
 * stitched and punched from the selection bar, the pocket left open at the
 * top, placed with a guide and the arrow keys, its three sides sewn to the
 * outer — and checked as leatherwork: the holes each piece has, each seam's
 * verdict, nothing to fix, and the PDF measured piece by piece. It is the
 * card holder template's construction (docs/template-audit.md), made by hand.
 *
 * The paper half — cut once, stitched, the holes lining up — is the
 * maintainer's, in docs/print-verification-log.md § *A card holder from blank*.
 */

test('a card holder from blank to PDF: nudge, a guide and its seams, holes lining up (R16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-r16-card-holder-'));
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    const fields = panel(window);

    // ── The outer: 105 × 70, 4 mm corners, stitched 3 mm in all round ──────
    await drawRectangle(window, [200, 150, 420, 300]);
    await shapePiece(window, { name: 'Outer', width: 105, height: 70, radii: [4, 4, 4, 4] });
    await enter(positionField(window, 'Left'), '0');
    await enter(positionField(window, 'Bottom'), '0');
    await stitchAndPunch(window, 3);
    await expect(featureRow(window, 'Outer', 'Stitch holes')).toContainText('86');

    // ── The pocket: 105 × 47.3487, top corners 3 mm, open at the top, cut 2 ─
    await drawRectangle(window, [500, 450, 700, 560]);
    await shapePiece(window, {
      name: 'Pocket',
      width: 105,
      height: 47.3487,
      radii: [3, 3, 4, 4],
    });
    await enter(fields.getByRole('textbox', { name: 'Cut, number of pieces' }), '2');
    await enter(positionField(window, 'Left'), '10');
    await enter(positionField(window, 'Bottom'), '-70');
    await stitchAndPunch(window, 3, 'Open at the top');
    await expect(featureRow(window, 'Pocket', 'Stitch holes')).toContainText('49');
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');

    // ── A level guide 10 mm under the outer, and the pocket's top on it ─────
    await window.getByTestId('zoom-fit').click();
    await window.getByTestId('tool-guide').click();
    const canvas = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.click(canvas.x + 100, canvas.y + canvas.height / 2);
    await enter(window.getByTestId('guide-editor').getByLabel('Guide y'), '-10');
    await window.getByTestId('tool-select').click();
    const board = await boardMap(window);
    // Its top is at −22.65: carried 12 mm up by its body, raw it would stop
    // 0.65 mm under the guide, and the guide takes it.
    const from = board({ x: 70, y: -46 });
    const to = board({ x: 70, y: -34 });
    await window.mouse.move(from.x, from.y);
    await window.mouse.down();
    await window.mouse.move(to.x, to.y, { steps: 8 });
    await window.mouse.up();
    await expect(window.getByTestId('property-header')).toContainText('Pocket');
    const position = fields.getByTestId('position-fields');
    await expect(position.getByLabel('Bottom')).toHaveValue('−57.35');
    await expect(position.getByLabel('Left')).toHaveValue('10');

    // ── Nudged 10 mm left with Shift+←: square under the outer ─────────────
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Shift+ArrowLeft');
    await expect(position.getByLabel('Left')).toHaveValue('0');

    // ── Sewn: the pocket's three sides to the outer, one seam each ─────────
    const sewSide = async (
      a: Parameters<typeof sew>[1],
      b: Parameters<typeof sew>[2],
    ): Promise<void> => {
      await featureRow(window, 'Pocket', 'Stitch holes').click();
      await featureRow(window, 'Outer', 'Stitch holes').click({ modifiers: ['Shift'] });
      await sew(window, a, b);
    };
    const pocket = 'Pocket › Stitch holes';
    const outer = 'Outer › Stitch holes';
    await sewSide(
      { holes: pocket, between: ['3', 'start'] },
      { holes: outer, from: '3', toward: 'previous' },
    );
    await sewSide({ holes: pocket, between: ['3', '0'] }, { holes: outer, between: ['3', '0'] });
    await sewSide(
      { holes: pocket, between: ['0', 'end'] },
      { holes: outer, from: '0', toward: 'next' },
    );

    await featureRow(window, 'Pocket', 'Stitch holes').click();
    const verdicts = window.getByTestId('seam-panel').getByTestId('seam-verdict');
    await expect(verdicts).toHaveText([
      /12 = 12 holes · drift 0 mm/,
      /27 = 27 holes · drift 0 mm/,
      /12 = 12 holes · drift 0 mm/,
    ]);
    for (const verdict of await verdicts.all()) {
      await expect(verdict).toHaveAttribute('data-severity', 'info');
    }
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');
    await expectNoViolations(window, 'a card holder sewn from blank');

    // ── Saved: what the file holds, read back through persist and domain ───
    const project = await saveAs(app, window, join(dir, 'Card holder.lcp'));
    expect(diagnose(project)).toEqual([]);
    expect(holeCounts(project)).toEqual({
      'Outer › Stitch holes': 86,
      'Pocket › Stitch holes': 49,
    });
    expect(seamVerdicts(project)).toEqual([
      '12/12 0.00 info',
      '27/27 0.00 info',
      '12/12 0.00 info',
    ]);
    const guide = project.guides?.[0];
    expect(guide).toMatchObject({ origin: { y: -10 }, angleRad: 0 });
    const pocketOutline = project.parts
      .find((part) => part.name === 'Pocket')
      ?.features.find((feature) => feature.kind === 'cut-contour');
    expect(pocketOutline?.source).toMatchObject({
      kind: 'shape',
      shape: { origin: { x: 0, y: -57.3487 }, width: 105, height: 47.3487 },
    });

    // With nothing selected, the summary: three to cut, 86 + 2 × 49 holes.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Escape');
    const summary = fields.getByTestId('production-summary');
    await expect(summary.getByTestId('production-pieces')).toHaveText('3pieces');
    await expect(summary.getByTestId('production-holes')).toHaveText('184holes');

    // ── The PDF, measured: each piece's size and holes, on its sheet ───────
    const pdf = join(dir, 'Card holder.pdf');
    await exportPdfTo(app, window, pdf);
    const pieces = piecesInPdf(pdf);
    expect(pieces.map((p) => [size(p.widthMm, p.heightMm), p.holes])).toEqual([
      ['105.000 × 70.000', 86],
      ['105.000 × 47.349', 49],
    ]);
  } finally {
    await window.screenshot({ path: test.info().outputPath('card-holder.png') });
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
