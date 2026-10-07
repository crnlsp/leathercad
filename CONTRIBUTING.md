# Contributing to LeatherCAD

Thank you for helping. This page is how work gets done here: setting up, the shape of a change,
how commits become the changelog, and how a release happens. The rules that protect the product —
a line drawn as 100 mm measures 100 mm on paper — are in [`CLAUDE.md`](CLAUDE.md), and they apply
to every change, whoever or whatever writes it.

- **A bug or an idea?** [Open an issue](https://github.com/crnlsp/leathercad/issues/new/choose).
- **A security problem?** Never in a public issue: see [`SECURITY.md`](SECURITY.md).
- **What is planned?** [`docs/roadmap.md`](docs/roadmap.md).

## Set up

You need **Node 22** and **pnpm 11**. The exact versions are pinned in `.node-version` and in
`package.json`'s `packageManager`; any installed pnpm switches itself to the pinned one, and CI reads
the same pins. pnpm is not bundled with Node: run `corepack enable pnpm` where your Node ships
corepack, as the installers from nodejs.org do, or install it with your package manager
(`sudo pacman -S pnpm` on Arch, whose Node has no corepack).

```bash
pnpm install        # also installs the pre-push hook
pnpm dev            # runs the app, with hot reload
```

| Command | What it does |
|---|---|
| `pnpm check` | Typecheck, lint, format, layering, dead code, tests with coverage, performance ceilings, in a minute or two. **Run it before every push** — the pre-push hook does |
| `pnpm test` | Unit, property, golden, export and snapshot tests. The print checks among them need poppler (`poppler-utils` in most Linux distributions, `poppler` in Homebrew, pacman and Chocolatey); without it they skip, which CI does not allow |
| `pnpm test:e2e` | Builds, then Playwright drives the real Electron app (with an accessibility scan). Needs a display: on Linux without one, `xvfb-run -a pnpm test:e2e` |
| `pnpm test:visual` | Pixel diffs in the pinned Playwright container. Needs Docker and `pnpm build` |
| `pnpm test:packaged` | Packages the app, then smoke-tests the packaged binary |
| `pnpm package` | This platform's installer, in `apps/desktop/release/` |
| `pnpm docs:media` | Retakes the README's screenshots and demo from the real app (needs a display, poppler, ffmpeg, gifsicle and pngquant) |
| `pnpm bench` | Benchmarks; `bench:compare` against the committed baseline |

The layering in [`docs/architecture.md`](docs/architecture.md) §2 is enforced by `pnpm depcruise`: a
violation fails the build, deliberately.

Nothing reads a `.env` file, and no part of development needs a secret: the app never goes online,
and CI's only credential is the token GitHub gives each run. A few variables change how the tests
run:

| Variable | What it does |
|---|---|
| `CI` | Property tests run 300 cases from a fixed seed, not 100 from a random one, and Playwright retries a failed test once. Set `CI=1` to reproduce a CI failure |
| `LEATHERCAD_REQUIRE_POPPLER=1` | A missing poppler fails the print checks instead of skipping them. CI sets it |
| `LEATHERCAD_FC_RUNS`, `LEATHERCAD_FC_SEED` | The run count and seed of every property test that does not set its own. A nightly failure's issue gives both |
| `UPDATE_FIXTURES=1` | Rewrites a committed fixture from the code that builds it: the current format version's, the sample project, the print test. Read the diff before committing it |
| `LEATHERCAD_TEST_TIMEOUT` | Every test's timeout, in milliseconds. Mutation testing sets it ([`docs/testing.md`](docs/testing.md) §3.4) |
| `LEATHERCAD_RECOVERY_INTERVAL_MS` | How often the app writes a crash-recovery copy. The E2E tests shorten it |

The scripts set the rest themselves: `LEATHERCAD_BENCH`, `LEATHERCAD_PACKAGE_FOR_E2E` and
`LEATHERCAD_IN_CONTAINER`.

**Translating?** You need none of the rest of this page beyond setting up: the
[README's Translations section](README.md#translations) is the whole path, and
`pnpm test locales` checks your file. A translation is offered in the app only once a maintainer
has reviewed it and added it to `SUPPORTED_LANGUAGES`; until then `pnpm dev` shows it as a
preview. **Adding words to the interface?** They go in
`apps/desktop/src/locales/en.json` and reach the screen through `t()` — never in the component, and
never in a package below the app ([ADR 0018](docs/adr/0018-interface-language.md)).

## Branches

- **`main` is production.** What is on it is what is released. Nothing is pushed to it directly;
  it changes only through a pull request from `develop`, and only for a release. The *Release gate*
  check refuses a pull request into `main` from any other branch.
- **`develop` is development.** Work lands here, through pull requests from short-lived branches.

Both are protected by a ruleset each: no deletion, no force push, pull requests only, CI required.
Without one, GitHub's *Automatically delete head branches* deletes `develop` the moment a release
merges — which is how it was lost twice (roadmap R2).

```bash
git switch develop && git pull
git switch -c fix/stitch-spacing-rounding
# … commit …
git push -u origin HEAD                 # the pre-push hook runs pnpm check
gh pr create --base develop --fill
```

The `pre-push` hook refuses a push to `main` and runs `pnpm check` on every other push.
`--no-verify` gets past it; please don't.

## A change is a vertical slice

Planned work is numbered in [`docs/roadmap.md`](docs/roadmap.md). A slice touches whatever layers it
needs and ends with the app running, tests green, and something a person can see. No slice leaves
the app broken, and none is "just the model now, the UI next week". Roughly 200–600 lines of
production code; bigger is two slices.

1. **Write the acceptance criteria first**, as things a person could check by using the app.
2. **Tests first** in `packages/geometry` and `packages/domain`, including property tests
   ([`docs/testing.md`](docs/testing.md)). Plausible-but-wrong geometry is this project's
   characteristic failure, and the test is the specification.
3. **Build it, then run the app** and look. Several bugs in the 1.0 record were caught only by a
   screenshot.
4. **Update the docs in the same change** when an invariant, a format or a decision moves. A new
   dependency needs an ADR in [`docs/adr/`](docs/adr/).
5. **Mark the roadmap**: tick the item, or record what the work found.

## Commits and pull requests

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <what changes, for the person using it>
```

Pull requests into `develop` are **squash-merged**, so the pull request's **title becomes the one
line in the changelog**. Write it for a leatherworker reading release notes, not for a reviewer:
*"fix(export): a taped strap's halves line up again"*, not *"fix off-by-one in tile offset"*. A CI
check refuses a title that does not follow the format.

| Type | Use it for | In the changelog |
|---|---|---|
| `feat` | Something a maker can now do | **Features**, and a minor release |
| `fix` | Something that was wrong and is now right | **Bug Fixes**, and a patch release |
| `perf` | The same result, faster | **Performance** |
| `revert` | Undoing an earlier change | **Reverts** |
| `docs` | Documentation only | not shown |
| `test`, `refactor`, `build`, `ci`, `chore`, `style` | Everything a maker never sees | not shown |

Add `!` after the type (`feat!:`), or a `BREAKING CHANGE:` footer, for a change that breaks
something people rely on — for example, a `.lcp` file a newer version writes that an older one
refuses. Scopes are the package or area: `geometry`, `domain`, `export`, `desktop`, `persist`, …

A pull request fills in the template: what changes and why, how it was checked, and whether the
docs moved with it.

[CodeRabbit](https://www.coderabbit.ai/) reviews pull requests into `develop` and `main`, against
the invariants in [`CLAUDE.md`](CLAUDE.md) and the path instructions in
[`.coderabbit.yaml`](.coderabbit.yaml). It reviews automatically only once the repository has ten
stars; until then, ask for a review with a comment of `@coderabbitai review`. It is a second
reviewer, not a gate: answer each comment — fix it, or say why not — before merging. It is not a
required check, and it never replaces the tests, running the app, or a physical print.

## When a check fails

`pnpm check` runs what CI's *Static checks* and *Tests and coverage* run, so most failures reproduce
on your own machine. The rest, and what each one wants:

| What failed | What to do |
|---|---|
| *Format check* | `pnpm format`. Markdown is left alone: it is formatted by hand |
| *Layering* | `pnpm depcruise` names the rule; its comment in `.dependency-cruiser.cjs` says why it exists. A new edge between packages is an architecture decision and needs an ADR. Sometimes the rule is what is wrong, and `/arch-check` helps tell which |
| *Dead code* | Delete what `pnpm knip` names, or list it in `knip.jsonc` with the reason it stays |
| A property test | `CI=1` reproduces CI's cases exactly. Commit the shrunk counterexample as a named regression test ([`docs/testing.md`](docs/testing.md) §3.3) |
| *Tests and coverage*, green locally | Usually poppler: CI runs the print checks that skip without it |
| *Unit tests on windows-latest* or *macos-latest* | Usually a path or a line ending. Make the test pass on every platform; never skip it on one |
| *Pixel diffs* | Look at the run's `visual-diffs` artifact. If the change is meant, `pnpm build`, then `pnpm test:visual --update-snapshots`, and look at every image before committing it |
| *Known vulnerabilities* | osv-scanner names the advisory. Raise the version in `pnpm-workspace.yaml`'s `overrides`, with the advisory and why, and remove the entry when the dependency catches up |
| *Workflow security* | zizmor or actionlint names the line: an action not pinned to a commit, an expression written into a script instead of passed through `env`, a permission wider than the job needs |
| `pnpm install` holds a version back | pnpm waits before installing very new releases (`minimumReleaseAge`). Wait, or record an exclusion in `pnpm-workspace.yaml` with why ([ADR 0004](docs/adr/0004-pnpm-workspaces.md)) |
| `pnpm install` asks about a build script | Answer in `pnpm-workspace.yaml`'s `allowBuilds`, with the reason. Allowing one is a security decision |

## Changelog and releases

[`CHANGELOG.md`](CHANGELOG.md) is written by
[release-please](https://github.com/googleapis/release-please) from the commits on `main`; nobody
edits it by hand except to correct a mistake in an entry. See
[ADR 0014](docs/adr/0014-electron-builder-and-release-please.md).

**A release is a whole section of the roadmap.** Everything under *the next release* in
[`docs/roadmap.md`](docs/roadmap.md) ships together, and nothing ships until all of it is ✅.
When an item will not make it, move it to the release after, or to *Later*, in a pull request of
its own — the release waits for the roadmap, and the roadmap changes on purpose, never because a
release happened. A fix that cannot wait ships the same way: move what is unfinished out, then
release. The *Release gate* check holds this on every pull request into `main`; run
`tools/release-gate.sh` to see what the next release still waits for. It also refuses a section
whose version has already shipped, since every item in it is done by then: the roadmap moves on
(step 5) before anything else is released.

1. When every item under *the next release* is ✅, open a pull request from `develop` into `main`,
   and merge it with a **merge commit** (not a squash, which would flatten every change into one
   entry).
2. release-please opens or updates a *release* pull request on `main`. Its description is the
   changelog of the next version. Check it names the version the roadmap does — a section with a
   `feat` in it is the next minor — and that no entry appears twice.
3. Merging it tags the release. The release workflow then builds the AppImage, the Flatpak, the
   Windows installer and the macOS dmg, attests their provenance, and attaches them with an SBOM,
   once all of them have built.
4. Bring the release commit back: a pull request from `main` into `develop`, squash-merged like
   every other, titled for the changelog it will never reach — *chore(release): bring 1.3.0 back
   into develop*.
5. Start the next section: move the released items from the roadmap into its record in
   [`docs/history/`](docs/history/), name the next release, and update the roadmap's *Released* and
   *Next* line.

Before a release that changes what prints, run the manual checks in
[`docs/release-checklist.md`](docs/release-checklist.md), and record the physical measurements in
[`docs/print-verification-log.md`](docs/print-verification-log.md). Print accuracy is never claimed
without one.

## Working with Claude Code

The repository is set up for it: [`CLAUDE.md`](CLAUDE.md) holds the invariants, and
[`docs/claude-code-setup.md`](docs/claude-code-setup.md) lists the project's skills, commands and
hooks. One slice per session works best. Start with `/slice <number>`, and let `/geo-check` and
`/arch-check` run before calling it done.
