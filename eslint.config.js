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

/** Rules applied to the pure layers: packages/core, geometry, domain. */
const PURE_LAYER_RULES = {
  'no-restricted-syntax': [
    'error',
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
      message:
        'Date.now() breaks determinism. Take a clock as a parameter. See docs/testing.md §8.',
    },
    {
      selector: 'Identifier[name=/[Pp]x$/]',
      message:
        'Pixels do not exist in this layer. Millimetres are the source of truth. ' +
        'See CLAUDE.md invariant 1.',
    },
  ],
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
    files: ['packages/{core,geometry,domain}/src/**/*.ts'],
    rules: PURE_LAYER_RULES,
  },

  {
    // The rules of hooks, and the React Compiler's checks on top of them. A
    // stale closure in a panel reads an old document and dispatches a command
    // against it — a bug no type catches. See ADR 0016.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },

  {
    // FINDING, recorded when the plugin was added: CanvasHost reads refs during
    // render in ten places. Most are the deliberate latest-value pattern the
    // comment at `drawAsRef` explains. Two are not obviously safe: the cursor
    // style reads `managerRef` and the notice bounds read `containerRef`, so
    // neither updates until something else re-renders. Scoped to this one file
    // so nothing new joins it. See the engineering-tooling spec §4.
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
