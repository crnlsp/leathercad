#!/usr/bin/env node
/**
 * `node tools/perf-compute.mjs [--root <tree>] [--json] [workload…]` — what the pure layers cost
 * bundled as the app ships them, rather than through Vitest's module runner (PERF-017).
 *
 * Vite, the bundler that builds the app, bundles the sources of `--root` (this tree by default)
 * into one module, and plain Node runs it. There is no module runner, whose export getters
 * `pnpm bench` pays for on every call, so these numbers are near what the renderer computes and
 * are not comparable with `pnpm bench`'s. They are not Electron's either: interactions are timed
 * in the built app by `perf-drag.mjs`, `perf-pdf.mjs` and `perf-sheets.mjs`.
 *
 * The workloads are the audit's (docs/performance-backlog.md, *Workloads to reconstruct*), from
 * `packages/domain/src/workloads.ts` and the sample wallet; name some to run only those. Each is
 * measured seven ways:
 *
 *   evaluate   evaluate a fresh copy: every feature computed
 *   diagnose   diagnose a fresh copy: evaluation and validation, what the panels wait for
 *   rename     diagnose after a part is renamed: evaluation reused, validation repeated — what a
 *              metadata edit costs
 *   snap       build the snap index of a fresh copy, evaluated beforehand
 *   warm       evaluate after a part is renamed: every feature is the same object (PERF-015)
 *   graph      check the graph's structure, as the loader and a follow command do
 *   tree       nest each part's features under what they follow, as the parts panel does
 *
 * Each is 3 warm-up runs, then 20 timed; the copy is built outside the timing. The table gives the
 * median and the range, in milliseconds, and `--json` prints every sample instead. The header
 * records what the numbers depend on: the commit, Node and V8, the processor and the load.
 * Compare only runs taken on one machine, and when anything else is running, interleave before
 * and after (A, B, A, B…) and compare medians over several runs.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, loadavg, release, tmpdir, type } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const WARMUP = 3;
const SAMPLES = 20;

const args = process.argv.slice(2);
const flag = args.indexOf('--root');
const root = resolve(flag === -1 ? resolve(import.meta.dirname, '..') : args.splice(flag, 2)[1]);
const json = args.includes('--json');
const only = args.filter((a) => a !== '--json');

const src = (path) => JSON.stringify(resolve(root, path));
const entry = `
import * as workloads from ${src('packages/domain/src/workloads.ts')};
import { diagnose, evaluate, featureTree, graphProblems } from ${src('packages/domain/src/index.ts')};
import { buildSnapIndex } from ${src('packages/editor/src/index.ts')};
import { loadProject } from ${src('packages/persist/src/index.ts')};
export { buildSnapIndex, diagnose, evaluate, featureTree, graphProblems, loadProject, workloads };
`;

const out = mkdtempSync(join(tmpdir(), 'lc-perf-compute-'));
writeFileSync(join(out, 'entry.js'), entry);
// The Vite apps/desktop builds the renderer with — this tree's, whichever tree is measured, so
// before and after are bundled alike.
const desktop = resolve(import.meta.dirname, '../apps/desktop/package.json');
const vite = await import(pathToFileURL(createRequire(desktop).resolve('vite')).href);
const built = await vite.build({
  configFile: false,
  logLevel: 'warn',
  root: out,
  build: {
    write: false,
    target: 'esnext',
    lib: { entry: join(out, 'entry.js'), formats: ['es'], fileName: 'compute' },
  },
});
writeFileSync(join(out, 'compute.js'), [built].flat()[0].output[0].code);
const lib = await import(pathToFileURL(join(out, 'compute.js')).href);
rmSync(out, { recursive: true, force: true });

const { buildSnapIndex, diagnose, evaluate, featureTree, graphProblems, loadProject } = lib;
const w = lib.workloads;
const WORKLOADS = {
  wallet: () =>
    loadProject(readFileSync(resolve(root, 'fixtures/projects/bifold-wallet.lcp'))).project,
  strap: () => w.strap(5800),
  'strap-slots': () => w.strap(5800, 20),
  'traced-250': () => w.tracedOutline(250),
  'traced-500': () => w.tracedOutline(500),
  'traced-1000': () => w.tracedOutline(1000),
  'bag-30': () => w.bag(30),
  'bag-40': () => w.bag(40),
  'bag-50': () => w.bag(50),
  'chain-10': () => w.mirrorChain(10),
  'chain-100': () => w.mirrorChain(100),
  'chain-500': () => w.mirrorChain(500),
};

/** A copy of `project` with its first part renamed; every feature is the same object. */
function renamed(project, k) {
  const [first, ...rest] = project.parts;
  return { ...project, parts: [{ ...first, name: `${first.name} ${k}` }, ...rest] };
}

/** `setup` builds an input outside the timing, `run` is timed. */
const MEASURES = {
  evaluate: (make) => ({ setup: make, run: evaluate }),
  diagnose: (make) => ({ setup: make, run: diagnose }),
  rename: (make) => {
    const warm = make();
    diagnose(warm);
    let k = 0;
    return { setup: () => renamed(warm, ++k), run: diagnose };
  },
  snap: (make) => ({ setup: () => evaluate(make()), run: buildSnapIndex }),
  warm: (make) => {
    const warm = make();
    evaluate(warm);
    let k = 0;
    return { setup: () => renamed(warm, ++k), run: evaluate };
  },
  graph: (make) => ({ setup: make, run: graphProblems }),
  tree: (make) => ({ setup: make, run: (project) => project.parts.map(featureTree) }),
};

function time({ setup, run }) {
  const samples = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const input = setup();
    const started = performance.now();
    run(input);
    const elapsed = performance.now() - started;
    if (i >= WARMUP) samples.push(elapsed);
  }
  return samples;
}

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
const environment = {
  commit: git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? ' + changes' : ''),
  node: process.versions.node,
  v8: process.versions.v8,
  vite: vite.version,
  cpu: `${cpus()[0]?.model.trim()} × ${cpus().length}`,
  os: `${type()} ${release()}`,
  load: loadavg()
    .map((l) => l.toFixed(2))
    .join(' '),
  method: `${WARMUP} warm-up runs, ${SAMPLES} timed`,
};

const results = [];
for (const [workload, make] of Object.entries(WORKLOADS)) {
  if (only.length > 0 && !only.includes(workload)) continue;
  for (const [measure, of] of Object.entries(MEASURES)) {
    results.push({ workload, measure, samples: time(of(make)) });
  }
}

if (json) {
  console.log(JSON.stringify({ environment, results }));
} else {
  for (const [key, value] of Object.entries(environment)) console.log(`${key}: ${value}`);
  const ms = (x) => x.toFixed(2);
  const cell = (samples) => {
    const s = [...samples].sort((a, b) => a - b);
    const median = (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
    return `${ms(median)} (${ms(s[0])}–${ms(s.at(-1))})`;
  };
  console.log(`\n| workload | ${Object.keys(MEASURES).join(' | ')} |`);
  console.log(
    `|---|${Object.keys(MEASURES)
      .map(() => '---:')
      .join('|')}|`,
  );
  for (const workload of new Set(results.map((r) => r.workload))) {
    const row = results.filter((r) => r.workload === workload).map((r) => cell(r.samples));
    console.log(`| ${workload} | ${row.join(' | ')} |`);
  }
}
