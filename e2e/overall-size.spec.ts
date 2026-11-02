import { expect, test } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';

/**
 * Q15: a piece's overall size is something the maker asks for. A selected
 * outline offers *Add overall size*, which dimensions its width and height
 * edge to edge in one step of undo; a dimension between two corners still
 * measures between those corners.
 */
test('an outline takes its overall size, read from the outline and undone in one step', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const panel = window.getByTestId('property-panel');
    const set = async (label: string, value: string): Promise<void> => {
      const input = panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
      await input.fill(value);
      await input.press('Enter');
    };
    await set('Width', '97');
    await set('Height', '67');
    await expectNoViolations(window, 'an outline offering its overall size');

    await panel.getByTestId('add-overall-size').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');

    const dimensions = window.getByTestId('parts-list').getByText('Dimension');
    await dimensions.first().click();
    await expect(panel.getByTestId('dimension-value')).toHaveText('97.0 mm');
    await dimensions.last().click();
    await expect(panel.getByTestId('dimension-value')).toHaveText('67.0 mm');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('1');
  });
});
