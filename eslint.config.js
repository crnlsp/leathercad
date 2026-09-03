import js from '@eslint/js';
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
      selector: 'BinaryExpression[operator=/^[!=]==?$/] > Literal[raw=/^-?[0-9]/]',
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
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

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
    // Tests need the freedom the production code does not get: literal
    // comparisons are the whole point of an assertion.
    files: ['**/*.test.ts', '**/*.bench.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
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
