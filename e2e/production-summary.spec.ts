import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

/**
 * 9.12: with nothing selected, Properties says what to cut, punch and buy, and
 * *Copy* puts the same words on the clipboard.
 */
test('Properties says what to cut, punch and buy, and Copy puts it on the clipboard (9.12)', async () => {
  const { app, window } = await openApp({
    args: [resolve('fixtures/projects/card-holder.lcp')],
    size: [1440, 900],
  });
  try {
    const summary = window.getByTestId('property-panel').getByTestId('production-summary');
    await expect(summary.locator('.panel-heading')).toHaveText('Summary');
    await expect(summary.getByTestId('production-pieces')).toHaveText('3pieces');
    await expect(summary.getByTestId('production-holes')).toHaveText('184holes');
    await expect(summary.getByTestId('production-thread')).toHaveText('1.3 mthread');
    await expect(summary.getByTestId('production-leather')).toHaveText('1.7dm²');
    // No hardware, so no hardware list.
    await expect(summary.getByTestId('production-hardware')).toHaveCount(0);
    await expect(summary.getByTestId('production-cut-list').getByRole('listitem')).toHaveText([
      'Outer×1',
      'Pocket×2',
    ]);
    // The estimate gives its rule in the thread's tooltip.
    await summary.getByTestId('production-thread').hover();
    await expect(window.getByRole('tooltip')).toContainText('An estimate: 4 × 324 mm');

    await summary.getByTestId('production-copy').click();
    await expect(summary.getByTestId('production-copy-status')).toHaveText('Copied');
    // Windows' clipboard stores text with CRLF line ends, and reads it back so (#280).
    const copied = (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(
      /\r\n/g,
      '\n',
    );
    const name = await window.getByTestId('job-totals').locator('.panel-heading').innerText();
    expect(copied).toBe(
      [
        `${name}: production`,
        'To cut: 3',
        '  Outer ×1, 86 holes',
        '  Pocket ×2, 49 holes',
        'Holes to punch: 184',
        'Hardware: None',
        'Thread: about 1.3 m',
        '  An estimate: 4 × 324 mm of stitching, rounded up to the next 10 cm.',
        'Leather, net: about 173 cm² (1.73 dm²)',
        '  Net of cut-outs, not what to buy: waste, grain and flaws are yours to allow.',
      ].join('\n'),
    );

    await expectNoViolations(window, 'the production summary');
  } finally {
    await closeApp(app);
  }
});
