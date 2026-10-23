---
paths:
  - 'packages/core/**'
  - 'packages/geometry/**'
  - 'packages/typography/**'
  - 'packages/domain/**'
---

# The pure layers: core, geometry, typography, domain

A wrong answer here is invisible until leather is cut. The done-checklist is `docs/geometry.md`
§12 and the `geometry-review` skill walks it; this file is how to write code that passes it.

- **Test first, as properties.** Write the property before the function: what must hold for every
  input (`docs/testing.md` §3.2), then the edge-case corpus (§4). A counterexample fast-check
  shrank to becomes a named regression test.
- **Total functions, or a loud contract.** Every public function either handles all input it can
  be given — the degenerate cases included — or refuses at entry with a `RangeError` that names
  the received value. Nothing returns `NaN`, and nothing half-works on bad input.
- **Inputs are never mutated** *(strict)*. Take `readonly` data and return new values, sharing
  whatever did not change. Evaluation's cache relies on this: an unchanged feature is the same
  object between revisions (`domain/src/evaluate.ts`).
- **No state that can change an answer.** No counters, no clock, no lazily filled table that a
  call's result depends on. Memoising is allowed when the result cannot go stale: a `WeakMap`
  keyed on immutable input, as evaluation does, holds no invalidation logic to get wrong. Add one
  only where a benchmark shows the need.
- **Tolerances come from `core/epsilon.ts`.** Choose the one whose meaning fits — length, angle,
  parameter — and say in a comment why when it is not obvious. A test's tolerance is never looser
  than the code's.
- **Name by the glossary.** A function that returns achieved spacing is not called `pitch`.
- **A small API.** Export what another package needs through `index.ts`, nothing more. Helpers stay
  private to their module, and `pnpm knip` flags what nobody imports.
