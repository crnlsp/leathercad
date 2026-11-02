#!/usr/bin/env node
/**
 * What a pull request changes, and so which of CI's jobs it can break (A4).
 *
 *   gh api repos/<repo>/pulls/<n>/files --paginate \
 *     --jq '.[] | [.status, .filename, .previous_filename // empty] | @tsv' |
 *     node tools/ci/changes.mjs >> "$GITHUB_OUTPUT"
 *
 * prints one `<name>=true|false` line per job gate, and `kinds=` with the
 * kinds it found. A path that is not certainly documentation is code: a gate
 * that runs too much costs minutes, one that runs too little lets a red
 * develop through.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// What the app is built from: the lockfile and what shapes it, the scan's
// exceptions, and the Node every job runs.
const DEPS = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^patches\//,
  /(^|\/)package\.json$/,
  /^osv-scanner\.toml$/,
  /^\.node-version$/,
];
const PACKAGING = [
  /^apps\/desktop\/electron-builder\.config\.mjs$/,
  /^apps\/desktop\/build\//,
  /^apps\/desktop\/src\/main\//,
  /^assets\/fonts\//,
];
// Documents a test reads, so an edit to one can turn a check red:
// packages/domain/src/problems/audit.test.ts holds the problem codes to
// docs/domain-model.md §8, and apps/desktop/src/bench-discovery.test.ts the
// benchmark baselines to docs/testing.md §9.1.
const READ_BY_TESTS = new Set(['docs/domain-model.md', 'docs/testing.md']);

/** The kind of change one path is. */
function kindOf(path) {
  if (path.startsWith('.github/')) return 'workflows';
  if (DEPS.some((pattern) => pattern.test(path))) return 'deps';
  if (PACKAGING.some((pattern) => pattern.test(path))) return 'packaging';
  if (READ_BY_TESTS.has(path)) return 'code';
  // An AUR recipe nothing in CI builds (B3).
  if (path.startsWith('docs/') || path.startsWith('packaging/aur/')) return 'docs';
  if (path.endsWith('.md') && !path.startsWith('.claude/') && !path.startsWith('apps/')) {
    return 'docs';
  }
  return 'code';
}

/**
 * The kinds of change a list of files makes. A rename counts where it came
 * from as well as where it went, so moving code into docs/ is still code. No
 * files is code: nothing shows it is less.
 */
export function classify(files) {
  const kinds = new Set();
  for (const { path, previous } of files) {
    kinds.add(kindOf(path));
    if (previous !== undefined) kinds.add(kindOf(previous));
  }
  if (kinds.size === 0) kinds.add('code');
  return kinds;
}

/**
 * Which gated jobs a change runs. Static checks always run, so they are not
 * here. A workflow or dependency change can break anything; packaging can
 * break any installer; the scan answers only for the lockfile, and the
 * linters only for workflows.
 */
export function gates(kinds) {
  const any = (...names) => names.some((name) => kinds.has(name));
  return {
    tests: any('code', 'packaging', 'deps', 'workflows'),
    installers: any('packaging', 'deps', 'workflows'),
    scan: any('deps'),
    lint: any('workflows'),
  };
}

/** The API's list as tab-separated lines: status, path, and a rename's path before. */
export function parse(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [status, path, previous] = line.split('\t');
      return previous === undefined ? { status, path } : { status, path, previous };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const kinds = classify(parse(readFileSync(0, 'utf8')));
  for (const [name, value] of Object.entries(gates(kinds))) console.log(`${name}=${value}`);
  console.log(`kinds=${[...kinds].sort().join(' ')}`);
}
