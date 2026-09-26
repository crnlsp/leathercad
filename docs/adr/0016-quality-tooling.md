# 16. Quality tooling: knip, the hooks rules, axe, and Stryker

**Status:** Accepted
**Date:** 2026-09-23

## Context

The tooling review found checks the project relied on without having: nothing noticed dead code or
unused dependencies; nothing checked React hook usage; nothing checked accessibility; and nothing
checked whether the tests themselves would catch a wrong answer. That last one matters most. A
90 % coverage threshold proves lines ran, not that any assertion would fail if they were wrong.
Plausible-but-wrong geometry is this project's characteristic failure.

## Decision

Four development dependencies. None of them ships.

**knip** checks for unused files, exports and dependencies, and for binaries that are used but not
listed. It runs in `pnpm check` and in CI's static job. Every exception in `knip.jsonc` says whether
it is deliberate or a recorded finding. So the list is a ratchet: nothing new can join it, and
removing an entry is the owner's decision. On its first run it found two unused dependencies. One
(`@leathercad/core` in persist) was removed. The other (`pdfjs-dist`) was recorded, because ADR 0007
names it, and removed after 1.0 with the other two findings (ADR 0007, *Amended*).

**eslint-plugin-react-hooks** (v7, recommended) runs on the renderer. It covers the rules of hooks
and the React Compiler's checks. It found ten reads of refs during render in `CanvasHost.tsx`.
They are recorded, and the rule is off for that file only.

**@axe-core/playwright** scans the running window inside E2E (`e2e/accessibility.spec.ts`). It
ratchets the same way. It found four violations. The serious one, a project-name field named only
by its tooltip, was a one-attribute fix. The other three are in markup the F slices are rebuilding,
so they are listed with what they found, and any new one fails. So does a listed one that has been
fixed, so the list cannot go stale. It runs in legacy mode, because Electron cannot open the
scratch page axe uses by default.

**StrykerJS** (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`) runs mutation testing on
`geometry` and `domain`: weekly in CI, and on demand with `pnpm test:mutation:geometry` and
`pnpm test:mutation:domain`. It runs one package at a time, from inside the package, so each uses
its own Vitest config. There is no break threshold until a first full report shows what to hold.

**Stryker needs a patch on Vitest 5.** In stryker-js#6210, still open, the runner filters tests by
names joined with a space, and Vitest 5 matches `testNamePattern` against names joined with
`' > '`. Nothing matches, so every covered mutant is reported as *surviving*. Measured here: 9 % on
`vec2.ts` without the patch, 84 % with it. `patches/@stryker-mutator__vitest-runner@10.0.0.patch`
changes the join in the runner's two copies of `collectTestName`. Delete it when the fix is
released. Stryker also pulls in `qs` 6.15.1, which has three advisories, through
`typed-rest-client`. It is overridden to 6.16.0 in `pnpm-workspace.yaml`.

## Also decided, with no dependency

- **Pixel diffs** use Playwright's own `toHaveScreenshot`, inside the official Playwright image,
  from `tools/visual.mjs`. No `pixelmatch`, which `docs/testing.md` had planned: Playwright already
  bundles it.
- **Benchmarks** use Vitest 5's `bench` test fixture, with baselines through `writeResult` and
  `bench.from`.
- **The SBOM** comes from `pnpm sbom`, not `cdxgen`.
- **Workflow checks** (`zizmor`, `actionlint`, `osv-scanner`) run as pinned actions and container
  images in CI. They are not npm dependencies.

## Rejected

- **eslint-plugin-jsx-a11y.** Last released in 2024, and it does not support ESLint 10. The
  maintained fork was at 0.2. axe checks the rendered result instead, which is what a user meets.
- **type-coverage.** It reads `apps/desktop`'s project references as 0 of 0, and elsewhere it adds
  nothing to `strict`, `noUncheckedIndexedAccess` and `no-explicit-any` beyond counting `as` casts.
- **lefthook, mise, pinact, CodSpeed, Vitest browser-mode screenshots.** Each duplicates something
  already in place. The engineering-tooling spec §3 gives the reason for each.
