# Claude Code setup

How this repository is configured to get useful work out of Claude Code, what is deliberately left
out, and what has been proposed but not built.

**Status:** Describes what is in `.claude/` and `CLAUDE.md` today.
**Last updated:** 2026-09-26

---

## 1. The principle

The value comes from **encoding the project's invariants somewhere they will be read**, not from
accumulating integrations. Most of this project's rules are invisible in the code: nothing about
`function offsetPath(path, distance)` says the units are millimetres, that the result may be empty,
or that a property test is mandatory. The configuration below exists to say so.

Everything here is chosen against one test: *would its absence let a wrong change through?*

## 2. `CLAUDE.md`

Short and load-bearing: the invariants, the commands, and the map, delegating everything else to
`docs/`.

- **Under ~150 lines.** A long `CLAUDE.md` is skimmed, which makes it worse than a short one.
- **Invariants, not explanations.** A rule earns its line; the reasoning belongs in `docs/`.
- **Updated in the same commit** as any change that invalidates it. A stale `CLAUDE.md` is actively
  harmful, because it will be followed.
- **Points at `docs/`, never duplicates it.** Duplication guarantees divergence.

## 3. Project documentation

| File | Purpose | Read when |
|---|---|---|
| `docs/product-spec.md` | What the product is and is not | Deciding whether something belongs |
| `docs/architecture.md` | Stack, layering, data flow, canvas system, risks | Any structural change |
| `docs/domain-model.md` | Features, derivation graph, stitching, validation | Any domain work |
| `docs/geometry.md` | Representation, numerics, algorithms, the done-checklist | Any `packages/geometry` work |
| `docs/file-format.md` | `.lcp`, versioning, migrations | Any persistence work |
| `docs/printing.md` | Export and print pipeline, accuracy budget | Any export or print work |
| `docs/testing.md` | Layers, property catalogue, edge-case corpus | Writing tests, which is always |
| `docs/roadmap.md` | What is planned, open findings | Starting a slice |
| `docs/history/roadmap-to-1.0.md` | Every 1.0 slice, and what it found | Before redoing something that was tried |
| `docs/glossary.md` | Craft vocabulary | Whenever domain naming is in question |
| `docs/adr/NNNN-*.md` | Why a decision was made | Before revisiting a decision |
| `docs/superpowers/specs/` | The dated design of each larger slice | Changing what a slice built |
| `CONTRIBUTING.md` | Branches, commits, changelog, releases | Committing, opening a pull request |

## 4. Skills

In `.claude/skills/`. Skills encode review checklists and multi-step procedures — things that are
easy to state and easy to forget.

### `geometry-review`
**Use when:** any change under `packages/geometry`, `packages/core` or `packages/domain`.

Walks the definition-of-done from [geometry.md](geometry.md) §12: `NaN`/`Infinity` guards, explicit
degenerate-input handling, no float equality, epsilons from `core/epsilon.ts`, at least one property
test, determinism, no imports outside the allowed layers, no pixel or DOM references. Cross-checks
the change against the edge-case corpus in [testing.md](testing.md) §4 and names which entries
apply. Flags any golden-fixture diff as needing deliberate review.

### `vertical-slice`
**Use when:** starting or finishing a slice from `docs/roadmap.md`.

Drives the loop in [`CONTRIBUTING.md`](../CONTRIBUTING.md#a-change-is-a-vertical-slice): restate
the acceptance criteria, identify the affected packages, write tests first, implement, verify with
`/geo-check` and `/arch-check`, run the app, update docs if an invariant changed. Refuses to proceed
if the slice has no written acceptance criteria.

### `frontend-design`
**Use when:** designing or reshaping UI in `apps/desktop/src/renderer` or the theme in
`packages/render/src/theme/`.

Guidance on intentional visual design and interface copy: a compact token plan made before code,
restraint, and plain labels that name what the user gets, not how the system is built. Vendored
verbatim from [anthropics/skills](https://github.com/anthropics/skills) at `34040c9`, under
Apache-2.0, with its `LICENSE.txt` beside it. To update it, copy the upstream files over again
rather than editing in place, so it stays diffable against upstream.

It is written mostly for web pages, so where it disagrees with `CLAUDE.md`, `CLAUDE.md` wins:
vendored fonts only, and tokens live in the theme, never in `styles.css`. It covers how the
interface looks and reads, not how it behaves.

### Proposed, not built

Each of these was designed before 1.0 and would earn its place; none exists yet.

- **`leather-domain-review`** — checks a change against craft reality: glossary terms, plausible
  pitches, corner behaviour a maker expects, true millimetres end to end.
- **`export-validation`** — runs the fixtures through every export backend, parses the files back,
  and tabulates expected against actual millimetres. Worth building with SVG and DXF export (6.2,
  6.5).
- **`new-tool`** — the checklist for a canvas tool: a state discriminant, Escape rolls back, all
  mutation by command, overlay, snapping, cursor, numeric entry, shortcut, and the tests.
- **`new-feature-type`** — every place a new `Feature` kind must be touched, from the type union
  and zod schema to each export backend and the property panel.
- **`format-migration`** — the procedure for changing anything persisted, with its two
  prohibitions: never edit a shipped migration, never delete one.

## 5. Slash commands

In `.claude/commands/`.

| Command | Does |
|---|---|
| `/slice <n>` | Reads slice `<n>` from the roadmap and the docs it references, restates the acceptance criteria, plans, then builds test-first and opens a pull request |
| `/geo-check` | `pnpm check`, reported stage by stage, with golden diffs and fast-check counterexamples called out |
| `/arch-check` | `pnpm depcruise`, with each violation's rule and why it exists |

Proposed and not built: `/export-check` (every fixture through every backend), `/verify-print`
(the checklist, and a dated row in the verification log), `/adr <title>` (the next numbered ADR
from a template). Their logic belongs in a script or package that CI can run too, with the slash
command a thin caller: a command holding real logic is a check CI cannot run. A `cli` package is
reserved in `.dependency-cruiser.cjs` for that and not yet created.

## 6. Hooks

Deliberately minimal: a hook runs on every matching tool call, so an expensive one taxes every
edit, and a noisy one gets ignored.

In `.claude/settings.json` there is one: **`PostToolUse` on `Edit`/`Write`** runs Prettier on the
changed file if it is code or configuration. Fast, and it takes formatting out of review.

**What is deliberately a lint rule instead**, because rules run in CI and in the editor while hooks
only run in Claude Code:

- Float equality in `geometry` and `domain`.
- Pixel identifiers, `canvas`, `window`, `document` or `devicePixelRatio` inside the pure layers.
- `Math.random()` or `Date.now()` outside approved modules.
- Cross-package imports that bypass a package's `index.ts`.
- Any Clipper binding at all (`pnpm depcruise` refuses one; ADR 0008).

**Deliberately CI-only:** the full suite, visual regression, E2E, and benchmarks — too slow for the
edit loop. The `pre-push` git hook runs `pnpm check` for humans and Claude alike.

## 7. MCP servers

Mostly a list of things not to install.

**Worth having:** **context7**, for current documentation of `pdf-lib`, Electron and Playwright —
exactly the libraries where a wrong-version API guess costs a debugging session.

| Not worth having | Why not |
|---|---|
| A filesystem MCP | Claude Code's own file tools already do this |
| A generic "database" or "memory" MCP | No database, and the memory that matters belongs in `docs/`, where people read it too |
| A PDF-inspection MCP | Better as a script, because then CI can run it too |
| A "geometry helper" MCP | The geometry engine *is* the project; an external one would be a second source of truth |

The rule: **prefer a script in the repository over an MCP server.** A script is versioned with the
code, testable, runnable in CI, usable by a person, and callable by Claude Code through Bash.

## 8. External tools that earn their place

Beyond the dependencies in [architecture.md](architecture.md) §1:

- **dependency-cruiser** — the layering rules are the architecture; unenforced, they decay within
  weeks.
- **The pinned Playwright container** — required for stable pixel diffs.
- **release-please** — versions, tags and the changelog from Conventional Commits
  ([ADR 0014](adr/0014-electron-builder-and-release-please.md)).
- **`gh`** — pull requests, releases and issues, through Bash.

Not needed: Docker for development (it is a desktop app), Storybook (high upkeep for a
canvas-centric UI), a monorepo task runner such as Nx or Turborepo (pnpm workspaces and scripts are
enough; revisit if a build takes over a minute).
