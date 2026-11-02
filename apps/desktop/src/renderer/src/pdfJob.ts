import type { ScaleCorrection } from '@leathercad/core';
import { exportPdf, type SheetPlan } from '@leathercad/export';

/**
 * What the PDF worker is asked to write (PERF-002): plain data, so it crosses
 * to the worker by structured clone, and nothing that is only a function — the
 * clock is a moment (`at`), and the worker's `now` is that moment, so every
 * sheet and the file are dated alike.
 */
export interface PdfJob {
  readonly plan: SheetPlan;
  /** When the file is dated, as `Date.now()` gives it. */
  readonly at: number;
  readonly applicationVersion: string;
  /** The print form (7.6b): every page upright. Off for *Export PDF*. */
  readonly upright?: boolean;
  /** The chosen printer's scale correction (7.5). Only *Print* passes one. */
  readonly correction?: ScaleCorrection;
}

/** The worker's one answer to a job: the file, or what went wrong. */
export type PdfReply =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly message: string };

/**
 * Writes the job's PDF: **the same `exportPdf` the main thread would call**,
 * the worker being only where it runs. The worker module wraps this, and the
 * tests call it on both sides of a structured clone to show that the bytes do
 * not depend on which side wrote them.
 */
export async function runPdfJob(job: PdfJob): Promise<Uint8Array> {
  const { bytes } = await exportPdf(job.plan, {
    applicationVersion: job.applicationVersion,
    now: () => new Date(job.at),
    ...(job.upright === undefined ? {} : { upright: job.upright }),
    ...(job.correction === undefined ? {} : { correction: job.correction }),
  });
  return bytes;
}
