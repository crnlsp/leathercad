# Claude Code Setup

How this repository is configured to get useful work out of Claude Code, and — equally — what is
deliberately left out.

**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. The principle

The value comes from **encoding the project's invariants somewhere they will be read**, not from
accumulating integrations. This project has an unusual property: most of its rules are invisible in
the code. Nothing about `function offsetPath(path, distance)` reveals that the units are
millimetres, that the result may be empty, or that a property test is mandatory. That is what the
configuration below is for.

Everything here is chosen against one test: *would its absence let a wrong change through?*

## 2. `CLAUDE.md`

Short and load-bearing. It states the invariants, the commands, and the map — and delegates
everything else to `docs/`.

Rules for keeping it useful:

- **Under ~150 lines.** A long `CLAUDE.md` is skimmed, which makes it worse than a short one.
- **Invariants, not explanations.** "Y is up; the flip lives in `render/canvas2d` and `export/svg`"
  earns its line. A paragraph on why Y-up is better belongs in `docs/geometry.md`.
- **Update it in the same commit** as any change that invalidates it. A stale `CLAUDE.md` is
  actively harmful, because it will be followed.
- **Point at `docs/`, don't duplicate it.** Duplication guarantees divergence.

The proposed initial contents are in `CLAUDE.md` at the repository root.

## 3. Project documentation

| File | Purpose | Read when |
|---|---|---|
| `docs/product-spec.md` | Scope, MVP boundary, deferred features | Deciding whether something belongs in v1 |
| `docs/architecture.md` | Stack, layering, data flow, canvas system, risks | Any structural change |
| `docs/domain-model.md` | Features, derivation graph, stitching, validation | Any domain work |
| `docs/geometry.md` | Representation, numerics, algorithms, the done-checklist | Any `packages/geometry` work |
| `docs/file-format.md` | `.lcp`, versioning, migrations | Any persistence work |
| `docs/printing.md` | Export and print pipeline, accuracy budget | Any export or print work |
| `docs/testing.md` | Layers, property catalogue, edge-case corpus | Writing tests, which is always |
| `docs/roadmap.md` | Repo structure, workflow, slices, milestones | Starting a slice |
| `docs/glossary.md` | Craft vocabulary | Whenever domain naming is in question |
| `docs/adr/NNNN-*.md` | Why a decision was made | Before revisiting a decision |
| `docs/print-verification-log.md` | Physical measurements per release | After every print slice |

The glossary matters more than it looks. Without it, "stitch spacing" drifts between meaning the
iron's nominal pitch and the achieved distance, and the resulting API is confusing forever.

**ADRs** are one page: context, decision, consequences, alternatives rejected. Write one for every
dependency added and every reversal. `0002-electron-over-tauri.md` is the first that matters,
because that decision *will* be questioned later and the reasoning needs to survive.

## 4. Skills

Skills encode review checklists and multi-step procedures — the things that are easy to state and
easy to forget.

### `geometry-review`
**Use when:** any change under `packages/geometry` or `packages/domain`.

Walks the definition-of-done from [geometry.md](geometry.md) §12: `NaN`/`Infinity` guards, explicit
degenerate-input handling, no float equality, epsilons from `core/epsilon.ts`, at least one property
test, determinism, no imports outside `core`/`geometry`, no pixel or DOM references. Cross-checks
the change against the edge-case corpus in [testing.md](testing.md) §4 and names which entries
apply. Flags any golden-fixture diff as needing deliberate review.

### `leather-domain-review`
**Use when:** any change under `packages/domain`, or any feature affecting stitching.

Checks the change against craft reality rather than code quality. Does terminology match
`docs/glossary.md`? Are pitch values plausible? Does corner behaviour match what a maker expects —
a hole *on* the corner for a sharp corner? Are dimensions true millimetres end to end? Would this
produce a pattern someone could actually cut? This is the reviewer that catches "correct code, wrong
craft".

### `export-validation`
**Use when:** any change under `packages/export` or `packages/print`.

Runs the fixture projects through every export backend, parses the artefacts back, and reports a
table of expected against actual millimetres. Verifies: no scaling transform in the PDF content
stream, MediaBox exact, SVG `width`/`height` in mm with no root transform, DXF `$INSUNITS = 4`,
layer names consistent across backends, and Y-axis orientation correct in each. Ends by reminding
that a physical print check is required before the slice is done.

### `new-tool`
**Use when:** adding a canvas tool.

The checklist that keeps the interaction layer from rotting: explicit state discriminant rather than
booleans, Escape rolls back the transaction and returns to idle, all mutation via dispatched
commands, an overlay built through `buildOverlay`, snapping wired with the right candidate filters,
a cursor, numeric entry where it makes sense, a keyboard shortcut registered, a state-machine test,
and an undo round-trip test.

### `new-feature-type`
**Use when:** adding a `Feature` kind to the domain.

Enumerates every place a new feature kind has to be touched, because missing one produces a feature
that works until it is saved, or until it is exported: the type union, the zod schema, the evaluator
case, the layer role and style entry, the display-list builder, the export-scene builder, each export
backend's mapping, the validation rules, the property panel, the serialisation round-trip test, and —
if the schema changed shape — a format migration.

### `format-migration`
**Use when:** changing the shape of anything persisted.

The exact procedure: bump `CURRENT_FORMAT_VERSION`, add a migration to the chain, save a real
fixture as `fixtures/format/v<N>.lcp`, add the chain test, verify every older fixture still opens,
and confirm the round-trip and byte-stability tests still pass. States the two prohibitions loudly:
never edit a shipped migration, never delete one.

### `vertical-slice`
**Use when:** starting any slice from `docs/roadmap.md`.

Drives the loop in [roadmap.md](roadmap.md) §2.2 — restate acceptance criteria, identify affected
packages, write tests first, implement, verify with `/geo-check` and `/arch-check`, run the app,
update docs if an invariant changed, commit. Refuses to proceed if the slice has no written
acceptance criteria.

## 5. Slash commands

Thin wrappers over the project CLI. Each is a few lines that runs a command and interprets the
output.

| Command | Does |
|---|---|
| `/slice <n>` | Reads slice `<n>` from the roadmap plus the docs it references, restates the acceptance criteria, and plans before touching code |
| `/geo-check` | `typecheck` + geometry and domain unit, property, and golden tests; summarises failures and highlights golden diffs |
| `/export-check` | Exports every fixture to SVG, PDF, and DXF; parses them back; prints an expected-vs-actual millimetre table |
| `/print-preview <fixture>` | Generates a tiled PDF and reports page count, grid, overlaps, and registration marks; opens it |
| `/arch-check` | `dependency-cruiser` plus the custom lint rules; reports layering violations |
| `/domain-review` | Runs `leather-domain-review` against the current diff |
| `/perf` | Runs the benchmarks and compares against `tools/bench-baseline.json` |
| `/newpkg <name>` | Scaffolds a workspace package with tsconfig, vitest, eslint, and dependency-cruiser rules wired up |
| `/adr <title>` | Creates the next numbered ADR from the template |
| `/verify-print` | Prints the checklist from [printing.md](printing.md) §9 and appends a dated entry to the verification log |

The pattern to follow: **the logic lives in `packages/cli`, and the slash command is a thin caller.**
That way the same check runs in CI, from a terminal, and from Claude Code, with one implementation.
A slash command containing real logic is a check that CI cannot run.

## 6. Hooks

Deliberately minimal. Hooks run on every matching tool call, so an expensive one taxes every edit,
and a noisy one gets ignored — which is worse than not having it.

In `.claude/settings.json`:

- **`PostToolUse` on `Edit`/`Write` matching `**/*.ts`** → Prettier and ESLint `--fix` on the changed
  file only. Fast, and it removes formatting from code review entirely.
- **`PostToolUse` on `packages/geometry/**` and `packages/domain/**`** → run that package's test
  subset. A few seconds, and it catches geometry regressions at the moment they are introduced
  rather than at the end of the session.
- **`Stop`** → `pnpm typecheck && pnpm test --run` and report. Ensures a session never ends with the
  repository broken.

**What is deliberately a lint rule instead of a hook**, because rules run in CI and in the editor
while hooks only run in Claude Code:

- Float equality in `geometry` and `domain` (`no-restricted-syntax`).
- Identifiers ending in `Px`, or references to `canvas`, `window`, `document`, or `devicePixelRatio`
  inside `geometry` and `domain`.
- `Math.random()` or `Date.now()` outside approved modules.
- Cross-package imports that bypass a package's `index.ts`.
- Importing Clipper anywhere but `geometry/internal/clipper.ts`.

**What is deliberately CI-only:** the full test suite, visual regression, E2E, and benchmarks. Too
slow to sit in the edit loop.

A blocking `PreToolUse` hook on already-shipped migration files is tempting, but a lint rule plus
the prohibition stated in `CLAUDE.md` and the `format-migration` skill covers it without the
friction of a hard block.

## 7. MCP servers

The brief was to avoid tools for their own sake, and this section is mostly a list of things not to
install.

**Worth having:**

- **context7** — current documentation for `pdf-lib`, Clipper2, Electron, Playwright, and
  `pdfjs-dist`. These are exactly the libraries where a wrong-version API guess costs a debugging
  session, and where training data goes stale. This is the one clear win.

**Not worth having, and why:**

| | Why not |
|---|---|
| A filesystem MCP | Claude Code's own file tools already do this |
| A GitHub MCP | The `gh` CLI is available through Bash and is enough for a solo open-source project |
| A generic "database" or "memory" MCP | No database, and the memory that matters belongs in `docs/` where humans read it too |
| A PDF-inspection MCP | Better as `lcad inspect-pdf`, because then CI can run it too |
| A "geometry helper" MCP | The geometry engine *is* the project; an external one would be a second source of truth |

The general rule this project should follow: **prefer a CLI subcommand over an MCP server.** A CLI
subcommand is versioned with the code, testable, runnable in CI, usable by a human, and invokable by
Claude Code through Bash. An MCP server is only the last of those. `packages/cli` is therefore the
main "integration surface", and it should grow as the project does.

**Browser tools** (already available in this environment) are genuinely useful for driving the
running Electron app during UI work, but automated interaction testing belongs in Playwright specs,
not in ad-hoc browser sessions.

## 8. External tools that earn their place

Beyond the dependencies in [architecture.md](architecture.md) §1.4:

- **dependency-cruiser** — the layering rules are the architecture; without automated enforcement
  they decay within weeks. High value, low cost.
- **A pinned CI container** — required for stable visual regression. Not optional if that suite is
  to survive.
- **changesets** — versioning and changelogs for an open-source project.
- **`gh` CLI** — releases and issues, through Bash.

Not needed: Docker for development (it is a local desktop app), Storybook (high upkeep for a
canvas-centric UI), a monorepo task runner like Nx or Turborepo (pnpm workspaces plus npm scripts
covers a project this size; revisit if builds exceed a minute).
