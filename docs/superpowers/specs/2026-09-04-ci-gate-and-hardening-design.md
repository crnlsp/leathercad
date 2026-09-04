# CI gate and hardening — design

Date: 2026-09-04
Status: approved, not yet implemented

## Problem

The repository has good tooling and no enforcement. Four gaps, in order of what they cost:

1. **The CI gate is not a gate.** `docs/roadmap.md` §2.4 states one branch per slice, merged when CI
   is green. Every commit to date has gone directly to `main`, so CI runs after the code has landed
   and reports rather than blocks. Run `33845752779` (milestone M1) failed on `main`.
2. **The rasterised print checks can vanish silently.** `packages/export/src/pdf/writer.test.ts`
   probes for `pdftoppm` and skips the poppler-backed measurements when it is absent. That is
   correct on a contributor's machine and wrong in CI: if the `apt-get install poppler-utils` step
   breaks, the checks that prove a 100 mm line measures 100 mm stop running and CI still reports
   green. This is the failure mode the product promise can least afford.
3. **Two gates are configured but never fire.** `vitest.config.ts` sets coverage thresholds of
   90/85/90/90 over `core`, `geometry` and `domain`; the CI step that would enforce them is
   commented out, deferred to slice 1.1 — which landed fifteen commits ago. Separately, `pnpm check`
   omits `format:check`, so a locally green tree can fail CI on formatting alone.
4. **A red run is hard to read.** The single job runs six steps in series, so the first failure
   hides every later result, and no Playwright report or trace is uploaded when the Electron E2E
   run fails.

## Constraints

- **Server-side branch protection is unavailable.** The repository is private on a free GitHub plan;
  both `/branches/main/protection` and `/rulesets` return 403 with "Upgrade to GitHub Pro or make
  this repository public". Enforcement must therefore be client-side for now.
- **A new dependency needs an ADR** (`CLAUDE.md` § Conventions). The design avoids adding one.
- **pnpm may not be on `PATH`.** A bootstrap copy lives at
  `~/.local/share/pnpm-bootstrap/node_modules/.bin`, and pnpm 11 re-invokes itself from `PATH`, so a
  bare path to the binary is not enough.
- **Solo repository.** The gate exists to stop accidents, not to police a team. `--no-verify`
  remaining available is a deliberate property, not an oversight.

## Design

### 1. The gate — a committed pre-push hook

A `.githooks/pre-push` script, wired by adding to the root `package.json`:

```json
"prepare": "git config core.hooksPath .githooks"
```

pnpm runs `prepare` on install, so the hook installs itself on any clone that runs
`pnpm install`. This uses git's built-in `core.hooksPath` rather than husky or lefthook, which
would each cost a dependency and therefore an ADR for no capability git does not already have.

The hook does two things:

- **Refuses a push whose target ref is `refs/heads/main`,** with a message naming the branch-and-PR
  flow and the `--no-verify` escape hatch. It reads the ref pairs git supplies on stdin rather than
  inspecting the checked-out branch, so it is correct for `git push origin HEAD:main` too.
- **Runs `pnpm check` on any other branch,** exporting the bootstrap `PATH` prefix first.

Exit non-zero blocks the push. The hook must be committed with its executable bit set.

### 2. CI split into three parallel jobs

`.github/workflows/ci.yml` becomes three jobs with no `needs:` between them, so one run reports
every failure rather than only the first:

| Job | Steps | Extra setup |
|---|---|---|
| `static` | `typecheck`, `lint`, `format:check`, `depcruise` | — |
| `test` | `test:coverage` | poppler-utils |
| `e2e` | `build`, then Playwright under `xvfb-run` | poppler-utils, xvfb |

`test` runs `pnpm test:coverage` rather than `pnpm test`. That runs the suite and enforces the
existing thresholds in one pass, which is why no separate coverage step is reintroduced.

Each job keeps the existing checkout / pnpm / Node / `pnpm install --frozen-lockfile` preamble.
The duplication is accepted: a composite action to remove it would be more machinery than the four
repeated lines are worth.

### 3. Making the silent holes loud

- CI sets `LEATHERCAD_REQUIRE_POPPLER=1` on the `test` and `e2e` jobs. In `writer.test.ts`, when
  that variable is set and `pdftoppm` is not found, the file throws instead of setting
  `HAS_POPPLER` to `false`. Absent the variable, the skip behaviour is unchanged, so a contributor
  without poppler still gets every other test rather than a wall of failures.
- `pnpm check` gains `format:check`, making it a superset of the `static` job. Local green then
  means CI green for that job.

### 4. Workflow hardening

- Top-level `permissions: contents: read`.
- `timeout-minutes` per job: 10 for `static`, 15 for `test`, 20 for `e2e`. Current durations are
  roughly 40 s, 1–2 min and 2–4 min, so these bound a hang without tripping on a slow run.
- `actions/upload-artifact@v4` with `if: failure()` on the `e2e` job, uploading `playwright-report/`
  and `test-results/` with 7-day retention.
- The existing `concurrency` group and `cancel-in-progress` are unchanged.

### 5. Dependabot

`.github/dependabot.yml` with two weekly ecosystems, each grouping its updates into a single PR:

- `github-actions` — the higher-value half, since action majors otherwise drift unnoticed.
- `npm` — grouped, `versioning-strategy: increase`.

The repository's existing policies still apply on top: `minimumReleaseAge` in
`pnpm-workspace.yaml`, and an ADR for any genuinely new dependency. Dependabot proposes; the human
decides, and its PRs go through the same three CI jobs.

### 6. Documentation, in the same commit

`CLAUDE.md` requires docs to move with the code they describe:

- `docs/roadmap.md` §2.4 — spell out the actual flow (branch, push, PR, merge on green) and note
  that the pre-push hook enforces it client-side because server-side protection needs a public
  repository or GitHub Pro.
- `.claude/commands/slice.md` — the closing instruction becomes push the branch and open the PR,
  rather than commit.
- `CLAUDE.md` § Commands — note that `pnpm check` now includes `format:check`, and that
  `pnpm install` installs the hook.
- `docs/testing.md` — document `LEATHERCAD_REQUIRE_POPPLER` and why it exists.

## Testing

The change is mostly configuration, and its correctness is observable rather than unit-testable:

- **Hook, refusal path:** on a scratch branch, `git push origin HEAD:main` is refused; the same push
  with `--no-verify` is not attempted against the real remote.
- **Hook, check path:** a push from a slice branch runs `pnpm check` and blocks on a deliberate
  failure (a stray unformatted file), then succeeds once reverted.
- **Poppler guard:** `LEATHERCAD_REQUIRE_POPPLER=1 PATH=/usr/bin:/bin pnpm test` — with `pdftoppm`
  masked from `PATH` — fails; the same run without the variable skips and passes.
- **Workflow:** the branch's own PR is the first exercise of all three jobs. A red run is verified
  to upload artifacts by inspecting the run.

## Out of scope

Recorded so the decisions are not relitigated:

- **Server-side branch protection** — blocked on repository visibility or a paid plan. Revisit when
  the repository goes public; slice 8.6 ships a contribution guide and the v1.0.0 release, so that
  is the natural moment.
- **`pnpm audit` and CodeQL** — a local desktop application with no network surface; deferred.
- **Release packaging and signing** — Phase 8 work, and a larger design than this one.
- **A `visual` or `bench` CI job** — both scripts deliberately exit non-zero until slices 2.3 and
  1.9 implement them.
