import { expect, test, type Page } from '@playwright/test';

import { withApp } from './launchApp.js';
import { chooseSvg, chooseSvgFile } from './svgPatterns.js';
import { expectPieces } from './counts.js';

/**
 * 9.20c: an SVG file is untrusted input (ADR 0023). The hostile-file corpus,
 * against Electron's own parser: what would expand, reach outside or overflow
 * is refused, and nothing changes; what would run or fetch is left out,
 * listed, and neither runs nor fetches. The checks before the parser are
 * unit-tested in `packages/import/src/text.test.ts`; this is the whole path.
 */

const SVG = 'xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60"';
const OUTLINE = '<rect width="100" height="60"/>';
const svg = (inside: string, doctype = '') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}<svg ${SVG}>${OUTLINE}${inside}</svg>`;

const laughs = Array.from(
  { length: 9 },
  (_, i) => `<!ENTITY lol${String(i + 1)} "${`&lol${String(i)};`.repeat(10)}">`,
).join('');

/** Each refused before anything reaches a project, with the words that say why. */
const REFUSED: readonly { name: string; contents: () => string | Uint8Array; says: string }[] = [
  {
    name: 'billion-laughs',
    contents: () => svg('<desc>&lol9;</desc>', `<!DOCTYPE svg [<!ENTITY lol0 "lol">${laughs}]>`),
    says: 'entities would expand it past 32 MB',
  },
  {
    // Measured: Chromium's parser alone holds the window for seconds on this.
    name: 'quadratic-entity',
    contents: () =>
      svg(
        `<desc>${'&big;'.repeat(50_000)}</desc>`,
        `<!DOCTYPE svg [<!ENTITY big "${'x'.repeat(50_000)}">]>`,
      ),
    says: 'entities would expand it past 32 MB',
  },
  {
    name: 'external-entity',
    contents: () =>
      svg(
        '<desc>&secret;</desc>',
        '<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///etc/hostname">]>',
      ),
    says: 'could reach other files',
  },
  {
    name: 'parameter-entity',
    contents: () =>
      svg(
        '<desc>&x;</desc>',
        `<!DOCTYPE svg [<!ENTITY % p SYSTEM "http://hostile.invalid/x.dtd"> %p;]>`,
      ),
    says: 'could reach other files',
  },
  {
    // Past the parser's own nesting guard, which refuses it as malformed.
    name: 'deep-nesting',
    contents: () => svg(`${'<g>'.repeat(100_000)}${'</g>'.repeat(100_000)}`),
    says: 'could not be read as an SVG drawing',
  },
  {
    name: 'over-32-mib',
    contents: () => svg(`<desc>${'x'.repeat(32 * 2 ** 20)}</desc>`),
    says: 'larger than 32 MB',
  },
];

async function chooseImport(window: Page): Promise<void> {
  await window.getByTestId('project-menu').click();
  await window.getByTestId('import-svg').click();
}

test('the hostile-file corpus is refused, and nothing changes (9.20c)', async () => {
  test.setTimeout(120_000);
  await withApp(async (window, app) => {
    for (const { name, contents, says } of REFUSED) {
      await test.step(name, async () => {
        await chooseSvgFile(app, name, contents());
        await chooseImport(window);
        const notice = window.getByTestId('file-notice');
        await expect(notice).toContainText(says);
        await window.getByTestId('file-notice-close').click();
        await expect(notice).toHaveCount(0);
        await expect(window.getByTestId('svg-import-dialog')).toHaveCount(0);
        await expectPieces(window, '0');
      });
    }
  });
});

test('a number past a double is refused in the preview, never imported as infinity (9.20c)', async () => {
  await withApp(async (window, app) => {
    await chooseSvgFile(app, 'huge-number', svg('<path d="M0 0L1e400 10"/>'));
    await chooseImport(window);
    const dialog = window.getByTestId('svg-import-dialog');
    await expect(dialog.getByRole('alert')).toHaveText(
      'This file could not be read as an SVG drawing.',
    );
    await expect(dialog.getByTestId('svg-import-new')).toBeDisabled();
  });
});

test('a drawing too large for a project is refused in the preview, and the open work stays (QA F3)', async () => {
  await withApp(async (window, app) => {
    await chooseSvg(app, 'cardHolder');
    await chooseImport(window);
    const dialog = window.getByTestId('svg-import-dialog');
    await dialog.getByTestId('svg-import-open').click();
    await expectPieces(window, '1');

    // A thousand small squares: their names pass the characters a project holds.
    const squares = Array.from(
      { length: 1000 },
      (_, i) =>
        `<rect x="${String((i % 25) * 4)}" y="${String(Math.floor(i / 25) * 1.5)}" width="2" height="1"/>`,
    ).join('');
    await chooseSvgFile(
      app,
      'thousand-shapes',
      `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">${squares}</svg>`,
    );
    await chooseImport(window);
    await expect(dialog.getByRole('alert')).toHaveText(
      'This drawing is too large to import: its pieces and their names come to more than 20,000 characters.',
    );
    await expect(dialog.getByTestId('svg-import-open')).toBeDisabled();
    await expect(dialog.getByTestId('svg-import-new')).toBeDisabled();
    await dialog.getByTestId('svg-import-cancel').click();
    await expect(dialog).toHaveCount(0);
    await expectPieces(window, '1');
    await expect(window.getByTestId('parts-list')).toContainText('cardHolder');
  });
});

test('scripts, links and embedded content are listed as left out, never run or fetched (9.20c)', async () => {
  await withApp(async (window, app) => {
    const requests: string[] = [];
    window.on('request', (request) => requests.push(request.url()));
    const hostile = svg(
      `<script>window.top.pwned = 1</script>
       <script href="http://hostile.invalid/x.js"/>
       <style>@import url("http://hostile.invalid/a.css"); rect { fill: url(http://hostile.invalid/f.svg#f) }</style>
       <image href="http://hostile.invalid/a.png" width="10" height="10"/>
       <image href="file:///etc/hostname" width="10" height="10"/>
       <use href="http://hostile.invalid/other.svg#shape"/>
       <a href="javascript:window.top.pwned=1"><rect x="5" y="5" width="5" height="5"/></a>
       <foreignObject width="10" height="10"><iframe xmlns="http://www.w3.org/1999/xhtml" src="http://hostile.invalid/"/></foreignObject>
       <defs><clipPath id="c"><rect width="5" height="5"/></clipPath><filter id="f"/></defs>
       <text x="5" y="55" onload="window.top.pwned = 1">card</text>`,
      '<?xml-stylesheet href="http://hostile.invalid/s.css"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://hostile.invalid/svg11.dtd">\n',
    ).replace('<svg ', '<svg onload="window.top.pwned = 1" ');
    await chooseSvgFile(app, 'active-content', hostile);
    await chooseImport(window);

    const dialog = window.getByTestId('svg-import-dialog');
    await expect(dialog.getByTestId('svg-import-pieces')).toHaveText('1 piece');
    const leftOut = dialog.getByTestId('svg-import-left-out');
    for (const line of [
      '2 scripts, not run',
      '2 images, not loaded',
      '1 clone or linked shape, not followed',
      '1 piece of embedded web content, not loaded',
      '1 clip, not applied: what it hid arrives whole',
      '1 filter effect',
      '1 piece of text',
      '1 “a” element',
    ])
      await expect(leftOut).toContainText(line);

    await dialog.getByTestId('svg-import-open').click();
    await expectPieces(window, '1');
    expect(await window.evaluate(() => 'pwned' in window)).toBe(false);
    expect(requests.filter((url) => url.includes('hostile') || url.startsWith('file:'))).toEqual(
      [],
    );
  });
});

test('older Illustrator files, which declare entities, and UTF-16 files read (9.20c)', async () => {
  await withApp(async (window, app) => {
    const illustrator = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
	<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
	<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
	<!ENTITY st0 "fill:none;stroke:#000000;">
]>
<svg ${SVG} xmlns:x="&ns_extend;" xmlns:i="&ns_ai;"><rect style="&st0;" width="100" height="60"/></svg>`;
    const text = svg('');
    const utf16 = new Uint8Array(2 + 2 * text.length);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++)
      utf16.set([text.charCodeAt(i) & 0xff, text.charCodeAt(i) >> 8], 2 + 2 * i);

    for (const [name, contents] of [
      ['illustrator', illustrator],
      ['utf-16', utf16],
    ] as const) {
      await test.step(name, async () => {
        await chooseSvgFile(app, name, contents);
        await chooseImport(window);
        const dialog = window.getByTestId('svg-import-dialog');
        await expect(dialog.getByTestId('svg-import-size')).toHaveText('100.0 × 60.0 mm');
        await dialog.getByTestId('svg-import-cancel').click();
        await expect(dialog).toHaveCount(0);
      });
    }
  });
});

test('a file near the byte ceiling says it is being read, then previews (9.20c)', async () => {
  await withApp(async (window, app) => {
    await chooseSvgFile(app, 'near-ceiling', svg(`<desc>${'x'.repeat(30 * 2 ** 20)}</desc>`));
    // Watched from inside the window: the parser holds it, so polling from
    // outside could miss the moment the indicator is shown.
    await window.evaluate(() => {
      new MutationObserver((_, observer) => {
        if (document.querySelector('[data-testid="svg-import-reading"]') !== null) {
          document.body.dataset['sawReading'] = 'yes';
          observer.disconnect();
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await chooseImport(window);
    await expect(
      window.getByTestId('svg-import-dialog').getByTestId('svg-import-pieces'),
    ).toHaveText('1 piece');
    await expect(window.locator('body')).toHaveAttribute('data-saw-reading', 'yes');
    await expect(window.getByTestId('svg-import-reading')).toHaveCount(0);
  });
});
