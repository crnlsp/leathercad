# Engineering tooling — design

**Date:** 2026-09-23
**Status:** Proposed with the slice's pull request.
**Scope:** everything the tooling review ranked **A** or **B** with **S** or **M** effort. The user
asked for it to be built, with tools dropped or added as the work showed their real value.

---

## 1. What this is, and what it is not

This change touches the product only where a tool has to hook into it: the logs in the main
process, and the packaging config. It changes nothing a user draws or prints. It adds:

- a way to **ship** the app: an AppImage built on every pull request, fuses set, release notes and
  tags maintained automatically;
- the two test layers `docs/testing.md` promised and never got: **pixel diffs** and
  **benchmarks**;
- tests that check the **tests**: mutation testing and a deep nightly property run;
- **supply-chain checks** on the workflows and the lockfile;
- a **log file and local crash dumps**, so a crash on someone else's machine leaves evidence behind.

It deliberately does **not**:

- touch the UI (F.2–F.7 own it), the document model, or the file format;
- fix what a new tool finds in product code. Findings are recorded and ratcheted, per the audit
  gate. The exception is a finding that is mechanical and changes no behaviour;
- sign or notarise anything, or build for Windows and macOS. That is Phase 8;
- add an in-app "copy diagnostics" action, crash upload, or auto-update. Each needs a product
  decision or an account first. See §5.

## 2. Acceptance criteria

1. The repository pins pnpm (`packageManager`) and Node (`.node-version`). CI reads both pins, and
   any installed pnpm switches itself to the pinned version. Installing pnpm itself is still needed:
   Arch's Node ships no corepack.
2. Every third-party action in `.github/workflows/` is pinned to a commit SHA, and CI fails if one
   is not.
3. CI runs `knip`, `zizmor`, `actionlint` and `osv-scanner`, and every one is green on this branch.
4. `pnpm test:visual` runs pixel diffs of the app in a pinned container, identically on a laptop and
   in CI.
5. `pnpm bench` runs the benchmark suite. `pnpm bench:compare` compares it against the committed
   baseline, and `pnpm bench:baseline` rewrites that baseline.
6. `pnpm test:mutation:geometry` and `pnpm test:mutation:domain` run Stryker. A weekly workflow runs
   both and keeps the reports.
7. A nightly workflow runs the property tests at a raised `numRuns` with a random seed. It opens an
   issue carrying the seed when one fails.
8. Every pull request builds an AppImage. A smoke test launches the **packaged** app and exports a
   PDF from it, and the AppImage is uploaded as an artifact.
9. Merging to `main` keeps a release pull request open. Merging that pull request tags a release
   and attaches the AppImage and an SBOM to it.
10. The main process writes a rotating log to `~/.local/state/leathercad/logs/` and keeps crash
    dumps beside it. Nothing is uploaded. §4 says why the location moved from `~/.config`.
11. An accessibility scan runs inside E2E and fails on any violation not already recorded.
12. `pnpm check` is still the pre-push gate, and it is still green.

## 3. Decisions, tool by tool

**Added** means built here. **Dropped** means the review listed it, and building it showed it
should not be added, for the reason given.

| Gap | Tool | Outcome |
|---|---|---|
| Toolchain | `packageManager` + `.node-version` | Added |
| Toolchain | `mise` | Dropped. pnpm 11 switches itself to the `packageManager` version, and every Node manager reads `.node-version`. A third file would only restate both. |
| Toolchain | `lefthook` | Dropped. The pre-push hook already runs `pnpm check`, and the editor hook formats on save. A pre-commit layer would duplicate both. |
| Supply chain | SHA-pinned actions | Added |
| Supply chain | `pinact` | Dropped as a tool. The pins were resolved once. `zizmor`'s `unpinned-uses` audit enforces them from now on, and Dependabot bumps them. |
| Supply chain | `zizmor` + `actionlint` | Added. Both run in their own CI job. |
| Supply chain | `osv-scanner` | Added |
| Supply chain | CodeQL, OpenSSF Scorecard | Added. Both are skipped while the repository is private: code scanning needs Advanced Security there. |
| Supply chain | SBOM (`cdxgen`) | Replaced by `pnpm sbom`, built into pnpm 11. No dependency. |
| Supply chain | Socket.dev | Pending. It is a GitHub App the owner installs. |
| Release | `electron-builder` | Added, with a packaged smoke test on every pull request |
| Release | `@electron/fuses` | Dropped as a direct dependency. `electron-builder`'s `electronFuses` option drives it. |
| Release | `release-please` | Added |
| Release | build provenance | Added. Skipped while private, where attestations need Enterprise Cloud. |
| Visual | Playwright `toHaveScreenshot` in the Playwright image | Added. No new dependency. |
| Visual | Vitest browser-mode screenshots | Dropped. The canvas backend is tested through a recorder (slice 2.3). The pixels that matter are the app's, and those are covered by the Playwright layer. |
| Performance | `vitest bench` | Added |
| Performance | CodSpeed | Dropped. It is a hosted account, and the committed-baseline comparison `docs/testing.md` already specifies needs none. |
| Test strength | StrykerJS | Added, with a two-line patch to its Vitest runner (§4) |
| Test strength | nightly deep `fast-check` + `.lcp` fuzzing | Added |
| Test strength | `@axe-core/playwright` | Added |
| Test strength | `eslint-plugin-jsx-a11y` | Dropped. Its last release is from 2024 and it does not support ESLint 10. The maintained fork is at 0.x. `axe` checks the rendered result instead. |
| Code health | `knip` | Added |
| Code health | `eslint-plugin-react-hooks` | Added |
| Code health | `type-coverage` | Dropped. It reads the desktop app's project references as 0 of 0. Elsewhere, strict TS, `noUncheckedIndexedAccess` and `no-explicit-any` already cover it, apart from counting `as` casts. |
| Diagnostics | `electron-log` + `crashReporter` | Added |
| Diagnostics | error boundary | Pending. What a failed panel shows is UI copy, which belongs to the F slices and the single diagnostic channel. React needs no library for it. |
| Diagnostics | Sentry, opt-in | Pending. It needs an account, a DSN and a privacy decision. |
| Cross-platform | Windows and macOS unit tests | Added, weekly rather than per pull request: macOS minutes cost ten times as much on a private repository. |

## 4. Decisions settled during the work

- **Stryker is patched, not dropped.** On Vitest 5, `@stryker-mutator/vitest-runner` 10.0.0 builds
  its test-name filter by joining names with a space. Vitest 5 matches against names joined with
  `' > '`, so no test runs against a covered mutant and every one "survives". `vec2.ts` scored 26 %
  through the root config, 9 % per package, and **84 %** with the patch. The patch changes that
  join in the runner's two copies of `collectTestName`, which must agree or coverage keys stop
  matching. Upstream: stryker-js#6210, open. The patch lives in `patches/`, and its entry in
  `pnpm-workspace.yaml` names the issue.
- **Stryker runs one package at a time, from inside it,** so each package uses its own Vitest
  config (setup file, timeouts) exactly as `pnpm test` does. This was adopted while diagnosing the
  bug above. The root config's `projects` has not been re-tried since the patch, and one package
  per run keeps the weekly job's matrix simple either way.
- **`qs` is overridden to 6.16.0.** osv-scanner's first run found three medium advisories in
  `qs` 6.15.1. `typed-rest-client`, a Stryker dependency, pins it exactly. The override is scoped to
  that one parent.
- **The file-protocol fuse stays on.** With `grantFileProtocolExtraPrivileges` off, the packaged
  window is blank: module scripts will not load from `file://`. The smoke test caught it on its first
  run. Turning it off needs a custom `app://` protocol, which is pending.
- **The packaged smoke test builds with one fuse relaxed.** Playwright attaches through the
  inspector arguments. Everything else is the shipped configuration, and the shipped binary's fuses
  were read back with `@electron/fuses read`.
- **No runtime `node_modules`.** The main process imports only Electron and Node, so React and the
  typography package moved to devDependencies (Vite bundles them), and `electron-log` is bundled
  too.
- **Logs are state, not configuration.** They go to `~/.local/state/leathercad/` (XDG), not
  `~/.config/leathercad/`.
- **Vitest 5 benchmarks are tests.** The top-level `bench()` export is gone. Benchmarks are
  `test(…, ({ bench }) => …)`, and baselines use `writeResult` and `bench.from`. There is no
  filesystem check, because `geometry` may not import Node built-ins.
- **Line endings are pinned.** `.gitattributes` forces LF, so the Windows job compares golden files
  honestly. The vendored fonts directory is exempt and stays byte-exact.
- **The Dependabot cooldown is seven days,** at zizmor's request. It matches the pnpm release-age
  policy.

### Findings the new tools recorded

Each is ratcheted where it was found, and classified at review (2026-09-23). The owner's rule:
fix only what is cheap and outside the markup the F slices are rebuilding; record the rest.

| # | Found by | Finding | Kind | What happens to it |
|---|---|---|---|---|
| F1 | loader fuzz test | **A `.lcp` whose `pitchMm` is tiny (e.g. `1e-300`) exhausts memory on load.** The schema allows any non-negative pitch, and nothing caps the hole count. The editor cannot create that file (`StitchHoleSetEditor` has `min={0.5}`), so only a damaged, hand-edited or hostile file reaches it. | **Robustness bug** | Roadmap slice **5.6**, with a named regression test. No format change. The fuzz test finds it at 20 000 runs, and the nightly job reports it. |
| F2 | benchmarks | Offsetting a 500-point traced outline takes ~74 ms on its own, over the 50 ms regeneration budget in `product-spec.md` §7. | Informational | A benchmark finding. Not optimised to the budget. |
| F3 | react-hooks | `CanvasHost.tsx` reads refs during render in ten places. Two may show stale state: the cursor style (`managerRef`) and the notice bounds (`containerRef`). | Deferred to F.3 | Look at the two when F.3 is in `CanvasHost`. No broad refactor. Rule off for that file only. |
| F4 | axe | Four violations on the empty window. **Fixed:** the project-name input had no name but its tooltip (serious); it now has an `aria-label`, one attribute outside the F slices' markup. **Recorded:** no `<main>`, three unnamed `<aside>` panels, content outside landmarks. | Three deferred to the F slices | `e2e/accessibility.spec.ts` `KNOWN`. F.2 rewrites the same `<aside>` lines, so fixing them here would only conflict. |
| F5 | knip | `pdfjs-dist` is unused, though ADR 0007 names it. | `knip.jsonc` |
| F6 | knip | `totalLength()` in geometry and the `IpcChannel` type are exported and unused. | `knip.jsonc` |
| F7 | knip | `@leathercad/core` was declared by persist and never imported. | **Removed**: a manifest line with no behaviour |

## 5. Pending: things only the owner can do

- **Allow GitHub Actions to create pull requests** (Settings → Actions → General). release-please
  needs it.
- **Install Socket.dev**, if wanted.
- **Sentry or GlitchTip**, if crash upload is ever wanted. Opt-in, and a privacy decision first.
- **Branch rulesets and code scanning**, once the repository is public. CodeQL, Scorecard and build
  provenance switch on by themselves then.
- **The first full mutation run** sets the break threshold. It runs weekly, or by hand. Until then
  mutation testing and the nightly and weekly suites are informational and gate nothing.
- **A custom `app://` protocol**, so the file-protocol fuse can be turned off. A later architectural
  slice, not a blocker. The `file://` configuration is documented in ADR 0014 and the builder
  config.
- **An error boundary** and **"copy diagnostics"**, once the F slices decide what a failed panel
  says.
- **The physical print measurement.** No tool replaces it.
