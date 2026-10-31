# CI/CD and shipping — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One task is one pull request into `develop`, titled as a Conventional Commit.

**Goal:** Reorganise CI into five rings (local, PR gate, after merge, on a timer, release), ship LeatherCAD through a deliberate set of channels with support levels, remove CodeRabbit, and let Dependabot's minor and patch updates merge themselves.

**Architecture:** Workflows are regrouped by the question each answers, not by history. One reusable workflow builds and smoke-tests the installers for every caller (PR, after merge, candidate, release). A PR gate classifies the changed files and runs only what the change can break, summed up by one `Ready to merge` job. Shipping follows three support levels that decide what holds a release.

**Tech stack:** GitHub Actions (hosted runners, free on this public repo), electron-builder 26, Playwright for Electron, release-please, Dependabot, Node 24 (`node:test` for the new CI scripts, so no new dependency).

**Spec:** the CI/CD and shipping proposal reviewed with the maintainer between 2026-10-26 and 2026-10-31 (a private review page; its decisions are copied below, so this plan stands alone). Written against `develop` at `7c2c3c8`.

## Decisions this plan implements

- **D1 Rings.** Local (pre-push `pnpm check`) · PR gate (is this safe to merge?) · after merge (does develop still build and install everywhere?) · on a timer (is develop healthy in depth?) · release (is this complete and exactly what we tested?).
- **D2 Required checks.** develop: `Ready to merge` + `Conventional title`. main: `Ready to merge` + `Release gate`. Today each ruleset lists 13 names.
- **D3 Change kinds.** `docs`, `code`, `packaging`, `deps`, `workflows`. A path that is not certainly docs counts as code. Which jobs each kind runs is the matrix in Task A4.
- **D4 E2E** runs in 3 shards on PRs (keeps 1 retry); after merge it runs with **0 retries**, so a flaky test opens an issue.
- **D5 A red develop is reverted first, fixed second** (every open PR is tested merged with develop).
- **D6 Timers.** Nightly: property tests with a fresh seed and the vulnerability scan **always**; Windows and macOS E2E and benchmarks only when develop changed since their last green run. Weekly: mutation (skipped when unchanged), CodeQL, Scorecard, the wide OS matrix.
- **D7 Wide OS matrix** (weekly and every candidate): `ubuntu-22.04`, `ubuntu-24.04`, `ubuntu-26.04`, `archlinux` container, `windows-2022`, `windows-2025`, `windows-11-arm`, `macos-15`, `macos-26`, `macos-15-intel`. Full E2E on the oldest and newest Windows and macOS, the packaged smoke test everywhere.
- **D8 Support levels.** Level 1 (measured): Arch, Ubuntu LTS — any bug holds the whole release. Level 2 (tested): Windows 10 22H2 and 11 x64 — a confirmed bug holds the Windows files only. Level 3 (shipped): other Linux, macOS 12+ — known issue in the notes; only a 1:1 scale bug or lost work holds that platform's file.
- **D9 Version rules.** Ubuntu: LTS releases in standard support. Arch: current at release. Windows and macOS: what Electron supports (macOS 12+ since Electron 38). Intel Macs drop when their build fails or Apple stops patching macOS 26. Linux ARM, Windows 7/8/8.1, 32-bit: not supported.
- **D10 Channels.** GitHub Releases (AppImage, Flatpak, `.deb`, `.exe`, `.dmg`), AUR `leathercad-bin`, Microsoft Store (MSIX, the main Windows channel, never attached to GitHub). Optional later: Flathub, SignPath, a winget manifest for the `.exe`. Cut: Snap, `.rpm`, own apt repo, Chocolatey/Scoop, native Windows ARM build, MSIX outside the Store, notarisation, Homebrew, Mac App Store.
- **D11 Channels of a build.** Preview: one rolling pre-release after every merge, version `<next>-preview.<sha>`. Candidate: `<next>-rc.<n>`, built by a button, measured by testers through an issue form; **the release is exactly the candidate's commit**. Stable: release-please. The in-app check (8.9) announces only `leathercad-vX.Y.Z`.
- **D12 Verifier guard.** A PR that touches what CI judges against gets the `judge-changed` label and a summary listing the files; editing a shipped migration fails the gate.
- **D13 CodeRabbit is removed** for now: config, docs, and the app's access to the repository.
- **D14 Auto-merge.** Dependabot's grouped **minor and patch** updates merge themselves once the gate passes. Majors arrive as single PRs and wait for the maintainer. The release-please PR never auto-merges.

## Global constraints

- `.claude/rules/workflows.md` holds for every workflow: actions pinned to a commit with the version in a comment *(strict)*; top-level `permissions` is `contents: read` or `{}` and a job widens only its own *(strict)*; no `${{ }}` inside a script, pass it through `env:` *(strict)*; `persist-credentials: false` on every checkout *(strict)*; every job has `timeout-minutes`; a comment says why each step exists.
- "A check that gates develop or main stays required" is changed by Task A4, in its first commit, before anything leaves the gate.
- No new dependency (CLAUDE.md: each needs an ADR). New CI scripts are plain Node with `node:test`; no new action is added.
- No private data in anything that leaves the machine: maintainer fields in `.deb` and PKGBUILD use the GitHub noreply address.
- Never add a ☐ or ◐ line to the roadmap's next-release section for this work: `tools/release-gate.sh` counts them and would block 1.6. This plan is linked once under *Later*.
- A ruleset is changed only by the maintainer (or with their approval of the exact JSON). Every ruleset PUT states `require_extra_approval_for_unattributed_changes` explicitly: the API resets it to `true` when it is left out.
- A PR that changes platform behaviour names each platform it ran on and lists the others as unverified (`.claude/rules/desktop-main.md`).
- Docs that a change invalidates are updated in the same PR (CLAUDE.md). `pnpm check` passes; `pnpm test:e2e` too when the app changes.
- pnpm may not be on PATH: `export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"` (fish: `set -x PATH …`).

## Review focus

1. **A fork PR** (read-only token, like the Russian translation #87): the gate must still run and pass; only the label and auto-merge steps may be unable to write, and they must not turn the gate red. Pinned in A8's test plan and C2's job condition.
2. **A renamed or deleted file:** classification reads both the old and the new path, so moving code into `docs/` is still code. Pinned in A4's `classify` tests.
3. **A cancelled or failed job behind a skipped one:** `Ready to merge` fails on `failure` or `cancelled`, passes on `success` or `skipped`. Pinned in A2's done-when (a throwaway red PR).
4. **A Dependabot major, or a human commit pushed onto a Dependabot branch:** never auto-merged. Pinned in C2 (groups hold only minor/patch; condition on the PR author and branch prefix).
5. **A release where Windows fails to build:** Linux and macOS files attach, the notes say Windows is missing and why; a Linux failure attaches nothing. Pinned in B2.

## Order and lanes

Three lanes can run as separate sessions. Within a lane, tasks run in the order listed; a task waits for the tasks in its *After* line.

| Lane | Tasks, in order | Mostly touches | Model |
|---|---|---|---|
| **A · Pipeline** | A1 → A2 → A3 → A6 → A4 → A8 → A5 → A7 → A9 | `.github/workflows/*`, `tools/ci/*`, rulesets | Opus 5.5 |
| **B · Shipping** | B1, B3 at once; B2 after A1; B4 after A1, A7, B2; B5 after A1, B2 | docs, `electron-builder.config.mjs`, `release.yml` publish job, AUR | Sonnet 5.5 (B1, B3, B4), Opus 5.5 (B2, B5) |
| **C · Housekeeping** | C1, C2 at once | `.coderabbit.yaml`, `.github/dependabot.yml`, one new workflow | Sonnet 5.5 |

Start in parallel: **A1, B1, B3, C1, C2**. Files two lanes share: `CONTRIBUTING.md` (A5, A9, B2, C1, C2, each a different section) and `.github/workflows/release.yml` (A1, then B2 — B2 waits for A1). Rebase before merging; keep each hunk to its own section.

---

## Task 0: Commit this plan and a standing agent

**Why:** each lane is a fresh session; they need the same instructions and the same decisions.

**Files:**
- Create: `docs/superpowers/plans/2026-10-31-ci-cd-and-shipping.md` (this file)
- Create: `.claude/agents/ci-shipping.md`
- Modify: `docs/roadmap.md` — one line under *Later*: "CI/CD and shipping: see the plan", no checkbox.

- [ ] Write `.claude/agents/ci-shipping.md`: front matter `name: ci-shipping`, a description, and standing instructions — read this plan, `CLAUDE.md`, `.claude/rules/workflows.md` and `engineering-practices.md`; one task per PR; do the task's *Find out first* before changing anything and report what it found in the PR; never remove or rename a required check except as A2/A4 describe; ask the maintainer before any ruleset, app-installation or external-account change; name the platforms a change ran on.
- [ ] Commit both, PR `docs: plan the CI/CD and shipping work, and an agent to carry it`.

**Done when:** a new session can be started with the `ci-shipping` agent and finds the plan by its path. Sonnet, small.

---

## Lane A · Pipeline

### Task A1: One installer build, used by PRs and releases

**Why:** the installers that ship are built from the tag and never smoke-tested; the same build steps are copied in three workflows.

**Today:** `release.yml` build job (lines 54–120) runs `pnpm package` (line 81), Flatpak (86), SBOM (98), and uploads (106) — no smoke test, no poppler. `package.yml` installs poppler (macOS via brew; Windows pinned by version and checksum since #170) and runs `pnpm test:packaged`. `ci.yml` `package` job (line 210) runs `xvfb-run -a pnpm test:packaged` and builds the AppImage.

**Find out first:**
- `test:packaged` is `package:e2e` + Playwright. ADR 0014 (R6 amendment) says the e2e package differs from the shipped one only in the inspector fuse. Confirm in `apps/desktop/package.json` and `electron-builder.config.mjs`. The smoke test therefore checks a sibling build from the same commit, not the shipped bytes; say so in the workflow comment and in `docs/release-checklist.md`.
- Where `package:e2e` writes. If it shares `apps/desktop/release/` with `pnpm package`, run the smoke test first and clean before packaging, so the e2e build never ships.

**Files:**
- Create: `.github/workflows/installers.yml` (`on: workflow_call`)
- Modify: `.github/workflows/release.yml`, `.github/workflows/package.yml`, `.github/workflows/ci.yml` (`package` job), `docs/release-checklist.md`

**Interfaces:**
- Produces: `installers.yml`, `workflow_call` inputs `ref` (string, required) and `version` (string, optional: overrides the version baked in, for preview and candidate builds). Matrix `ubuntu-latest`, `windows-latest`, `macos-latest`. Each leg: poppler (and `xvfb-run` on Linux), `pnpm test:packaged`, then `pnpm package` (plus Flatpak and SBOM on Linux). Uploads artifact `installers-<runner.os>` holding exactly the files the release attaches today. `permissions: contents: read`. A2, A5, A7, A9, B2 and B4 call it.

- [ ] Write `installers.yml`, moving the steps (with their comments) from `package.yml` and `release.yml`; keep #170's pinned Windows poppler.
- [ ] `release.yml` `build` calls it with the tag as `ref`; `publish` downloads `installers-*` as it does now.
- [ ] `package.yml` calls it on `pull_request`; `ci.yml` `package` keeps only what it does beyond that, or goes.
- [ ] Push the branch; the Package run is green on all three runners.
- [ ] Commit, PR `ci: one installer build, smoke-tested, for pull requests and releases`.

**Done when:** the PR's Package run passes on Linux, Windows and macOS through `installers.yml`; actionlint and zizmor pass; `release.yml` has no build steps of its own. The first release after this merge is the end-to-end proof. Opus, medium.

### Task A2: `Ready to merge`, and two required checks per branch

**After:** A1.

**Why:** rulesets name 13 checks each; any rename leaves PRs waiting for a check that never arrives.

**Today:** develop and main rulesets require Static checks, Tests and coverage, E2E, Pixel diffs, Package, Workflow security, Known vulnerabilities, Unit tests on windows-latest, Unit tests on macos-latest, Package (windows-latest), Package (macos-latest), Flatpak, plus Conventional title (develop) or Release gate (main). Both: 0 approvals, `require_extra_approval_for_unattributed_changes: true`, no bypass actors.

**Find out first:** how checks from a called workflow are named (`Package / Build (Windows)`?). Whether `needs.*.result` reports `skipped` for an `if:`-skipped job.

**Files:** `.github/workflows/ci.yml` (installers job moves in from `package.yml`; new `ready` job), `.github/workflows/package.yml` (deleted), ruleset JSON prepared in the PR description.

**Interfaces:** Produces job id `ready`, name `Ready to merge`, `needs:` every gate job, `if: always()`, fails when any `needs.*.result` is `failure` or `cancelled`. Every later gate job is added to its `needs`.

- [x] Add the installers job (calling A1's workflow) and `ready` to `ci.yml`; delete `package.yml`.
- [x] Merge. Then the maintainer replaces both rulesets' required checks: develop `[Ready to merge, Conventional title]`, main `[Ready to merge, Release gate]`, stating `require_extra_approval_for_unattributed_changes` as it is today. Done after #182, each check pinned to GitHub Actions (`integration_id` 15368).
- [x] Open a throwaway PR with a failing unit test: `Ready to merge` is red. Close it. #180: a failing unit test and a cancelled run were red, a skipped job passed.
- [x] Update `CONTRIBUTING.md`'s list of checks.
- [x] Added in the doing: the rulesets required four names only A1's shim reported, so deleting it before the swap would have left every PR waiting. #182 moved the shim into `ci.yml` as `old-checks`, and a follow-up PR deleted it after the swap.

**Done when:** both rulesets list exactly two checks; a red job makes `Ready to merge` red; a green PR merges. Opus, small.

### Task A3: E2E in three shards

**After:** A2.

**Why:** E2E alone sets the PR wait (7–9 min); everything else finishes within 4.

**Today:** `ci.yml` `e2e` job: `xvfb-run -a pnpm test:e2e` (= `pnpm build && playwright test`); `playwright.config.ts` `workers: 1` (line 33), `retries: CI ? 1 : 0` (line 35); the report uploads on failure.

**Find out first:** Playwright with `fullyParallel: false` shards by file; check no spec depends on another file having run (shared fixtures under `e2e/`). Note the current test count.

- [x] Matrix `shard: [1, 2, 3]`; `pnpm build`, then `xvfb-run -a pnpm exec playwright test --shard="$SHARD/3"` with `SHARD` from `env:`; blob reporter on CI.
- [x] A `merge-reports` job builds one HTML report and uploads it on failure. It is `e2e-report`, run only when a shard failed, and left out of `ready.needs` because by then *Ready to merge* is red already.
- [x] Add the shards to `ready.needs`. The matrix job keeps the id `e2e`, which `ready` already needed: one red shard makes `needs.e2e.result` `failure`.

**Done when:** across three PR runs every test runs exactly once (the shard totals add up to the count) and E2E wall time is at most about 4.5 minutes. Sonnet, small.

### Task A6: Nightly — Windows and macOS E2E, and the vulnerability scan

**After:** A3. Runs before A4, so the scan exists at night before it leaves the PR gate.

**Why:** E2E has never run on Windows or macOS; a new advisory should be one issue, not a red X on every PR.

**Today:** `nightly.yml`: `properties` (10 000 runs, fresh seed, issue on failure via `gh issue` with label `nightly-property`, lines 66–100) and `bench`. `ci.yml` `dependencies` job runs osv-scanner (line 281).

**Find out first:** run `pnpm test:e2e` on `windows-latest` and `macos-latest` from a branch (`workflow_dispatch`). For every failure, decide: the test is wrong, the app is wrong, or it is platform-specific and gets `test.skip(process.platform === …, '<reason>')` the way existing specs do. Never skip one just to get green. App bugs found here are fixed in this PR (or one per bug) with a test.

- [ ] Add `e2e` jobs (matrix `windows-latest`, `macos-latest`) installing poppler as `installers.yml` does.
- [ ] Add a step that reads the head commit of the job's last green run (`gh run list --workflow nightly.yml --status success --json headSha`) and skips E2E and `bench` when develop has not moved. `properties` and the new scan always run.
- [ ] Add a `vulnerabilities` job with the same pinned osv-scanner step as `ci.yml`.
- [ ] Reuse the issue step: one open issue per job label (`nightly-e2e-windows`, `nightly-e2e-macos`, `nightly-vulnerabilities`), commented on when it fails again, closed by the next green run.

**Done when:** three nights green on both platforms, or each remaining failure has its own issue; an unchanged night skips E2E but runs the scan and the property tests. Opus, medium to large (unknown failures).

### Task A4: A change-aware PR gate

**After:** A6.

**Why:** a docs PR runs 14 jobs; the vulnerability scan fails PRs that never touched dependencies; runs repeat on push to main.

**Today:** every `ci.yml` job runs on every PR and on push to develop and main; `codeql.yml` runs on PR, push to develop and main, and Wednesdays, with no `concurrency`.

**Find out first:** list every path in the repo by its kind under the rules below and look for surprises (generated files, `fixtures/`, `assets/fonts/`, locales).

**Files:**
- Modify first, in its own commit: `.claude/rules/workflows.md` — a required check may move to a scheduled run when its failure does not depend on the PR (a new advisory), and the move says so in its comment.
- Create: `tools/ci/changes.mjs`, `tools/ci/changes.test.mjs`
- Modify: `package.json` (`"test:tools": "node --test tools/ci/"`, and `pnpm check` runs it), `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `knip.jsonc` if it flags the new files.

**Interfaces:**
- Produces: `classify(files: { status: string, path: string, previous?: string }[]): Set<'docs' | 'code' | 'packaging' | 'deps' | 'workflows'>`. Rules: `docs` = `docs/**`, `packaging/aur/**` (an AUR recipe nothing in CI builds; found by B3), and `*.md` outside `.claude/` and `apps/`; `workflows` = `.github/**`; `deps` = `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/**`, any `package.json`; `packaging` = `apps/desktop/electron-builder.config.mjs`, `apps/desktop/build/**`, `apps/desktop/src/main/**`, `assets/fonts/**`; anything else = `code`. `previous` (renames) is classified too. An empty list returns `{'code'}`.
- CLI: `node tools/ci/changes.mjs < files.tsv` prints JSON `{"docs":bool,"code":bool,…}` for `$GITHUB_OUTPUT`.
- Job `changes` in `ci.yml`: on `pull_request`, lists files with `gh api repos/$REPO/pulls/$PR/files --paginate`; on `push`, outputs every kind true.

- [ ] Write `changes.test.mjs` first: docs-only → `{docs}`; `apps/desktop/src/renderer/x.tsx` → `{code}`; `apps/desktop/src/main/print.ts` → `{packaging}` and code-gated jobs still run (packaging implies code); a rename `src/a.ts` → `docs/a.ts` → includes `code`; `pnpm-lock.yaml` → `{deps}`; `.github/workflows/ci.yml` → `{workflows}`; empty → `{code}`; an unknown top-level file → `{code}`. Run, see it fail, write `changes.mjs`, see it pass.
- [ ] Gate jobs with `if:` from `needs.changes.outputs`, following this matrix (job → kinds that run it): static → always; tests, E2E shards, pixel diffs, Windows/macOS unit tests, Linux package smoke, CodeQL → code, packaging, deps, workflows; Windows/macOS/Flatpak installers → packaging, deps, workflows; vulnerability scan → deps; actionlint + zizmor → workflows.
- [ ] Remove `push: main` from `ci.yml` and `codeql.yml`; add `concurrency: cancel-in-progress` to CodeQL.
- [ ] Prove it with four throwaway PRs (docs, code, lockfile, workflow) and note each one's job list in the PR description.

**Done when:** a docs-only PR finishes in about a minute with 4 jobs; a code PR runs the core set; a lockfile PR adds the scan and installers; a workflow PR adds the linters; `Ready to merge` is right in all four. Opus, medium.

### Task A8: The verifier guard

**After:** A4.

**Why:** the known way an agent turns CI green is by editing what CI compares against. It should never pass unnoticed.

**Files:** `tools/ci/changes.mjs` and its test (same input as A4), `.github/workflows/ci.yml` (job `guard`, added to `ready.needs`).

**Interfaces:** Produces `judgeFiles(files): { judges: string[], blocked: string[] }`. `judges` = paths under `e2e/visual/__screenshots__/`, `packages/render/src/svg/__snapshots__/`, `packages/*/bench/*.json`, `vitest.config.ts`, `packages/*/vitest.config.ts`, `eslint.config.js`, `.dependency-cruiser.cjs`, `knip.jsonc`, `stryker.config.mjs`, `playwright*.config.ts`, `tools/release-gate.sh`, `.github/**`, `.githooks/**`, `.claude/rules/**`. `blocked` = a **modified or deleted** `packages/persist/src/migrations/v*_to_v*.ts`; an added one, and `migrations/index.ts`, are not blocked.

- [ ] Tests first: a changed screenshot → judges; a modified `v11_to_v12.ts` → blocked; a new `v12_to_v13.ts` plus `index.ts` → neither blocked; a renamed migration → blocked.
- [ ] Job `guard`: writes a job summary listing the files; adds the label `judge-changed` (permission `pull-requests: write` on this job only). On a fork the label call is refused: the step says so in the summary and carries on. Fails only when `blocked` is non-empty.
- [ ] Note in `CONTRIBUTING.md` that the label is expected on Dependabot's weekly `.github/` updates.

**Done when:** a throwaway PR changing a screenshot gets the label and the summary; one editing `v11_to_v12.ts` is red; a fork-style run without write access stays green apart from a blocked migration. Sonnet, small.

### Task A5: The after-merge ring and the Preview

**After:** A1, A2, A4.

**Why:** develop must still build and install everywhere after every merge, and you want to try develop on Windows and macOS without building it.

**Find out first:** how the version reaches the app (`app.getVersion()` from `apps/desktop/package.json`) and that 8.9's `VERSION` regex in `apps/desktop/src/main/updates.ts` rejects `1.6.0-preview.<sha>` (so a preview is never told to update). Where the next release number can be read (the roadmap's `## <n> — the next release` heading); write it as a small exported function with a test if it needs parsing.

**Files:** `.github/workflows/ci.yml` (push path) or a new `after-merge.yml` (A9 renames either way), `playwright.config.ts` (retries from an env var, `LEATHERCAD_E2E_RETRIES`, default as today), `CONTRIBUTING.md` (revert-first rule, Preview).

- [ ] On push to develop: the full set, E2E with `LEATHERCAD_E2E_RETRIES=0`, installers via `installers.yml` with `version` `<next>-preview.<short sha>`, `concurrency: cancel-in-progress`.
- [ ] A `preview` job (`contents: write`, its own job, no build steps): replaces the assets of one pre-release tagged `preview`, marked pre-release, title "Preview — <sha>", notes saying files saved in it may not open in the stable app and that it replaces a stable install on Windows and macOS.
- [ ] On failure: one issue with label `after-merge`, as the nightly does.
- [ ] `CONTRIBUTING.md`: a red develop is reverted first (the PR's *Revert* button), fixed in a new PR.

**Done when:** after a merge, the `preview` release carries fresh installers whose status bar reads `…-preview.<sha>`; *Check for updates* on it says nothing new; a deliberately broken merge on a scratch branch opens the issue. Opus, medium.

### Task A7: The weekly wide OS matrix

**After:** A1, A6.

**Why:** the Intel half of the universal dmg has never been launched; the AppImage is never tried on an older Ubuntu or on Arch; Windows on ARM is untested.

**Find out first:**
- On `windows-11-arm`, electron-builder may build arm64 by default: force x64, since x64-under-emulation is what ships.
- In the `archlinux` container (on `ubuntu-24.04`): what the smoke test needs installed (node, pnpm, xvfb, poppler) and that the AppImage runs with `--appimage-extract-and-run` (no FUSE in containers). If Playwright cannot run there, the minimum is: the extracted app starts and exports the print-test PDF that `e2e/printTest.ts` measures.

**Files:** create `.github/workflows/systems.yml` (`schedule` weekly, `workflow_dispatch`, `workflow_call` for A9).

- [ ] Matrix of D7's ten images; E2E on `windows-2022`, `windows-2025`, `macos-15`, `macos-26`; packaged smoke on all; skip when develop has not changed since the last green run, except when called by a candidate.
- [ ] One issue per failing image (label `systems-<image>`).

**Done when:** one manual run is green, or each failing image has an issue saying why. Opus, medium.

### Task A9: Release candidates, ring names, `docs/ci.md`

**After:** A5, A7.

**Why:** a release must be exactly what testers measured; the workflows should be readable by the question they answer.

**Find out first:** how `tools/release-gate.sh` decides (it gained hotfix logic in #171: a `hotfix/` branch of `fix` commits only); whether a `candidate-v*` tag could confuse release-please (it should not: release-please reads `.release-please-manifest.json` and its own `leathercad-v*` tags).

**Files:** create `.github/workflows/candidate.yml`, `.github/ISSUE_TEMPLATE/print_report.yml`, `docs/ci.md`; modify `tools/release-gate.sh`, `.github/workflows/release-gate.yml`; rename workflows to `pr.yml`, `after-merge.yml`, `scheduled.yml`, `release.yml`; update `CONTRIBUTING.md`, `docs/testing.md`, `docs/release-checklist.md`, `.claude/rules/desktop-main.md` (*What CI covers*), `docs/claude-code-setup.md` if it names workflows.

- [ ] `candidate.yml` (`workflow_dispatch` on develop): installers with `<next>-rc.<n>`, then `systems.yml`; a pre-release tagged `candidate-v<next>-rc.<n>` whose notes link the print-report form.
- [ ] `print_report.yml`: OS and version, printer, how it was printed (LeatherCAD *Print*, or viewer and setting on Windows), paper, readings A–H, pass/fail.
- [ ] Release gate: a PR from develop into main passes only when develop's head is the latest candidate's commit; hotfix branches are exempt (they skip the candidate).
- [ ] Rename, then `docs/ci.md`: each ring's question, triggers, required checks, how to read a red, what is skipped when.

**Done when:** a candidate built from develop appears as a pre-release; a develop→main PR with a commit after the candidate is refused with a message saying so; `docs/ci.md` matches the files. Opus, medium.

---

## Lane B · Shipping

### Task B1: Supported systems, levels, known issues

**Why:** nothing says which systems are supported or what holds a release; the AppImage's first error on a fresh Arch or Ubuntu is unexplained.

**Today:** `docs/getting-started.md` lines 10–16 (download table: AppImage, Flatpak, `.exe`, `.dmg`); `README.md` line 118; roadmap rows R8 and R10 (lines 343–344) are "monitored".

**Files:** `docs/getting-started.md`, `README.md`, `docs/release-checklist.md`, `docs/roadmap.md` (R8, R10 wording only), `.github/ISSUE_TEMPLATE/config.yml` if a known-issue label needs mentioning.

- [ ] A *Supported systems* table (D8, D9), with the level and what it promises.
- [ ] The FUSE note: the AppImage needs `fuse2` (Arch `sudo pacman -S fuse2`; Ubuntu 22.04 `libfuse2`, 24.04+ `libfuse2t64`), or run it with `--appimage-extract-and-run`.
- [ ] `release-checklist.md`: the level rules, what a hotfix skips, and that the print check uses the AUR build once B3 lands.
- [ ] R8 and R10: level-3 items collected through the print-report form. Do not write ☐ or ◐ in them (#165 learned this).
- [ ] Define the label `known-issue` (in the PR description and in the checklist): B2 lists open ones in each release's notes.

**Done when:** a fresh reader can answer "does it run on my system, and what happens if it breaks there?" from `getting-started.md`; `tools/release-gate.sh docs/roadmap.md` still reports the same as before. Sonnet, small.

### Task B2: Release by platform

**After:** A1.

**Why:** today a release attaches all installers or none; the levels need the platforms that passed to ship.

**Today:** `release.yml` `publish` (`needs: [release-please, build]`, line 123) attests (140) and attaches (150) only when every build succeeded. `CONTRIBUTING.md` *If a release goes wrong* says nothing is attached until every platform has built.

**Files:** `.github/workflows/release.yml`, `CONTRIBUTING.md`.

- [ ] `publish` runs `if: always()` when a release was created; downloads the `installers-*` that exist; **fails without attaching anything when the Linux artifact is missing** (level 1).
- [ ] Attests and attaches what exists; appends to the release notes a *Missing in this release* line per absent platform with its failed job's link, and *Known issues* listing open `known-issue` issues.
- [ ] Rewrite *If a release goes wrong* to match.
- [ ] Verify on a fork or a scratch repository with a deliberately failing Windows leg.

**Done when:** a run with Windows failing publishes Linux and macOS files plus the missing line; a run with Linux failing publishes nothing. Opus, small to medium.

### Task B3: The AUR package `leathercad-bin`

**Why:** Arch is your system and level 1; `yay -S leathercad-bin` is how Arch users install, it needs no FUSE, and your print check then measures the shipped file.

**Files:** create `packaging/aur/PKGBUILD`, `packaging/aur/.SRCINFO`, `packaging/aur/README.md` (how to bump: `updpkgsums`, `makepkg --printsrcinfo > .SRCINFO`, push to `ssh://aur@aur.archlinux.org/leathercad-bin.git`).

- [ ] PKGBUILD: `source` = the release AppImage `LeatherCAD-${pkgver}-x86_64.AppImage`; `prepare` extracts it with `--appimage-extract`; `package` installs to `/opt/leathercad`, a `/usr/bin/leathercad` link, the desktop entry, icons and `apps/desktop/build/linux/io.github.crnlsp.leathercad.xml`; licence Apache-2.0; maintainer line with the noreply address.
- [ ] `namcap` the PKGBUILD and the built package; fix what it reports, including `depends`.
- [ ] Maintainer step (not the agent): create the AUR account and push the first version.

**Done when:** `makepkg -si` on the maintainer's CachyOS installs it; LeatherCAD appears in the menu, opens a `.lcp` by double-click, and prints the test sheet true to size. Sonnet, small; one maintainer step.

### Task B4: The `.deb`

**After:** A1, A7, B2.

**Why:** Ubuntu is level 1; a `.deb` installs like any program and avoids FUSE.

**Find out first:**
- What electron-builder's `deb` target needs (`maintainer`, `homepage`, dependencies), and how to smoke-test an *installed* `.deb` on a runner: whether `playwright.packaged.config.ts` can be pointed at `/opt/LeatherCAD/leathercad` through an environment variable.
- The sandbox (found by B3, untested for lack of an Ubuntu machine). The AppImage's `AppRun` adds `--no-sandbox` only when user namespaces are missing; a `.deb` runs the binary directly. Ubuntu 24.04 and later restrict unprivileged user namespaces through AppArmor, so the app may refuse to start. Check whether electron-builder's `.deb` makes `chrome-sandbox` setuid or ships an AppArmor profile. If neither, choose one with the maintainer: never `--no-sandbox` silently.

**Files:** `apps/desktop/electron-builder.config.mjs` (linux `target: ['AppImage', 'deb']`, `maintainer` noreply), `installers.yml` (upload `*.deb`), `release.yml` (attest and attach `*.deb`), `systems.yml` (install with `sudo apt-get install ./LeatherCAD-*.deb` on the three Ubuntu images, then smoke), `docs/getting-started.md`.

**Done when:** the release workflow (scratch run) attaches an attested `.deb`; it installs and passes the smoke test on 22.04, 24.04 and 26.04; uninstalling removes the menu entry. Sonnet, medium.

### Task B5: Microsoft Store (MSIX)

**After:** A1, B2.

**Why:** the Store signs the package for free, updates the app itself, is installable with winget, and is where Windows users look.

**Maintainer steps first:** the free individual Partner Center account; reserve the name "LeatherCAD"; copy the identity values (Package/Identity/Name, Publisher, PublisherDisplayName) into the PR.

**Find out first:**
- What electron-builder's MSIX/AppX target is called and needs (its docs mark MSIX beta).
- How to smoke-test on a runner: sign with a self-signed test certificate, `Add-AppxPackage`, then launch through `shell:AppsFolder\<AUMID>`. The `WindowsApps` folder is not readable, so Playwright may not attach. If not, the minimum check is that the app starts and writes its log (ADR 0015) in the package's redirected `LocalAppData`.
- That preferences and crash-recovery copies survive a restart inside the package (AppData is redirected per package).
- Whether an AUR install should count as managed too (found by B3). Today 8.9 treats it as unmanaged, so it announces a release before the AUR package has caught up. If yes, the PKGBUILD's launcher needs a marker that `isManagedInstall` reads; decide with the maintainer before widening the signature.

**Files:**
- `apps/desktop/src/main/updates.ts` + test: export `isManagedInstall(env: Record<string, string | undefined>, windowsStore: boolean): boolean` (true for `FLATPAK_ID` set, or `windowsStore`); `apps/desktop/src/main/index.ts:348` uses it with `process.windowsStore === true`.
- `apps/desktop/electron-builder.config.mjs` (the MSIX target, the `.lcp` file association in its manifest), `installers.yml` (a Windows MSIX artifact, **not** attached by `release.yml`), `docs/store-listing.md` (description, screenshots from `pnpm docs:media`, privacy-policy link to `SECURITY.md`, age rating answers).

- [ ] Test `isManagedInstall` first: Flatpak → true; Store → true; neither → false.
- [ ] Build and smoke-test the MSIX on `windows-2025`.
- [ ] Maintainer uploads the first package through Partner Center; certification passes.

**Done when:** the Store listing is live; installed from the Store, the app starts with no SmartScreen warning, opens `.lcp` files, and *Check for updates* is absent or says the Store updates it. Automating the upload (Store CLI in a protected environment) is a later step. Opus, large; maintainer steps.

### Task B6: Later, each only when its trigger happens

Not built now; listed so nobody rebuilds the reasoning.
- **Flathub**, when B3 and B4 are done: one-time manifest that builds in Flathub's environment; then the bot's update PRs.
- **SignPath** for the GitHub `.exe`, when downloads of it stay significant after the Store.
- **winget manifest for the `.exe`**, after SignPath (the Store copy is already in winget).
- **Auto-merging the release back-merge PR (main → develop)**: needs a GitHub App token so the PR triggers CI.

---

## Lane C · Housekeeping

### Task C1: Remove CodeRabbit

**Why:** it is not used. Deleting its config does not stop it: with no `.coderabbit.yaml` it reviews with defaults until its access to the repository is removed.

**Today:** `.coderabbit.yaml`; `CONTRIBUTING.md` lines 144–148; `docs/claude-code-setup.md` line 53. **Done on branch `chore/c1-remove-coderabbit`** (commit "chore: remove CodeRabbit reviews": the config and both doc mentions). An earlier draft of it also deleted `ci.yml`'s `cross-platform` job (Windows and macOS unit tests); that part was dropped.

**Decided 2026-10-31: the Windows and macOS unit tests stay.** Both rulesets require *Unit tests on windows-latest* and *macos-latest*, and the tests caught 9 failures in a month. C1 removes CodeRabbit only.

- [x] Check the branch leaves `ci.yml`'s `cross-platform` job and its two mentions in `docs/testing.md` exactly as on `develop`.
- [x] `git grep -i coderabbit` finds nothing outside this plan.
- [ ] Maintainer step: GitHub → Settings → Applications → Installed GitHub Apps → CodeRabbit → Configure → remove this repository (or uninstall).

**Done when:** the next PR gets no CodeRabbit comment; nothing in the repository mentions it. PR `chore: remove CodeRabbit reviews`. Sonnet, small; one maintainer step.

### Task C2: Dependabot minor and patch updates merge themselves

**Why:** the weekly grouped updates are merged by hand after the same green checks every time; the 7-day cooldown and the full gate are the safety, not the click.

**Today:** `.github/dependabot.yml`: `github-actions` group `actions` (line 18) and `npm` group `dependencies` (line 36), both `patterns: ['*']`, `cooldown` 7 days, TypeScript and `@types/node` majors ignored. Branches look like `dependabot/npm_and_yarn/develop/dependencies-<hash>` and `dependabot/github_actions/develop/actions-<hash>`. Merged by hand (#125, #169). Repository: auto-merge allowed, Actions may approve PRs, rulesets require 0 approvals and `require_extra_approval_for_unattributed_changes: true` (a public-preview setting that, reportedly, asks a human to approve commits not attributed to one).

**Find out first:** whether that setting stops auto-merge of a bot-authored PR. Watch the first PR after this change. If it waits for an approval, the maintainer chooses: approve each one with one click (auto-merge does the rest), or set the setting to `false` on the develop ruleset (it then also stops asking for agent-co-authored commits; the API resets it to `true` whenever a ruleset update leaves it out).

**Files:** `.github/dependabot.yml`, create `.github/workflows/dependabot-auto-merge.yml`, `CONTRIBUTING.md` (a *Dependabot* paragraph).

**Interfaces:** Produces job `auto-merge`: `on: pull_request` (`opened`, `reopened`), branches `[develop]`; `if: github.event.pull_request.user.login == 'dependabot[bot]' && (startsWith(github.head_ref, 'dependabot/npm_and_yarn/develop/dependencies-') || startsWith(github.head_ref, 'dependabot/github_actions/develop/actions-'))` (the author check, not `github.actor`, which zizmor flags as spoofable); `permissions: contents: write, pull-requests: write`; one step `gh pr merge --auto --squash --subject "$TITLE" "$URL"` with both from `env:`; no checkout; `timeout-minutes: 5`.

- [ ] Both groups get `update-types: [minor, patch]`, so majors arrive as their own PRs, outside the auto-merge prefixes.
- [ ] Add the workflow; actionlint and zizmor pass.
- [ ] Next weekly run: the grouped PR shows auto-merge enabled and merges when the gate is green; a major (if one comes) does not.

**Done when:** a Dependabot grouped minor/patch PR merges with no click (or with one approval click, if the setting above stays); majors, the release-please PR and every human PR are untouched. Sonnet, small.

---

## Self-review against the proposal

- Every step of the proposal's two tracks maps to a task: A1–A9 ↔ track A; B1–B6 ↔ track B; C1–C2 are the two additions. The proposal's decisions D1–D14 each have an owning task.
- Corrections this plan made to the proposal, now written back into it: the release smoke test checks a sibling build of the same commit (inspector fuse), not the shipped bytes; one reusable installer workflow replaces three copies; A6 runs before A4 so the scan never disappears; the release-please PR did get CI on #112 (checks ran on it), so "it never runs CI" was too strong; 7.6c left 1.6 on 2026-10-28 (#165) and 1.6 now waits for the performance backlog (#167); a hotfix path into main exists (#171) and skips the candidate; `require_extra_approval_for_unattributed_changes` may stop auto-merge; the in-flight CodeRabbit change also removed the Windows/macOS unit tests, which stay (decided 2026-10-31).
