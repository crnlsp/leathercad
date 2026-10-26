import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Several of this project's invariants are invisible in the code itself.
 * Nothing about `offsetPath(path, distance)` reveals that the units are
 * millimetres or that a local epsilon is forbidden — so the rules that can be
 * mechanised live here, where they also run in CI and in the editor.
 *
 * See CLAUDE.md § Invariants and docs/claude-code-setup.md §6.
 */

/**
 * A tolerance written as `1e-9` anywhere but `packages/core` is a local
 * epsilon, which invariant 7 forbids: they disagree with each other, and with
 * the ones in core, in ways no test sees until a snap or a containment fails.
 * The few such literals that are not tolerances — a measured coefficient, a
 * finite-difference step, a bound on input — say so where they stand, in the
 * disable comment's reason.
 */
const NO_LOCAL_EPSILON = {
  selector: 'Literal[raw=/^[0-9_.]+[eE]-[0-9_]+$/]',
  message:
    'A local epsilon. Use one from @leathercad/core, or add one there with what it bounds and why ' +
    'that value. See CLAUDE.md invariant 7.',
};

/** Restricted syntax in the pure layers: packages/core, geometry, domain. */
const PURE_LAYER_SYNTAX = [
  {
    // Integer counts are safe to compare exactly, so `.length === 0` and any
    // modulo result are excluded — flagging them buries the real signal.
    // Everything else compared against a numeric literal is suspect.
    selector:
      'BinaryExpression[operator=/^[!=]==?$/]:not(' +
      ':has(MemberExpression[property.name="length"])' +
      '):not(:has(BinaryExpression[operator="%"])) > Literal[raw=/^-?[0-9]/]',
    message:
      'No float equality. Use approxEq() and the epsilons from @leathercad/core. ' +
      'See CLAUDE.md invariant 7.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message:
      'Math.random() breaks determinism. Take an entropy source as a parameter. ' +
      'See docs/testing.md §8.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Date.now() breaks determinism. Take a clock as a parameter. See docs/testing.md §8.',
  },
  {
    selector: 'Identifier[name=/[Pp]x$/]',
    message:
      'Pixels do not exist in this layer. Millimetres are the source of truth. ' +
      'See CLAUDE.md invariant 1.',
  },
];

/** Rules applied to the pure layers. */
const PURE_LAYER_RULES = {
  'no-restricted-globals': [
    'error',
    ...[
      'window',
      'document',
      'navigator',
      'devicePixelRatio',
      'localStorage',
      'sessionStorage',
      'requestAnimationFrame',
      'fetch',
      'HTMLCanvasElement',
      'CanvasRenderingContext2D',
      'Path2D',
      'Image',
    ].map((name) => ({
      name,
      message: `${name} is not available in a pure layer. See CLAUDE.md invariant 3.`,
    })),
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/*.d.ts',
      'dependency-graph.svg',
      // Claude Code's agent worktrees: each lints itself, with its own config.
      '.claude/worktrees/**',
      // Machine-written glyph outlines; regenerate rather than edit.
      'packages/typography/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // TypeScript already reports undefined identifiers, and does it better —
    // it knows about DOM vs Node lib sets per tsconfig. Leaving no-undef on for
    // .ts files only produces false positives on `window`, `document` and
    // friends. It stays on for plain .js/.cjs, which tsc never sees.
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: { 'no-undef': 'off' },
  },

  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    // Everywhere but core, which is where tolerances live.
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    ignores: ['packages/core/**'],
    rules: { 'no-restricted-syntax': ['error', NO_LOCAL_EPSILON] },
  },

  {
    files: ['packages/{core,geometry,domain}/src/**/*.ts'],
    rules: {
      ...PURE_LAYER_RULES,
      'no-restricted-syntax': ['error', ...PURE_LAYER_SYNTAX, NO_LOCAL_EPSILON],
    },
  },

  {
    // Core is where tolerances live.
    files: ['packages/core/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...PURE_LAYER_SYNTAX] },
  },

  {
    // The rules of hooks, and the React Compiler's checks on top of them. A
    // stale closure in a panel reads an old document and dispatches a command
    // against it — a bug no type catches. See ADR 0016.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },

  {
    // CanvasHost writes refs during render: the deliberate latest-value
    // pattern the comment at `drawAsRef` explains. The two reads that could
    // show stale state — the cursor style from `managerRef` and the notice
    // bounds from `containerRef` — now come from props and state (Q3). Scoped
    // to this one file so nothing new joins it. See the engineering-tooling
    // spec §4.
    files: ['apps/desktop/src/renderer/src/CanvasHost.tsx'],
    rules: { 'react-hooks/refs': 'off' },
  },

  {
    // Tests need the freedom the production code does not get: literal
    // comparisons are the whole point of an assertion.
    files: ['**/*.test.ts', '**/*.bench.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // The end-to-end suite measures what the app wrote, so its slack is a
    // test's, as above; nothing else is restricted there.
    files: ['e2e/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  {
    // Development-time scripts and configs: Node programs, run by hand, by a
    // package script or by a tool, never bundled. `pnpm fonts:generate`,
    // `pnpm test:visual` and the Stryker and electron-builder configs.
    files: ['packages/*/tools/**/*.mjs', 'tools/**/*.mjs', '**/*.config.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['**/*.config.{js,ts}', 'tools/**/*.{js,ts}'],
    rules: {
      'no-console': 'off',
    },
  },
);
