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
import { appendFileSync, readFileSync } from 'node:fs';
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

// What CI judges a change against (A8): the images and baselines a test is
// compared with, the configuration that decides what is checked, and the
// workflows and scripts that run it. Changing one is the known way to turn a
// check green without fixing what it found, so a reviewer is told.
const JUDGES = [
  /^e2e\/visual\/__screenshots__\//,
  /^packages\/render\/src\/svg\/__snapshots__\//,
  /^packages\/[^/]+\/bench\/[^/]+\.json$/,
  /^(packages\/[^/]+\/)?vitest\.config\.ts$/,
  /^eslint\.config\.js$/,
  /^\.dependency-cruiser\.cjs$/,
  /^knip\.jsonc$/,
  /^stryker\.config\.mjs$/,
  /^playwright[^/]*\.config\.ts$/,
  /^tools\/release-gate\.sh$/,
  // The guard and the gates are judges too: editing them could hide the rest.
  /^tools\/ci\//,
  /^\.github\//,
  /^\.githooks\//,
  /^\.claude\/rules\//,
];
// A shipped migration is immutable (CLAUDE.md invariant 9); a test beside one
// (`v8_to_v9.test.ts`) is not a migration.
const MIGRATION = /^packages\/persist\/src\/migrations\/v\d+_to_v\d+\.ts$/;

/**
 * What a change judges against, and which shipped migrations it touches.
 * `blocked` lists a migration that is modified, deleted or renamed away; a
 * new one, a copy and `migrations/index.ts` are not.
 */
export function judgeFiles(files) {
  const judges = [];
  const blocked = [];
  for (const { status, path, previous } of files) {
    const paths = status === 'renamed' && previous !== undefined ? [path, previous] : [path];
    for (const p of paths) if (JUDGES.some((pattern) => pattern.test(p))) judges.push(p);
    if (MIGRATION.test(path) && status !== 'added' && status !== 'copied') blocked.push(path);
    else if (status === 'renamed' && previous !== undefined && MIGRATION.test(previous)) {
      blocked.push(previous);
    }
  }
  return { judges: [...new Set(judges)], blocked: [...new Set(blocked)] };
}

/** The job summary: the files listed, and the migrations named as the reason it fails. */
export function judgeSummary({ judges, blocked }) {
  const list = (paths) => paths.map((p) => `- \`${p}\``).join('\n');
  const parts = ['## Files CI judges against'];
  if (judges.length === 0) parts.push('This pull request changes none.');
  else {
    parts.push(
      'A reviewer should read these: changing what a check compares against can turn it green without fixing what it found.',
      list(judges),
    );
  }
  if (blocked.length > 0) {
    parts.push(
      '## Shipped migrations changed',
      'A shipped migration is immutable (CLAUDE.md invariant 9): a file saved by an earlier version must still load the way it did. Add a new migration instead.',
      list(blocked),
    );
  }
  return `${parts.join('\n\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = parse(readFileSync(0, 'utf8'));
  if (process.argv[2] === 'judge') {
    // `judged=` and `blocked=` to stdout for $GITHUB_OUTPUT, the summary to
    // $GITHUB_STEP_SUMMARY when it is set.
    const result = judgeFiles(files);
    console.log(`judged=${result.judges.length > 0}`);
    console.log(`blocked=${result.blocked.length > 0}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, judgeSummary(result));
    }
  } else {
    const kinds = classify(files);
    for (const [name, value] of Object.entries(gates(kinds))) console.log(`${name}=${value}`);
    console.log(`kinds=${[...kinds].sort().join(' ')}`);
  }
}
