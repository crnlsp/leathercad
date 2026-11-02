import { expect, test } from '@playwright/test';

import { expectNoViolations, withApp } from './launchApp.js';

/**
 * 3.12: a circle cannot be squashed (3.7, X9), and the refusal says where the
 * way out is. *Convert to drawn path* in Properties says plainly what it costs
 * — it stops being a circle — draws exactly what the circle drew, and after it
 * the same squash works. Each is one step of undo.
 */
test('a circle converted to a drawn path can be squashed, and undo brings the circle back', async () => {
  await withApp(async (window) => {
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const panel = window.getByTestId('property-panel');
    const diameter = panel.locator('label', { hasText: /^Diameter/ }).locator('input');
    const perimeter = panel.getByTestId('measured-length');
    const squash = async (): Promise<void> => {
      await window.getByTestId('tool-scale').click();
      await window.mouse.move(box.x + 480, box.y + 300);
      await window.mouse.down();
      await window.mouse.move(box.x + 620, box.y + 300, { steps: 6 });
    };

    await window.getByTestId('tool-circle').click();
    await window.mouse.move(box.x + 400, box.y + 300);
    await window.mouse.down();
    await window.mouse.move(box.x + 480, box.y + 300, { steps: 5 });
    await window.mouse.up();
    const typed = await diameter.inputValue();
    const round = await perimeter.textContent();

    // Refused, and the reason names the way out while the drag is still on.
    await squash();
    await expect(window.getByTestId('tool-notice')).toContainText(/ellipse/i);
    await expect(window.getByTestId('tool-notice')).toContainText(/drawn path/i);
    await window.mouse.up();
    await expect(diameter).toHaveValue(typed);

    // The cost is said beside the button, not hidden in a tooltip.
    await window.getByTestId('tool-select').click();
    await expect(panel.getByTestId('convert-to-path-note')).toContainText(/stops being a circle/i);
    await expectNoViolations(window, 'a circle offering to become a drawn path');
    await panel.getByTestId('convert-to-path').click();

    // A drawn path now: no diameter to type, the same curve to measure.
    await expect(diameter).toHaveCount(0);
    await expect(panel.getByTestId('convert-to-path')).toHaveCount(0);
    await expect(perimeter).toHaveText(round!);

    // The squash 3.7 refused now goes through.
    await squash();
    await window.mouse.up();
    await expect(perimeter).not.toHaveText(round!);

    // One step each: the squash, then the conversion.
    await window.getByTestId('undo').click();
    await expect(perimeter).toHaveText(round!);
    await expect(diameter).toHaveCount(0);
    await window.getByTestId('undo').click();
    await expect(diameter).toHaveValue(typed);
  });
});
