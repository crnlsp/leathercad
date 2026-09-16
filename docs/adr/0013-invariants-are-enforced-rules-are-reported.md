# 13. Structural invariants are enforced; design rules are reported

**Status:** Accepted
**Date:** 2026-09-15

## Context

Phase 4 ends with a validation engine and a problems panel (slice 4.12). `domain-model.md` §8 lists
twelve diagnostic codes. Read against the code, they are three different things sharing one format:

- **States a command can refuse to create:** `PART_HAS_MULTIPLE_OUTER`; a cut contour that is not
  closed; and, once [ADR 0009](0009-explicit-resolution-when-deleting-a-source.md) makes dangling
  references unrepresentable, `BROKEN_DERIVATION` in its "source was deleted" sense.
- **Outcomes of evaluating a feature:** `OFFSET_COLLAPSED`, `OFFSET_SPLIT`.
- **Legal states that are probably mistakes for leather:** holes outside the part, a hole too close
  to the edge.

The code has no shared model for any of them, and each gap hides something:

- Evaluation errors are strings, so a validator would have to re-derive what went wrong.
- Two refusals are silent. `addDerived` returns the document unchanged when a derivation would close
  a cycle, and `transformFeatures` leaves a derived feature where it was without saying why.
- An offset that splits keeps its first piece and drops the rest, with no report
  (`evaluate.ts`: `const [result] = offsetPath(...)`).
- A feature that fails to evaluate is skipped by `buildDisplayList`, so it vanishes from the canvas,
  where `domain-model.md` §4.4 says it should draw as a warning.

Validation built as a list of checks added at the end would inherit all of that.

## Decision

Three categories, each with one enforcement point.

1. **Structural invariants.** The document is never in violation, in memory or on disk.
   - Commands enforce them. Every refusal is explained by a pure query that shares the command's
     check and returns a reason written for the user, the pattern `refusedTransforms` already
     follows.
   - The loader enforces them on files, refusing with the field named.
   - They never appear in the problems panel, because they cannot be violated.
2. **Evaluation outcomes.** Every feature either resolves or fails with a typed failure:
   `{ code, message, featureId, location? }`. **Nothing is removed from geometry without a
   diagnostic.** An offset that splits reports `OFFSET_SPLIT` and says what it kept.
3. **Design rules.** `validate(resolved)` reports states that are legal and probably wrong. Every
   rule names the domain invariant it protects, recorded in `domain-model.md` §8, and codes are
   stable strings.

**One list, many views.** Refusals surface at the gesture: the status bar notice, or the dialog for
a delete with dependents. Outcomes and rules surface in the problems panel. The parts panel badges,
the property panel's problem section, the canvas warning outline and the export warning all read
that same list, and none computes its own.

**Validation grows with the invariants, not at the end.** The diagnostic channel lands first. Each
Phase 4 slice adds the refusals and rules for the invariants it introduces, and slice 4.12 completes
the catalogue and the navigation.

## Consequences

Built in slice 4.12a; the design is
[the slice spec](../superpowers/specs/2026-09-15-diagnostic-channel-design.md), which separates the
channel into identity (`problems/codes.ts`), information (`problems/problem.ts`), presentation
(`problems/messages.ts`) and surfaces. A typed failure is `{ problem, location? }`, where a
`Problem` is a code plus typed facts and carries no sentence at all — the words come from the one
catalogue, which a dependency-cruiser rule keeps the rest of the domain from importing.

- `ResolvedFeature`'s error changes from a string to a typed failure.
- Silent refusals become explained ones: closing a cycle, moving a derived feature on its own,
  scaling a linked mirror.
- An audit test keeps the categories honest. Every rule code maps to a documented invariant, and
  every structural invariant has both a command-refusal test and a loader test.
- A failed feature draws as a warning outline instead of vanishing.

## Alternatives rejected

- **One flat list of checks** (`domain-model.md` §8 as written). It reports states the code could
  prevent, and it cannot explain the ones the code refuses silently.
- **Validation only at export.** Mistakes surface after the design work is done, when they are most
  expensive to trace back.
- **Blocking edits that break a design rule.** A part legitimately has no outline while it is being
  redrawn. Rules inform; only invariants refuse.
