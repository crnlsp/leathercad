import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { runLcpJob, type LcpJob } from './lcpJob.js';

const renderer = import.meta.dirname;
const fixtures = join(import.meta.dirname, '../../../../../fixtures');

describe('a project made into a file off the window’s thread (PERF-009)', () => {
  it('is made into bytes only by the .lcp job, which the worker runs', () => {
    // A guard by count, not by time: the places in the renderer that encode a
    // project. Each save and each recovery copy did it on the window's thread,
    // where the audit's 40 traced outlines took 100–140 ms with nothing painted
    // and no click answered; the job runs in the worker, and on the window's
    // thread only when no worker can be had.
    const encoding = readdirSync(renderer, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(join(renderer, file), 'utf8').includes('saveProject('))
      .map((file) => file.replaceAll('\\', '/'));

    expect(encoding).toEqual(['lcpJob.ts']);
  });

  it.each([
    'projects/bifold-wallet.lcp',
    'perf/traced-500.lcp',
    'perf/strap-5800.lcp',
    'format/v12.lcp',
  ])('writes for %s, from the copy a worker is sent, the bytes saveProject writes', (name) => {
    const { project, manifest } = loadProject(readFileSync(join(fixtures, name)));
    const job: LcpJob = {
      project,
      applicationVersion: '1.6.0',
      at: '2026-11-02T10:00:00.000Z',
      createdUtc: manifest.createdUtc,
    };

    expect(runLcpJob(structuredClone(job))).toEqual(
      saveProject(project, {
        applicationVersion: '1.6.0',
        now: () => new Date('2026-11-02T10:00:00.000Z'),
        createdUtc: manifest.createdUtc,
      }),
    );
  });
});
