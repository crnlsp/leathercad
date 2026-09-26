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
the same pins. (pnpm is not bundled with Node. On Arch, `sudo pacman -S pnpm`.)

```bash
pnpm install        # also installs the pre-push hook
pnpm dev            # runs the app, with hot reload
```

| Command | What it does |
|---|---|
| `pnpm check` | Typecheck, lint, format, layering, dead code, tests with coverage, performance ceilings. **Run it before every push** — the pre-push hook does |
| `pnpm test` | Unit, property, golden, export and snapshot tests |
| `pnpm test:e2e` | Builds, then Playwright drives the real Electron app (with an accessibility scan) |
| `pnpm test:visual` | Pixel diffs in the pinned Playwright container. Needs Docker and `pnpm build` |
| `pnpm test:packaged` | Packages the app, then smoke-tests the packaged binary |
| `pnpm package` | This platform's installer, in `apps/desktop/release/` |
| `pnpm docs:media` | Retakes the README's screenshots and demo from the real app (needs a display, poppler, ffmpeg, gifsicle and pngquant) |
| `pnpm bench` | Benchmarks; `bench:compare` against the committed baseline |

The layering in [`docs/architecture.md`](docs/architecture.md) §2 is enforced by `pnpm depcruise`: a
violation fails the build, deliberately.

## Branches

- **`main` is production.** What is on it is what is released. Nothing is pushed to it directly;
  it changes only through a pull request from `develop`.
- **`develop` is development.** Work lands here, through pull requests from short-lived branches.

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

## Changelog and releases

[`CHANGELOG.md`](CHANGELOG.md) is written by
[release-please](https://github.com/googleapis/release-please) from the commits on `main`; nobody
edits it by hand except to correct a mistake in an entry. See
[ADR 0014](docs/adr/0014-electron-builder-and-release-please.md).

1. When `develop` is ready, open a pull request from `develop` into `main`, and merge it with a
   **merge commit** (not a squash, which would flatten every change into one entry).
2. release-please opens or updates a *release* pull request on `main`. Its description is the
   changelog of the next version: **that pull request is the list of unreleased changes.**
3. Merging it tags the release. The release workflow then builds the AppImage, the Windows
   installer and the macOS dmg, attests their provenance, and attaches them with an SBOM.
4. Bring the release commit back: merge `main` into `develop`.

Before a release that changes what prints, run the manual checks in
[`docs/release-checklist.md`](docs/release-checklist.md), and record the physical measurements in
[`docs/print-verification-log.md`](docs/print-verification-log.md). Print accuracy is never claimed
without one.

## Working with Claude Code

The repository is set up for it: [`CLAUDE.md`](CLAUDE.md) holds the invariants, and
[`docs/claude-code-setup.md`](docs/claude-code-setup.md) lists the project's skills, commands and
hooks. One slice per session works best. Start with `/slice <number>`, and let `/geo-check` and
`/arch-check` run before calling it done.
