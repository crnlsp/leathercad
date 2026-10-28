import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { rectShape, rectanglePart } from '@leathercad/document';
import { DEFAULT_SETTINGS, type Project } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { runPdfJob, type PdfJob } from './pdfJob.js';
import { sheetPlanFor } from './sheets.js';

/**
 * The worker writes the file from a structured clone of the plan (PERF-002).
 * Cloning must change nothing a PDF can show, so each workload is written
 * twice, from the plan itself and from its clone, and the two must be the same
 * bytes: that is all the worker is allowed to be, a different place to run
 * `exportPdf`, not a different `exportPdf`.
 */

const AT = Date.parse('2026-10-28T09:30:00.000Z');
const fixture = (path: string): Project =>
  loadProject(new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../../', path))))
    .project;

/** A pattern 400 × 300 mm: taped in both directions on A4, so it has an assembly map. */
const grid = (): Project => ({
  id: 'grid',
  name: 'Grid',
  settings: DEFAULT_SETTINGS,
  parts: [rectanglePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 400, 300))],
});

const WORKLOADS: ReadonlyArray<{ name: string; project: () => Project; extra?: Partial<PdfJob> }> =
  [
    {
      name: 'the print test, in the form Print sends',
      project: () => fixture('fixtures/projects/print-test.lcp'),
      extra: { upright: true },
    },
    {
      name: 'the 5.8 m strap on 33 sheets',
      project: () => fixture('fixtures/perf/strap-5800.lcp'),
    },
    { name: 'a grid taped both ways, with its assembly map', project: grid },
    {
      name: 'the print test with a printer correction',
      project: () => fixture('fixtures/projects/print-test.lcp'),
      extra: { upright: true, correction: { x: 1.012, y: 0.991 } },
    },
  ];

describe('the PDF written from a cloned plan', () => {
  it.each(WORKLOADS)('is the same file as from the plan itself: $name', async (workload) => {
    const job: PdfJob = {
      plan: sheetPlanFor(workload.project()),
      at: AT,
      applicationVersion: '1.2.3',
      ...workload.extra,
    };

    const here = await runPdfJob(job);
    const there = await runPdfJob(structuredClone(job));

    expect(there.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(there).equals(Buffer.from(here))).toBe(true);
  });

  it('writes the grid’s assembly map as a sheet of its own', () => {
    // Guards the workload above: a grid that did not tape would prove less.
    const plan = sheetPlanFor(grid());
    expect(plan.sheets.some((sheet) => sheet.assembly !== undefined)).toBe(true);
  });

  it('refuses a correction beyond ±2 %, as the main thread does', async () => {
    const plan = sheetPlanFor(grid());
    await expect(
      runPdfJob({ plan, applicationVersion: '1', at: AT, correction: { x: 1.05, y: 1 } }),
    ).rejects.toThrow(RangeError);
  });
});
