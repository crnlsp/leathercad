import { expect, test } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';

/**
 * 4.14: a row of holes along a line that is not a stitch line. A marking line
 * drawn on a piece offers *Add a row of holes*; the row reads its pitch, its
 * diameter and what they came out as, and every change is one step of undo.
 */
test('a marking line takes a row of holes, edited in Properties and undone a step at a time', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const panel = window.getByTestId('property-panel');
    const field = (label: string) =>
      panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
    const set = async (label: string, value: string): Promise<void> => {
      await field(label).fill(value);
      await field(label).press('Enter');
    };

    // A line across the middle of the panel, on the panel: Marking mode, with
    // the panel selected as the part it goes on.
    await window.getByTestId('tool-line').click();
    await window.getByTestId('draw-as-marking').click();
    await expect(window.getByTestId('draw-as-marking')).toHaveAttribute('aria-pressed', 'true');
    await window.mouse.click(box.x + 170, box.y + 205);
    await window.mouse.click(box.x + 280, box.y + 205);
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(panel).toContainText('Marking line');
    const lengthMm = Number.parseFloat(
      (await panel.getByTestId('measured-length').textContent()) ?? '',
    );
    expect(lengthMm).toBeGreaterThan(0);

    await panel.getByTestId('add-hole-row').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await expect(panel.getByTestId('property-trail')).toHaveText(/› Row of holes$/);

    // Five holes at 25 mm and a 4 mm punch to start with: a hole on each end
    // of the line and the rest evenly between, as many as the line holds.
    await expect(field('Pitch')).toHaveValue('25');
    await expect(field('Diameter')).toHaveValue('4');
    await expect(panel.getByTestId('hole-count')).toHaveText(
      String(Math.max(1, Math.round(lengthMm / 25)) + 1),
    );

    // A pitch of half the line is three holes: both ends and the middle.
    await set('Pitch', String(lengthMm / 2));
    await expect(panel.getByTestId('hole-count')).toHaveText('3');
    await set('Diameter', '6');
    await expect(field('Diameter')).toHaveValue('6');
    await expectNoViolations(window, 'a row of holes in Properties');

    // Each edit is a step: the diameter, the pitch, then the row itself.
    await window.getByTestId('undo').click();
    await expect(field('Diameter')).toHaveValue('4');
    await window.getByTestId('undo').click();
    await expect(field('Pitch')).toHaveValue('25');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await window.getByTestId('redo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
  });
});
