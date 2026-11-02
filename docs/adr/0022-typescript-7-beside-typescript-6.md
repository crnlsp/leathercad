# 22. Typecheck with TypeScript 7; keep TypeScript 6 for the tools that read its API

**Status:** Accepted
**Date:** 2026-10-26
**Supersedes:** [0005](0005-typescript-5-9.md)

## Context

[ADR 0005](0005-typescript-5-9.md) pinned TypeScript to 5.9.3 because `typescript-eslint` declares a
peer of `typescript >=4.8.4 <6.1.0`. That is still true of 8.72.0. Its stated reason, though, was
losing *type-aware* linting, and the project has none: `eslint.config.js` uses
`tseslint.configs.recommended` with no `parserOptions.project`. typescript-eslint is the parser that
lets ESLint's core `no-restricted-syntax` and `no-restricted-globals` read `.ts` files, plus its
syntactic rules. Those carry the mechanised invariants — no float equality, no pixels, no
`Math.random()` or `Date.now()`, no DOM in the pure layers — so the parser is still needed. It parses
through the TypeScript 6 JavaScript API, which TypeScript 7 no longer has: 7's `typescript` package
exports a version string and `unstable/*` only.

The TypeScript team documents the way out, under *Running Side-by-Side with TypeScript 6.0* in the
7.0 announcement: `@typescript/typescript6` is TypeScript 6 with its compiler binary renamed to
`tsc6`, published so that it can stand in for `typescript` while 7 provides `tsc`.

One other file reads the API: `apps/desktop/src/renderer/src/untranslated.test.ts` walks the
renderer's JSX with `ts.createSourceFile` to find words written outside the catalogue (ADR 0018).

## Decision

Two exact versions in the root `package.json`, each under the name its readers look for:

```json
"@typescript/native": "npm:typescript@7.0.2",
"typescript": "npm:@typescript/typescript6@6.0.2"
```

- `tsc` on every script's PATH is TypeScript 7.0.2, so `pnpm typecheck` and each package's
  `typecheck` build with it. The 6 package's binary is `tsc6`; nothing calls it.
- `import 'typescript'` — from typescript-eslint and from `untranslated.test.ts` — gets TypeScript
  6.0, inside typescript-eslint's peer range. (`@typescript/typescript6@6.0.2` wraps
  `typescript@6.0.3`, which is what `ts.version` reports.)

`tsconfig.base.json` sets `"types": ["node"]`. TypeScript 6 changed the default from every
`@types` package in reach to none, and `@types/node` was the only one in reach, so naming it keeps
what every package compiled against before. Nothing else in the project needed to change for 6 or
7: the tsconfigs already use `moduleResolution: bundler`, an explicit `rootDir` and `strict`, and
no `baseUrl`.

**When to drop the alias:** once typescript-eslint parses with TypeScript 7 —
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940), and
[#12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803) for 7.1's API (7.1's
beta shipped on 2026-10-20). Then `typescript` becomes plain `typescript@7.x`, `@typescript/native`
goes, `untranslated.test.ts` moves to whatever API 7 offers, and this ADR is superseded.

## Consequences

- `pnpm typecheck` takes about 1 s rather than about 7 s with TypeScript 6 on the same tree.
- The linter parses with 6.0 and the build checks with 7.0. Both accept this configuration
  without a warning, and `tsc6 --build --force` passes too, so the two agree today. A 7-only feature
  would parse in `tsc` but could fail in the linter; using one waits for the alias to go.
- Checked when this was decided: one planted violation of each `PURE_LAYER_RULES` selector and
  global, of `@typescript-eslint/no-explicit-any` and of the hooks rules was reported by `pnpm lint`.
  knip, dependency-cruiser and Stryker accept the aliases unchanged.
- An editor's own TypeScript is unaffected. The 6 package ships no `lib/tsserver.js`, so an editor
  asked to use the workspace's version falls back to its bundled one.
- Dependabot ignores major and minor updates of `typescript`, `@typescript/native` and
  `@typescript/typescript6` — the aliases and what they point at, since how it matches an alias is
  not documented — so neither the 6 the linter needs nor the 7 that builds moves without a change
  to this ADR. Patches are still proposed.

## Alternatives rejected

- **Stay on 5.9.** Holds the compiler back for a constraint that the side-by-side packages exist to
  remove.
- **TypeScript 7 without typescript-eslint, or oxlint instead of ESLint.** oxlint has no
  `no-restricted-syntax`, so every invariant selector would have to be rewritten as a custom
  plugin, to save a lint that takes about 8 s.
- **TypeScript 7 with `--legacy-peer-deps` or a peer override.** typescript-eslint would load a
  `typescript` with no compiler API and fail at the first file.
- **TypeScript 6 alone.** Valid, and the fallback if 7 ever cannot build the project, but slower and
  no closer to where typescript-eslint is going.
