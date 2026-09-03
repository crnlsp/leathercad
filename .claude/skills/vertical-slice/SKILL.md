---
name: vertical-slice
description: Use when starting or finishing any numbered slice from docs/roadmap.md §4. Enforces the loop — acceptance criteria first, tests before implementation in the pure layers, verify by running, update docs in the same commit.
---

# Vertical slice

Every unit of work leaves the application running, the tests green, and something demonstrable. No
slice ends with the repo broken, and no slice is "just the model layer, UI next week".

## Before writing code

1. **Read the slice** in `docs/roadmap.md` §4 and restate its acceptance criteria in your own words.
   If the slice has no written acceptance criteria, write them first and get them confirmed — a
   slice without observable criteria cannot be finished, only abandoned.
2. **Read the doc that governs the layer** you are about to touch:

   | Touching | Read |
   |---|---|
   | `packages/geometry`, `packages/core` | `docs/geometry.md`, especially §12 |
   | `packages/domain` | `docs/domain-model.md`, `docs/glossary.md` |
   | `packages/persist` | `docs/file-format.md` |
   | `packages/export`, `packages/print` | `docs/printing.md` |
   | anything structural | `docs/architecture.md` |

3. **Say what you will change**, in which packages, in what order. Check it against the layer graph
   in `CLAUDE.md` — if the change needs a new edge in that graph, that is an architecture decision
   and needs an ADR, not a quiet import.

## While building

- **Tests first in `core`, `geometry` and `domain`.** Not ritual: in this domain the test *is* the
  specification, and writing it after lets a plausible implementation quietly redefine the contract.
- For UI work, write the command and its test first, then wire the interface to it. The command has
  a contract; the panel does not.
- Keep the slice to roughly 200–600 lines of production code. Larger means it was two slices.
- Resist finishing adjacent work you notice. Note it; it is a different slice.

## Before calling it done

- [ ] Every acceptance criterion demonstrably met — state how you checked each one.
- [ ] `pnpm check` run, and the **actual output** reported. Not "should pass".
- [ ] For anything touching the pure layers, the `geometry-review` skill's checklist walked.
- [ ] For anything user-visible, the app actually launched and looked at. Screenshots catch what
      assertions do not — the config-path bug in slice 0.2 passed every test.
- [ ] Docs updated **in the same commit** if the change invalidated anything in `CLAUDE.md` or
      `docs/`. A stale doc is worse than a missing one, because it will be followed.
- [ ] `docs/roadmap.md` marked done, with any gotcha worth not rediscovering.
- [ ] Commit message names the slice and its user-visible effect, not the files touched.

## Never

- Claim a check passed without running it.
- Add a dependency without an ADR in `docs/adr/`.
- Write geometry code without a property test.
- Persist derived geometry, add a coordinate in pixels, or scale content to fit a page.
