import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';
import { expectAccurate, inkOn, measurePrintTest, openPrintTest } from './printTest.js';

/**
 * 7.6: Print → LeatherCAD's Print Preview → the printer.
 *
 * The app drives the system's CUPS client, so these tests put a CUPS client of
 * their own first on its PATH: `lpstat` and `lpoptions` that answer for one
 * A4 printer, and an `lp` that writes down what it was asked and keeps what it
 * was sent. Nothing reaches a real printer.
 *
 * What `lp` keeps is then measured like an exported PDF, so the test proves
 * the bytes the preview showed are the bytes sent, true to size. Where CUPS's
 * own `pdftopdf` is installed it is run on them with the job's options too —
 * the filter that shrank a 100 mm gauge to 96 mm when nothing said not to.
 */

test.skip(process.platform === 'win32', 'no CUPS on Windows: the preview saves a PDF instead');

const PDFTOPDF = '/usr/lib/cups/filter/pdftopdf';

/** A4 with a laser's 4.23 mm margins: what `pdftopdf` fits a page into. */
const A4_PPD = `*PPD-Adobe: "4.3"
*FormatVersion: "4.3"
*FileVersion: "1.0"
*LanguageVersion: English
*LanguageEncoding: ISOLatin1
*PCFileName: "TEST.PPD"
*Manufacturer: "Test"
*Product: "(Test)"
*ModelName: "Test"
*ShortNickName: "Test"
*NickName: "Test"
*PSVersion: "(3010.000) 0"
*ColorDevice: False
*DefaultColorSpace: Gray
*cupsFilter2: "image/urf image/urf 0 -"
*OpenUI *PageSize/Media Size: PickOne
*DefaultPageSize: A4
*PageSize A4: "<</PageSize[595.28 841.89]>>setpagedevice"
*CloseUI: *PageSize
*OpenUI *PageRegion: PickOne
*DefaultPageRegion: A4
*PageRegion A4: "<</PageSize[595.28 841.89]>>setpagedevice"
*CloseUI: *PageRegion
*DefaultImageableArea: A4
*ImageableArea A4: "12 12 583.28 829.89"
*DefaultPaperDimension: A4
*PaperDimension A4: "595.28 841.89"
`;

/** A directory of stand-ins for the CUPS client, and where `lp` leaves its job. */
function fakeCups(lpstat: string): { bin: string; args: string; job: string } {
  const bin = mkdtempSync(join(tmpdir(), 'leathercad-e2e-cups-'));
  const args = join(bin, 'lp-args');
  const job = join(bin, 'job.pdf');
  const tools: Record<string, string> = {
    lpstat,
    lpoptions: `[ "$2" = "LeatherCAD_Test" ] && echo 'PageSize/Media Size: *A4 Letter Custom.WIDTHxHEIGHT'\nexit 0`,
    lp: `printf '%s\\n' "$@" > '${args}'\ncat > '${job}'\necho 'request id is LeatherCAD_Test-7 (1 file(s))'`,
  };
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { bin, args, job };
}

const ONE_PRINTER = `case "$1" in
  -e) echo LeatherCAD_Test ;;
  -d) echo 'system default destination: LeatherCAD_Test' ;;
esac`;

/** The `-o` options of a job, as one string, the way CUPS hands them to a filter. */
const jobOptions = (args: readonly string[]): string =>
  args.filter((_, i) => args[i - 1] === '-o').join(' ');

/** CUPS's own `pdftopdf` run on a job with `options`, as the scheduler would. */
function pdftopdf(dir: string, job: string, options: string): string {
  const out = join(dir, `filtered-${String(options.length)}.pdf`);
  const ppd = join(dir, 'a4.ppd');
  writeFileSync(ppd, A4_PPD);
  writeFileSync(
    out,
    execFileSync(PDFTOPDF, ['1', 'e2e', 'print test', '1', options, job], {
      env: {
        ...process.env,
        PPD: ppd,
        CONTENT_TYPE: 'application/pdf',
        FINAL_CONTENT_TYPE: 'image/urf',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
  return out;
}

/** Each page as poppler reads it: its size in points, and its /Rotate. */
function pagesOf(pdf: string): string[] {
  const info = execFileSync('pdfinfo', ['-f', '1', '-l', '999', pdf], { encoding: 'utf8' });
  const sizes = [...info.matchAll(/^Page\s+\d+ size:\s+(\S+ x \S+)/gm)].map((m) => m[1]!);
  const turns = [...info.matchAll(/^Page\s+\d+ rot:\s+(\d+)/gm)].map((m) => m[1]!);
  return sizes.map((size, i) => `${size} pt, rotated ${turns[i] ?? '?'}`);
}

test('Print previews the PDF, then sends those bytes to lp with scaling off', async () => {
  const cups = fakeCups(ONE_PRINTER);
  const app = await launchApp({ env: { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openPrintTest(app, window, join(cups.bin, 'unused.pdf'));

    await expect(window.getByTestId('print')).toHaveClass(/primary/);
    await window.getByTestId('print').click();
    const preview = window.getByTestId('print-preview');
    await expect(preview).toBeVisible();

    // The PDF itself, drawn by pdf.js: three sheets, and the first one large.
    await expect(preview.getByTestId('print-thumb')).toHaveCount(3);
    await expect
      .poll(() => preview.getByTestId('print-page').locator('canvas').evaluate(inkOn))
      .toBeGreaterThan(1000);

    await expect(preview.getByTestId('print-printer')).toHaveValue('LeatherCAD_Test');
    await expect(preview.getByTestId('print-summary')).toHaveText('3 sheets of A4, portrait');
    await expect(preview.getByTestId('print-scale')).toHaveText('100 % — locked');
    await expect(preview.getByTestId('print-no-scaling')).toContainText('No scaling');
    await expect(preview.getByTestId('export-tiled')).toContainText('Strap');
    // Nothing that could scale is on offer: printer, paper, which way up and
    // copies are every control there is, beside a checkbox for each sheet.
    await expect(preview.locator('.print-options').locator('select, input')).toHaveCount(5);

    const submit = preview.getByTestId('print-submit');
    await expect(submit).toHaveText('Print 3 sheets');
    await expect(submit).toHaveClass(/primary/);

    await preview.getByTestId('print-include').nth(1).uncheck();
    await expect(submit).toHaveText('Print 2 sheets');
    await preview.getByTestId('print-copies').fill('2');
    await expect(submit).toHaveText('Print 2 sheets × 2');

    await submit.click();
    await expect(preview.getByTestId('print-result')).toHaveText(
      'Sent to LeatherCAD_Test as job LeatherCAD_Test-7.',
    );

    const args = readFileSync(cups.args, 'utf8').trim().split('\n');
    expect(args).toEqual([
      '-d',
      'LeatherCAD_Test',
      '-t',
      'LeatherCAD print test',
      '-n',
      '2',
      '-P',
      '1,3',
      '-o',
      'media=A4',
      '-o',
      'print-scaling=none',
      '-o',
      'fit-to-page=false',
    ]);

    // What lp was sent is the whole PDF the preview drew, true to size. The
    // sheets left out are CUPS's to leave out (-P), not a different file.
    expectAccurate(measurePrintTest(cups.job));

    if (existsSync(PDFTOPDF)) {
      // The job's own options: still 100 × 5 mm after CUPS's filter.
      expectAccurate(measurePrintTest(pdftopdf(cups.bin, cups.job, jobOptions(args))));
      // For the record, what the same filter makes of it unasked.
      await test.info().attach('pdftopdf without the job options', {
        body: JSON.stringify(measurePrintTest(pdftopdf(cups.bin, cups.job, 'media=A4')).gauges),
        contentType: 'application/json',
      });
    }
  } finally {
    await closeApp(app);
    rmSync(cups.bin, { recursive: true, force: true });
  }
});

test('a landscape sheet goes to lp upright, turned a quarter on its paper, at 1:1 (7.6b)', async () => {
  const cups = fakeCups(ONE_PRINTER);
  const app = await launchApp({ env: { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openPrintTest(app, window, join(cups.bin, 'unused.pdf'));

    await window.getByTestId('print').click();
    const preview = window.getByTestId('print-preview');
    await preview.getByTestId('print-landscape').check();
    await expect(preview.getByTestId('print-summary')).toHaveText('1 sheet of A4, landscape');
    await expect(preview.getByTestId('print-thumb')).toHaveCount(1);

    // Shown as the Sheets view shows it, landscape and the right way up: the
    // view turns the page, and what pdf.js draws is still the bytes sent.
    const page = preview.getByTestId('print-page').locator('canvas');
    await expect.poll(() => page.evaluate(inkOn)).toBeGreaterThan(1000);
    const shape = await page.evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.height);
    expect(shape).toBeCloseTo(297 / 210, 1);

    const submit = preview.getByTestId('print-submit');
    await expect(submit).toHaveText('Print 1 sheet');
    await submit.click();
    await expect(preview.getByTestId('print-result')).toHaveText(
      'Sent to LeatherCAD_Test as job LeatherCAD_Test-7.',
    );

    // The job a portrait sheet gets. Nothing says landscape: any orientation
    // option makes CUPS turn the page and shrink it again (printing.md §13).
    const args = readFileSync(cups.args, 'utf8').trim().split('\n');
    expect(args).toEqual([
      '-d',
      'LeatherCAD_Test',
      '-t',
      'LeatherCAD print test',
      '-n',
      '1',
      '-P',
      '1',
      '-o',
      'media=A4',
      '-o',
      'print-scaling=none',
      '-o',
      'fit-to-page=false',
    ]);

    // lp was sent an A4 page, upright and unrotated, with the sheet turned a
    // quarter on it, which measures true read as the maker turns the paper:
    // the gauge, the panel, its holes, and the strap whole.
    expect(pagesOf(cups.job)).toEqual(['595.276 x 841.89 pt, rotated 0']);
    expectAccurate(measurePrintTest(cups.job, true), 1);

    if (existsSync(PDFTOPDF)) {
      // And after CUPS's filter, with the job's options: still upright, whole
      // and true. A landscape page passed it unturned, and the next filter
      // cut it off at 210 mm on the upright paper (7.6).
      const filtered = pdftopdf(cups.bin, cups.job, jobOptions(args));
      expect(pagesOf(filtered)).toEqual(['595.276 x 841.89 pt, rotated 0']);
      expectAccurate(measurePrintTest(filtered, true), 1);
    }
  } finally {
    await closeApp(app);
    rmSync(cups.bin, { recursive: true, force: true });
  }
});

test('with no CUPS to drive, the preview saves the PDF and says how to print it', async () => {
  const cups = fakeCups(`echo 'lpstat: Scheduler is not running.' >&2\nexit 1`);
  const pdf = join(cups.bin, 'saved.pdf');
  const app = await launchApp({ env: { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openPrintTest(app, window, pdf);

    await window.keyboard.press('Control+p');
    const preview = window.getByTestId('print-preview');
    await expect(preview.getByTestId('print-unavailable')).toHaveText(
      "LeatherCAD can't reach this computer's printing system.",
    );
    await expect(preview.getByTestId('print-actual-size')).toContainText('Actual size (100 %)');
    await expect(preview.getByTestId('print-submit')).toHaveCount(0);
    await expect(preview.getByTestId('print-include')).toHaveCount(0);

    await preview.getByTestId('print-save-pdf').click();
    await expect(preview).toHaveCount(0);
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    expectAccurate(measurePrintTest(pdf));
    await expect(window.getByTestId('export-tiled')).toContainText('Strap');
    expect(existsSync(cups.job), 'nothing went to lp').toBe(false);
  } finally {
    await closeApp(app);
    rmSync(cups.bin, { recursive: true, force: true });
  }
});
