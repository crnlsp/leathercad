import { execFile } from 'node:child_process';

import type { PrintJob, PrinterList } from '@leathercad/platform';

/**
 * Printing (7.6): the system's own CUPS client, driven with scaling off.
 *
 * Nothing here lays out a page or scales one. The PDF arrives finished — the
 * bytes the Print Preview showed — and goes to `lp` on its standard input,
 * untouched, with `print-scaling=none`. Without that option CUPS's `pdftopdf`
 * defaults to fitting the page into the printer's margins: a 100 mm line
 * printed as 96 mm on an A4 laser. See docs/printing.md §13 and ADR 0019.
 *
 * Only the main process runs these, never through a shell, and only with
 * arguments built here from a job checked here.
 */

/** Runs a command and resolves with what it printed; rejects with what it said. */
export type Run = (command: string, args: readonly string[], input?: Uint8Array) => Promise<string>;

/** A command failed to start or ran and refused: its message, and why. */
export class CommandError extends Error {
  constructor(
    message: string,
    /** `ENOENT` when the command does not exist. */
    readonly code: string | number | undefined,
  ) {
    super(message);
  }
}

/**
 * The real thing. `LC_ALL=C`, because the output is parsed, and the CUPS
 * tools translate theirs.
 */
export const runCommand: Run = (command, args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      [...args],
      { env: { ...process.env, LC_ALL: 'C' }, encoding: 'utf8', timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error === null) resolve(stdout);
        else reject(new CommandError(stderr.trim() || error.message, error.code ?? undefined));
      },
    );
    // A command that never started cannot read; the callback says why.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input);
  });

/** The paper names `lp -o media=` is given: the app's, which CUPS also knows. */
const PAPER = /^[A-Za-z0-9]+$/;
const MAX_COPIES = 99;
const MAX_PAGE = 9999;
const MAX_TITLE = 255;

export async function listPrinters(
  run: Run,
  platform: NodeJS.Platform = process.platform,
): Promise<PrinterList> {
  // Windows has no CUPS, and no transport here yet (docs/printing.md §13).
  if (platform === 'win32') return { available: false, reason: 'platform' };

  let names: string[];
  try {
    names = destinations(await run('lpstat', ['-e']));
  } catch {
    // No lpstat (the Flatpak's runtime has none), or no scheduler to ask.
    return { available: false, reason: 'no-cups' };
  }
  const defaultPrinter = await run('lpstat', ['-d']).then(
    (out) => /^system default destination: (.+)$/m.exec(out)?.[1]?.trim() ?? null,
    () => null,
  );
  const printers = await Promise.all(
    names.map(async (name) => ({
      name,
      // `-l` only lists. Nothing here ever sets a printer's options.
      papers: await run('lpoptions', ['-p', name, '-l']).then(pageSizes, () => null),
    })),
  );
  return {
    available: true,
    printers,
    defaultPrinter:
      defaultPrinter !== null && names.includes(defaultPrinter) ? defaultPrinter : null,
  };
}

/**
 * Sends the PDF to `lp`. The job came over IPC, so it is checked here as
 * untrusted: the printer must be one CUPS lists now, and every number must be
 * one a person could have chosen.
 */
export async function printPdf(run: Run, data: unknown, job: unknown): Promise<string> {
  const checked = checkJob(job);
  if (!(data instanceof Uint8Array) || !isPdf(data)) throw new Error('not a PDF');
  if (!destinations(await run('lpstat', ['-e'])).includes(checked.printer)) {
    throw new Error(`no printer named ${JSON.stringify(checked.printer)}`);
  }
  const out = await run('lp', lpArguments(checked), data);
  return /request id is (\S+)/.exec(out)?.[1] ?? '';
}

/**
 * The whole job, as `lp` is given it. Scaling is not a parameter: every job
 * asks for none, in the IPP attribute CUPS 2.x and cups-filters honour and in
 * the older CUPS option.
 */
export function lpArguments(job: PrintJob): string[] {
  return [
    ['-d', job.printer],
    ['-t', job.title],
    ['-n', String(job.copies)],
    ['-P', pageRanges(job.pages)],
    ['-o', `media=${job.paper}`],
    ['-o', 'print-scaling=none'],
    ['-o', 'fit-to-page=false'],
  ].flat();
}

/** `[1, 2, 3, 5]` as `1-3,5`. */
export function pageRanges(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    ranges.push(i === j ? String(sorted[i]) : `${String(sorted[i])}-${String(sorted[j])}`);
    i = j + 1;
  }
  return ranges.join(',');
}

/** `lpstat -e`: one destination a line. */
export function destinations(out: string): string[] {
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** `PageSize/Media Size: 3x5 *A4 Letter Custom.WIDTHxHEIGHT` as its sizes, or null. */
export function pageSizes(out: string): string[] | null {
  const line = /^PageSize\/[^:]*:(.*)$/m.exec(out)?.[1];
  if (line === undefined) return null;
  return line
    .trim()
    .split(/\s+/)
    .map((size) => size.replace(/^\*/, ''))
    .filter((size) => size !== '' && !size.startsWith('Custom.'));
}

function checkJob(job: unknown): PrintJob {
  const { printer, paper, pages, copies, title } = (job ?? {}) as Record<string, unknown>;
  if (typeof printer !== 'string' || printer === '') throw new Error('no printer');
  if (typeof paper !== 'string' || !PAPER.test(paper)) throw new Error('no paper');
  if (!Number.isInteger(copies) || (copies as number) < 1 || (copies as number) > MAX_COPIES) {
    throw new Error('copies out of range');
  }
  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    !pages.every((page) => Number.isInteger(page) && page >= 1 && page <= MAX_PAGE)
  ) {
    throw new Error('no pages');
  }
  return {
    printer,
    paper,
    pages: pages as number[],
    copies: copies as number,
    // A queue's job name is one line of text.
    title: typeof title === 'string' ? title.replace(/\p{Cc}/gu, ' ').slice(0, MAX_TITLE) : '',
  };
}

function isPdf(data: Uint8Array): boolean {
  return new TextDecoder().decode(data.subarray(0, 5)) === '%PDF-';
}
