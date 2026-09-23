import { test, type Bench } from 'vitest';

import { loadProject, saveProject } from './lcp.js';
import { fixtureProjectV9 } from './makeFixture.js';

/** Save and open. Opening includes the migration walk and the graph checks. */

/** One workload, three ways. See `measure` in packages/geometry/src/geometry.bench.ts. */
function measure(bench: Bench, slug: string, fn: () => unknown): Promise<unknown> {
  const mode = process.env['LEATHERCAD_BENCH'];
  const file = `./bench/${slug}.json`;
  return mode === 'compare'
    ? bench.compare(bench('now', fn), bench.from('baseline', file))
    : bench('now', mode === 'baseline' ? { writeResult: file } : {}, fn).run();
}

const OPTIONS = { applicationVersion: 'bench', now: () => new Date('2026-09-23T00:00:00.000Z') };
const project = fixtureProjectV9();
const bytes = saveProject(project, OPTIONS);

test('save the format fixture', ({ bench }) =>
  measure(bench, 'save', () => saveProject(project, OPTIONS)));

test('open the format fixture', ({ bench }) => measure(bench, 'open', () => loadProject(bytes)));
