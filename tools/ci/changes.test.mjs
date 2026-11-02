import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { classify, gates, parse } from './changes.mjs';

/** The kinds a pull request's files are, sorted, from paths or file records. */
const kinds = (...files) =>
  [
    ...classify(files.map((f) => (typeof f === 'string' ? { status: 'modified', path: f } : f))),
  ].sort();

describe('the kinds of change a pull request makes', () => {
  test('documentation alone is docs', () => {
    assert.deepEqual(
      kinds('docs/roadmap.md', 'README.md', 'CONTRIBUTING.md', 'packaging/aur/PKGBUILD'),
      ['docs'],
    );
  });

  test('the renderer is code', () => {
    assert.deepEqual(kinds('apps/desktop/src/renderer/x.tsx'), ['code']);
  });

  test('the main process is packaging', () => {
    assert.deepEqual(kinds('apps/desktop/src/main/print.ts'), ['packaging']);
  });

  test('a file moved into docs/ is still code, by where it came from', () => {
    assert.deepEqual(kinds({ status: 'renamed', path: 'docs/a.ts', previous: 'src/a.ts' }), [
      'code',
      'docs',
    ]);
  });

  test('the lockfile is deps', () => {
    assert.deepEqual(kinds('pnpm-lock.yaml'), ['deps']);
  });

  test('a workflow is workflows', () => {
    assert.deepEqual(kinds('.github/workflows/ci.yml'), ['workflows']);
  });

  test('no files at all is code: nothing proves it is less', () => {
    assert.deepEqual(kinds(), ['code']);
  });

  test('an unknown top-level file is code', () => {
    assert.deepEqual(kinds('something.new'), ['code']);
  });

  test('markdown under apps/ or .claude/ is code: tests and agents read it', () => {
    assert.deepEqual(kinds('apps/desktop/README.md'), ['code']);
    assert.deepEqual(kinds('.claude/rules/tests.md'), ['code']);
  });

  test('a document a test reads is code', () => {
    assert.deepEqual(kinds('docs/domain-model.md'), ['code']);
  });

  test("the scan's exceptions and the pinned Node are deps", () => {
    assert.deepEqual(kinds('osv-scanner.toml'), ['deps']);
    assert.deepEqual(kinds('.node-version'), ['deps']);
  });

  test('a package.json anywhere is deps, and a font is packaging', () => {
    assert.deepEqual(kinds('packages/geometry/package.json'), ['deps']);
    assert.deepEqual(kinds('assets/fonts/IBMPlexSans-Regular.woff'), ['packaging']);
  });
});

describe('the jobs each kind runs', () => {
  const run = (...k) => gates(new Set(k));

  test('docs runs only what always runs', () => {
    assert.deepEqual(run('docs'), {
      tests: false,
      installers: false,
      scan: false,
      lint: false,
    });
  });

  test('code runs the tests and the Linux package, nothing else', () => {
    assert.deepEqual(run('code'), {
      tests: true,
      installers: false,
      scan: false,
      lint: false,
    });
  });

  test('packaging runs everything code does, and every installer', () => {
    assert.deepEqual(run('packaging'), {
      tests: true,
      installers: true,
      scan: false,
      lint: false,
    });
  });

  test('deps adds the scan', () => {
    assert.deepEqual(run('deps'), {
      tests: true,
      installers: true,
      scan: true,
      lint: false,
    });
  });

  test('workflows adds the linters', () => {
    assert.deepEqual(run('workflows'), {
      tests: true,
      installers: true,
      scan: false,
      lint: true,
    });
  });
});

describe('the list the API gives', () => {
  test('reads a status, a path and, for a rename, the path before', () => {
    assert.deepEqual(parse('modified\tdocs/a.md\nrenamed\tdocs/b.ts\tsrc/b.ts\n'), [
      { status: 'modified', path: 'docs/a.md' },
      { status: 'renamed', path: 'docs/b.ts', previous: 'src/b.ts' },
    ]);
  });

  test('an empty list is no files', () => {
    assert.deepEqual(parse(''), []);
  });
});
