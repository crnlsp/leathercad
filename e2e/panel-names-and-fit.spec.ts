import { expect, test, type Locator, type Page } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp, withSample } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';
import { resizeWindow } from './windowSize.js';

/**
 * QA9 and QA11: what a screen reader hears of the Parts tree and Properties
 * (U8, U10, U19), a checkbox beside its words at 1440 and 860 (U18), and a folded
 * panel's chip (U21). Names in Parts still wrap between words, never cut (F.6):
 * the maintainer kept that over U18's one-line rows; `sample.spec.ts` holds it.
 */

const piece = (window: Page, id: string): Locator => window.getByTestId(`part-heading-${id}`);

test('the eye is named for what it does and is not also "pressed" (U8)', async () => {
  await withSample(async (window) => {
    // The feature first: a hidden piece shows its features hidden too.
    for (const eye of [
      window.getByTestId('feature-visible-outer-outline'),
      window.getByTestId('part-visible-outer'),
    ]) {
      // A visible piece must not read as hidden: name and state do not both flip.
      await expect(eye).not.toHaveAttribute('aria-pressed', /.*/);
      await expect(eye).toHaveAccessibleName(/^Hide/);
      await eye.evaluate((button: HTMLElement) => button.click());
      await expect(eye).not.toHaveAttribute('aria-pressed', /.*/);
      await expect(eye).toHaveAccessibleName(/^Show/);
    }
  });
});

test('the Cut field is named by its meaning, not by its "off" (U10)', async () => {
  await withSample(async (window) => {
    await piece(window, 'pocket').click();
    const field = window.getByRole('textbox', { name: 'Cut, number of pieces' });
    await expect(field).toHaveValue('2');
    await expect(window.getByText('off', { exact: true })).toBeVisible();
  });
});

test('Save as template is a dialog on a wrapper, and axe finds nothing (U19)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await fromProjectMenu(window, 'save-template');
    const dialog = window.getByTestId('save-template-dialog');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    expect(await dialog.evaluate((element) => element.tagName)).not.toBe('FORM');
    await expectNoViolations(window, 'the Save as template dialog');
  });
});

for (const [width, height] of [
  [1440, 900],
  [860, 600],
] as const) {
  test(`the mirrored-pair box sits beside its words at ${String(width)} × ${String(height)} (U18)`, async () => {
    await withSample(async (window, app) => {
      await resizeWindow(app, window, width, height);
      const narrow = width < 1000;
      if (narrow) await window.getByTestId('toggle-parts').click();
      // The full name is also the row's title, for the pointer.
      await expect(piece(window, 'pocket').locator('.part-label')).toHaveAttribute(
        'title',
        'Card pocket',
      );
      await piece(window, 'pocket').click();
      if (narrow) await window.getByTestId('toggle-properties').click();
      const box = window.getByTestId('part-mirrored-pair');
      const label = box.locator('xpath=preceding-sibling::span[1]');
      const [b, l] = await Promise.all([box.boundingBox(), label.boundingBox()]);
      const apart = Math.abs(b!.y + b!.height / 2 - (l!.y + l!.height / 2));
      expect(apart, 'the box is on the label’s line').toBeLessThan(l!.height / 2);
      expect(l!.height, 'the label is one line').toBeLessThan(24);
    });
  });
}

test('a folded panel’s status-bar chip is muted, not outlined in the accent (U21)', async () => {
  await withSample(async (window, app) => {
    await resizeWindow(app, window, 860, 600);
    for (const id of ['toggle-parts', 'toggle-properties']) {
      const chip = window.getByTestId(id);
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
      const look = await chip.evaluate((element) => {
        const probe = (token: string): string => {
          const span = document.createElement('span');
          span.style.color = `var(${token})`;
          document.body.append(span);
          const colour = getComputedStyle(span).color;
          span.remove();
          return colour;
        };
        const style = getComputedStyle(element);
        return {
          border: style.borderTopColor,
          style: style.borderTopStyle,
          tan: probe('--tan'),
        };
      });
      expect(look.border, id).not.toBe(look.tan);
      expect(look.style, id).toBe('dashed');
    }
  });
});
