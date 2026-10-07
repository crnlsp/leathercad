import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CommandError,
  listPrinters,
  lpArguments,
  pageRanges,
  pageSizes,
  printPdf,
  type Run,
} from './printing.js';

/** A CUPS client, scripted: each command's output, and every call made. */
function cups(outputs: Record<string, string | Error>) {
  const calls: { command: string; args: readonly string[]; input?: Uint8Array }[] = [];
  const run: Run = (command, args, input) => {
    calls.push({ command, args, ...(input === undefined ? {} : { input }) });
    const key = [command, ...args].join(' ');
    const out = outputs[key] ?? outputs[command];
    if (out === undefined) return Promise.reject(new CommandError(`unscripted: ${key}`, 1));
    return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
  };
  return { run, calls };
}

const BROTHER = 'PageSize/Media Size: 195x270mm 3x5 *A4 A5 Legal Letter Custom.WIDTHxHEIGHT\n';
const LPSTAT = {
  'lpstat -e': 'Brother_HL_L2442DW\nHL-L2442DW\n',
  'lpstat -d': 'system default destination: HL-L2442DW\n',
  'lpoptions -p HL-L2442DW -l': `${BROTHER}InputSlot/Media Source: *Auto Manual\n`,
  // A printer found on the network that has not printed yet lists nothing.
  'lpoptions -p Brother_HL_L2442DW -l': '',
};
const PDF = new TextEncoder().encode('%PDF-1.7\n…');
const JOB = { printer: 'HL-L2442DW', paper: 'A4', pages: [1, 2, 3], copies: 1, title: 'Bifold' };

describe('finding printers', () => {
  it('lists what CUPS lists, with the default and each one’s paper', async () => {
    const { run } = cups(LPSTAT);
    expect(await listPrinters(run, 'linux')).toEqual({
      available: true,
      printers: [
        { name: 'Brother_HL_L2442DW', papers: null },
        { name: 'HL-L2442DW', papers: ['195x270mm', '3x5', 'A4', 'A5', 'Legal', 'Letter'] },
      ],
      defaultPrinter: 'HL-L2442DW',
    });
  });

  it('only ever asks lpoptions to list, never to set', async () => {
    const { run, calls } = cups(LPSTAT);
    await listPrinters(run, 'darwin');
    const lpoptions = calls.filter((call) => call.command === 'lpoptions');
    expect(lpoptions).toHaveLength(2);
    for (const call of lpoptions) expect(call.args).toEqual(['-p', expect.any(String), '-l']);
  });

  it('has no default when there is none, or it is not a printer listed', async () => {
    for (const out of ['no system default destination\n', 'system default destination: Gone\n']) {
      const { run } = cups({ ...LPSTAT, 'lpstat -d': out });
      expect(await listPrinters(run, 'linux')).toMatchObject({ defaultPrinter: null });
    }
  });

  it('is unavailable without a CUPS client to drive: no lpstat, or no scheduler', async () => {
    for (const failure of [
      new CommandError('spawn lpstat ENOENT', 'ENOENT'),
      new CommandError('lpstat: Scheduler is not running.', 1),
    ]) {
      const { run } = cups({ lpstat: failure });
      expect(await listPrinters(run, 'linux')).toEqual({ available: false, reason: 'no-cups' });
    }
  });

  it('does not look for CUPS on Windows', async () => {
    const { run, calls } = cups(LPSTAT);
    expect(await listPrinters(run, 'win32')).toEqual({ available: false, reason: 'platform' });
    expect(calls).toEqual([]);
  });
});

describe('sending a job', () => {
  it('sends the PDF it was given to lp, unchanged, with scaling off', async () => {
    const { run, calls } = cups({ ...LPSTAT, lp: 'request id is HL-L2442DW-12 (1 file(s))\n' });
    expect(await printPdf(run, PDF, { ...JOB, pages: [1, 3], copies: 2 })).toBe('HL-L2442DW-12');
    const lp = calls.find((call) => call.command === 'lp');
    expect(lp?.input).toBe(PDF);
    expect(lp?.args).toEqual([
      '-d',
      'HL-L2442DW',
      '-t',
      'Bifold',
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
  });

  it('asks for no scaling on every job, whatever else it asks for', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('A4', 'A3', 'Letter', 'Legal'),
        fc.integer({ min: 1, max: 99 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 40 }), { minLength: 1 }),
        (paper, copies, pages) => {
          const args = lpArguments({ ...JOB, paper, copies, pages });
          const options = args.filter((_, i) => args[i - 1] === '-o');
          expect(options).toContain('print-scaling=none');
          expect(options).toContain('fit-to-page=false');
          expect(options).toContain(`media=${paper}`);
          expect(options.filter((option) => /scal|fit|zoom|percent/.test(option))).toEqual([
            'print-scaling=none',
            'fit-to-page=false',
          ]);
        },
      ),
    );
  });

  it('refuses a printer CUPS does not list, without running lp', async () => {
    const { run, calls } = cups(LPSTAT);
    await expect(printPdf(run, PDF, { ...JOB, printer: '-oscaling=50' })).rejects.toThrow();
    expect(calls.some((call) => call.command === 'lp')).toBe(false);
  });

  it('refuses a paper the printer lists its sizes without, without running lp', async () => {
    const { run, calls } = cups(LPSTAT);
    await expect(printPdf(run, PDF, { ...JOB, paper: 'A3' })).rejects.toThrow('A3');
    expect(calls.some((call) => call.command === 'lp')).toBe(false);
    const lpoptions = calls.filter((call) => call.command === 'lpoptions');
    expect(lpoptions.map((call) => call.args)).toEqual([['-p', 'HL-L2442DW', '-l']]);
  });

  it('sends any paper to a printer that does not list its sizes', async () => {
    const { run, calls } = cups({ ...LPSTAT, lp: 'request id is Brother_HL_L2442DW-3\n' });
    const job = { ...JOB, printer: 'Brother_HL_L2442DW', paper: 'A3' };
    expect(await printPdf(run, PDF, job)).toBe('Brother_HL_L2442DW-3');
    expect(calls.some((call) => call.command === 'lp')).toBe(true);
  });

  it('refuses what no one could have chosen', async () => {
    const { run, calls } = cups(LPSTAT);
    for (const job of [
      { ...JOB, copies: 0 },
      { ...JOB, copies: 1.5 },
      { ...JOB, copies: 100 },
      { ...JOB, pages: [] },
      { ...JOB, pages: [0] },
      { ...JOB, pages: ['1'] },
      { ...JOB, paper: 'A4 -o scaling=50' },
      { ...JOB, printer: '' },
      null,
    ]) {
      await expect(printPdf(run, PDF, job)).rejects.toThrow();
    }
    await expect(printPdf(run, new Uint8Array([1, 2, 3]), JOB)).rejects.toThrow('not a PDF');
    await expect(printPdf(run, 'a string', JOB)).rejects.toThrow('not a PDF');
    expect(calls.some((call) => call.command === 'lp')).toBe(false);
  });

  it('names the job on one line', async () => {
    const { run, calls } = cups({ ...LPSTAT, lp: 'request id is HL-L2442DW-1 (1 file(s))\n' });
    await printPdf(run, PDF, { ...JOB, title: 'Wallet\nv2' });
    expect(calls.find((call) => call.command === 'lp')?.args[3]).toBe('Wallet v2');
  });

  it('passes on what CUPS said when it refuses', async () => {
    const { run } = cups({
      ...LPSTAT,
      lp: new CommandError('lp: Printer is not accepting jobs', 1),
    });
    await expect(printPdf(run, PDF, JOB)).rejects.toThrow('not accepting jobs');
  });
});

describe('page ranges', () => {
  it('runs consecutive pages together', () => {
    expect(pageRanges([1, 2, 3, 5])).toBe('1-3,5');
    expect(pageRanges([7])).toBe('7');
    expect(pageRanges([3, 1, 2, 2])).toBe('1-3');
  });

  it('covers exactly the pages asked for', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1 }), (pages) => {
        const covered = pageRanges(pages)
          .split(',')
          .flatMap((range) => {
            const [first, last = first] = range.split('-').map(Number) as [number, number?];
            return Array.from({ length: last - first + 1 }, (_, i) => first + i);
          });
        expect(covered).toEqual([...new Set(pages)].sort((a, b) => a - b));
      }),
    );
  });
});

describe('paper sizes', () => {
  it('reads the PageSize line, without the default mark or the custom size', () => {
    expect(pageSizes(BROTHER)).toEqual(['195x270mm', '3x5', 'A4', 'A5', 'Legal', 'Letter']);
    expect(pageSizes('InputSlot/Media Source: *Auto\n')).toBeNull();
    expect(pageSizes('')).toBeNull();
  });
});
