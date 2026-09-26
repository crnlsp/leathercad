---
description: Start a numbered slice from the roadmap — read it, plan it, then build it test-first
argument-hint: "<slice number, e.g. 1.4>"
---

Start slice **$1** from `docs/roadmap.md` (the 1.0 slices are in `docs/history/roadmap-to-1.0.md`).

Use the `vertical-slice` skill and follow it exactly.

Before writing any code:

1. Read the slice entry and restate its acceptance criteria as things a person could check by using
   the software. "Implement PathMeasure" is not an acceptance criterion; "asking for the point
   3.85 mm along a rounded rectangle returns a point on the outline" is.
2. Read the doc that governs the layer being touched.
3. Say what will change, in which packages, in what order — and confirm no new edge is being added
   to the layer graph without an ADR.

Then build it. In `core`, `geometry` and `domain`, the tests come first: in this domain the test is
the specification, and writing it afterwards lets a plausible implementation quietly redefine the
contract.

Finish by running `pnpm check`, reporting the real output, walking the `geometry-review` checklist
if the pure layers were touched, and updating `docs/roadmap.md`.

Then land it the way `CONTRIBUTING.md` says: commit on the slice branch, push it — the
pre-push hook runs `pnpm check` again — and open the pull request with `gh pr create --fill`. Do not
merge it; report the run and let the human decide.
