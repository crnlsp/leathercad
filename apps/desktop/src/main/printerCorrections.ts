import { readFileSync } from 'node:fs';

import {
  NO_CORRECTION,
  isAllowedCorrection,
  isNoCorrection,
  type ScaleCorrection,
} from '@leathercad/core';

import { writeFileAtomic } from './atomicWrite.js';

/** The longest printer name CUPS allows, and then some. */
const MAX_NAME = 255;

/** A print queue's name as CUPS lists it: one line, not empty. */
function isPrinterName(value: unknown): value is string {
  return (
    typeof value === 'string' && value !== '' && value.length <= MAX_NAME && !/\p{Cc}/u.test(value)
  );
}

/** A correction a maker could have stored: two finite factors within ±2 %, not both one. */
function readCorrection(value: unknown): ScaleCorrection | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const correction = { x, y };
  return isAllowedCorrection(correction) && !isNoCorrection(correction) ? correction : null;
}

/**
 * Reads `printers.json`, keeping each correction that is still usable.
 *
 * A correction scales every sheet sent to its printer, so one that is not
 * what it should be is dropped rather than guessed at: no correction is the
 * safe answer, and the gauge on every sheet shows if it was needed.
 */
export function parsePrinters(text: string | null): Map<string, ScaleCorrection> {
  const corrections = new Map<string, ScaleCorrection>();
  if (text === null) return corrections;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return corrections;
  }
  if (typeof raw !== 'object' || raw === null) return corrections;
  const stored = (raw as Record<string, unknown>)['corrections'];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return corrections;
  for (const [name, value] of Object.entries(stored)) {
    const correction = readCorrection(value);
    if (isPrinterName(name) && correction !== null) corrections.set(name, correction);
  }
  return corrections;
}

/**
 * Each printer's scale correction (7.5), kept in `printers.json` in the app's
 * configuration directory — the maker's hardware, never their pattern, so
 * never in a `.lcp` (docs/printing.md §8.2, docs/file-format.md §6).
 *
 * Owned by the main process: the renderer names a printer and a correction,
 * both checked here. Writes are atomic and one at a time, and a correction
 * counts as stored only once it is on disk: a write that fails leaves the
 * one before it, in the file and here.
 */
export class PrinterCorrections {
  private corrections: ReadonlyMap<string, ScaleCorrection>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    let text: string | null = null;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      // No file yet: no printer calibrated.
    }
    this.corrections = parsePrinters(text);
  }

  /** The printer's correction; none for a printer never calibrated, or no printer at all. */
  of(printer: unknown): ScaleCorrection {
    return (isPrinterName(printer) && this.corrections.get(printer)) || NO_CORRECTION;
  }

  /** Stores a printer's correction, or forgets it with `null`. Both came over IPC. */
  set(printer: unknown, correction: unknown): Promise<void> {
    if (!isPrinterName(printer)) return Promise.reject(new Error('no printer'));
    const checked = correction === null ? null : readCorrection(correction);
    if (correction !== null && checked === null) {
      return Promise.reject(
        new Error(`not a correction within ±2 %: ${JSON.stringify(correction)}`),
      );
    }
    const write = async (): Promise<void> => {
      const next = new Map(this.corrections);
      if (checked === null) next.delete(printer);
      else next.set(printer, checked);
      const stored = { version: 1, corrections: Object.fromEntries(next) };
      await writeFileAtomic(
        this.file,
        new TextEncoder().encode(`${JSON.stringify(stored, null, 2)}\n`),
      );
      this.corrections = next;
    };
    this.writing = this.writing.catch(() => undefined).then(write);
    return this.writing;
  }
}
