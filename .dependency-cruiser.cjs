/**
 * Layering enforcement for LeatherCAD.
 *
 * The dependency graph in docs/architecture.md §2 is the architecture. Without
 * automated enforcement it decays within weeks, so a violation fails CI.
 *
 * To add a package: add it to LAYERS with the packages it is allowed to import.
 * Anything not listed is forbidden. Keep this in sync with CLAUDE.md § Layout.
 */

/** @type {Record<string, string[]>} */
const LAYERS = {
  core: [],
  // The OS boundary (PlatformHost). A port, not an adapter: apps/desktop
  // supplies the Electron implementation. See ADR 0002 and architecture.md §5.
  platform: ['core'],
  geometry: ['core'],
  domain: ['core', 'geometry'],
  document: ['core', 'geometry', 'domain'],
  persist: ['core', 'geometry', 'domain'],
  render: ['core', 'geometry', 'domain'],
  export: ['core', 'geometry', 'domain', 'render'],
  print: ['core', 'geometry', 'domain', 'render', 'export'],
  editor: ['core', 'geometry', 'domain', 'document', 'render'],
  ui: [
    'core',
    'platform',
    'geometry',
    'domain',
    'document',
    'persist',
    'render',
    'editor',
    'export',
    'print',
  ],
  cli: [
    'core',
    'platform',
    'geometry',
    'domain',
    'document',
    'persist',
    'render',
    'export',
    'print',
  ],
};

const layerRules = Object.entries(LAYERS).map(([pkg, allowed]) => ({
  name: `layer-${pkg}`,
  comment:
    allowed.length === 0
      ? `packages/${pkg} is the bottom layer and may not import any other workspace package.`
      : `packages/${pkg} may import only: ${allowed.join(', ')}. See docs/architecture.md §2.`,
  severity: 'error',
  from: { path: `^packages/${pkg}/` },
  to: {
    path: '^packages/([^/]+)/',
    pathNot: `^packages/(${[pkg, ...allowed].join('|')})/`,
  },
}));

module.exports = {
  forbidden: [
    ...layerRules,

    {
      name: 'no-circular',
      comment: 'Circular dependencies make evaluation order undefined and break tree shaking.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },

    {
      name: 'nothing-imports-upward',
      comment:
        'Nothing may import ui, editor or the desktop app. export and print must run headless.',
      severity: 'error',
      from: { pathNot: '^(packages/(ui|editor)|apps/desktop)/' },
      to: { path: '^(packages/(ui|editor)|apps/desktop)/' },
    },

    {
      name: 'electron-only-in-desktop',
      comment:
        'Only apps/desktop may import Electron. This is what keeps the Tauri escape hatch open — ' +
        'see docs/architecture.md §1.1 and §5.',
      severity: 'error',
      from: { pathNot: '^apps/desktop/' },
      to: { dependencyTypes: ['npm', 'npm-dev'], path: '^electron' },
    },

    {
      name: 'no-clipper',
      comment:
        'No Clipper binding, anywhere. Both candidates were tried and rejected in slice 1.9: ' +
        'clipper2-js computes offsets wrongly, and clipper2-wasm cannot compile under the ' +
        "renderer's CSP. Robust offsetting will be written here instead. See ADR 0008.",
      severity: 'error',
      from: {},
      to: { path: 'clipper' },
    },

    {
      name: 'geometry-stays-pure',
      comment:
        'packages/geometry must not touch the filesystem, the network, or any Node built-in. ' +
        'It is pure millimetre maths. See docs/geometry.md §1.',
      severity: 'error',
      from: { path: '^packages/geometry/' },
      to: { dependencyTypes: ['core'] },
    },

    {
      name: 'domain-stays-pure',
      comment: 'packages/domain must not touch the filesystem or the network.',
      severity: 'error',
      from: { path: '^packages/domain/' },
      to: { dependencyTypes: ['core'] },
    },

    {
      name: 'problem-messages-stay-in-the-catalogue',
      comment:
        'Only problems/index.ts may import the message catalogue. The rest of the domain reports ' +
        'problems as typed facts and must not be able to reach for a sentence — that is how a ' +
        'second, ad-hoc way of reporting errors would start. See ' +
        'docs/superpowers/specs/2026-09-15-diagnostic-channel-design.md.',
      severity: 'error',
      from: {
        path: '^packages/domain/src/',
        pathNot: '^packages/domain/src/problems/(index|problems\\.test)\\.ts$',
      },
      to: { path: '^packages/domain/src/problems/messages\\.ts$' },
    },

    {
      name: 'no-deep-package-imports',
      comment:
        'Cross-package imports go through the package index, never into its internals. ' +
        'See CLAUDE.md § Conventions.',
      severity: 'error',
      from: { path: '^(?:packages|apps)/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/src/',
        pathNot: [
          // A package reaching into its own internals is fine.
          '^packages/$1/',
          // Everything else must enter through the package index.
          '^packages/[^/]+/src/index\\.ts$',
        ],
      },
    },

    {
      name: 'no-relative-cross-package',
      comment:
        'Reach another package by its name (@leathercad/core), never by a relative path. ' +
        'A relative path walks around the package boundary and defeats the layer rules above.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/',
        pathNot: '^packages/$1/',
        dependencyTypes: ['local'],
      },
    },

    {
      name: 'no-dev-deps-in-src',
      comment:
        'Library source must not depend on devDependencies. Scoped to packages/ deliberately: ' +
        'in apps/desktop, electron is correctly a devDependency because the packager bundles the ' +
        'runtime rather than npm shipping it, so the distinction does not apply there.',
      severity: 'error',
      from: { path: '^packages/[^/]+/src/', pathNot: '\\.(test|bench)\\.ts$' },
      to: { dependencyTypes: ['npm-dev'], pathNot: 'node_modules/@types/' },
    },

    {
      name: 'no-orphans',
      comment: 'An unreachable module is usually a leftover. Delete it or wire it up.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          // Any *.config.{js,ts,cjs,mjs}: eslint, vitest, prettier,
          // electron.vite, playwright. Tooling reads these; nothing imports them.
          '\\.config\\.(js|ts|cjs|mjs)$',
          '(^|/)index\\.ts$',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|out|coverage)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    // pnpm symlinks workspace packages into node_modules. Resolving through the
    // symlink is what makes the layer path regexes above match.
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.ts', '.tsx', '.d.ts'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
