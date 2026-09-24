# Loader hardening: a pitch the editor cannot make (slice 5.6) — design

**Date:** 2026-09-23
**Status:** Built in the slice's pull request; the decision in §2 was accepted at review.
**Row:** [roadmap](../../roadmap.md) Phase 5, slice 5.6 ·
[engineering tooling](2026-09-23-engineering-tooling-design.md) finding F1

---

## 1. The defect

A `.lcp` file whose stitch-hole `pitchMm` is tiny (`1e-300` reproduces it) passes `ProjectSchema`,
which only asks that a pitch is not negative. `evaluate` then asks `distributeAlongPath` for
`length / pitch` holes, about 10³⁰² of them, and the process runs out of memory. Reproduced on
`main` at `ad39f26`: `LEATHERCAD_FC_RUNS=20000` on `lcp.fuzz.test.ts` kills its worker with
`SIGABRT`.

The editor cannot make that file, because `StitchHoleSetEditor` stops the field at 0.5 mm. So only
a damaged, hand-edited or hostile file reaches the code, and the fuzz contract is exactly about
those: **a project that loads must evaluate.**

## 2. The decision the roadmap left to the slice

*Refuse at the schema, or cap in `evaluate` with a `Problem`?* **Cap in `evaluate`.**

- **Consistency with what already happens.** A pitch of **0** passes the schema today. `evaluate`
  reports `PARAMETER_INVALID` on that one hole set, and the rest of the project is fine. A pitch
  of `1e-300` is the same mistake, only harder to see, so it should behave the same way.
- **The user keeps the file.** A project is hours of work. With a schema refusal, one bad number
  in one hole set locks the maker out of the whole thing. With a domain refusal the file opens,
  the hole set is listed in Problems with the reason, and typing a pitch fixes it. That follows
  the refusal model: refuse, change nothing, say why.
- **It protects every way into the domain,** not only the loader. The command that adds holes
  takes the project's `defaultIronPitchMm` when no pitch is given, and that setting comes from the
  file too.

**What this changes in the roadmap entry.** Its acceptance criterion was written with the schema
in mind: the file was to be refused with `InvalidProjectFileError`. Under this decision the file
**loads**, and the hole set fails with `PARAMETER_INVALID` naming it. Both happen in milliseconds.
The roadmap is updated to say so.

It remains a validation change and **not a format version**. The editor has never written a pitch
under 0.5 mm, so no file it made changes meaning.

## 3. What is built

- **`MIN_PITCH_MM = 0.5` in `domain`** (`stitch.ts`), exported. The pitch field in
  `StitchHoleSetEditor` reads it, so the editor's floor and the domain's are one number.
  Nothing near it is an iron: the glossary's common pitches start at 2.7 mm. 0.5 is a generous
  floor, and it is the one the editor already enforced.
- **`PARAMETER_INVALID` gains an `at-least` requirement** with a `minimum` fact. The existing
  requirements (`finite`, `positive`, `non-negative`) are unchanged. `evaluate`'s parameter check
  asks the pitch to be at least the floor.
- **The message says the rule, not the number.** The catalogue rounds to four places, so
  `1e-300` would print as "0", which is wrong for a positive value. It reads, in the catalogue's
  existing form: *"Stitch holes's pitch is below 0.50 mm, the smallest that can be used. Type at
  least 0.50 mm."*

### Where the one invariant is enforced

`MIN_PITCH_MM` is the only definition of the floor. Every way a pitch is produced meets it:

| Path | How it meets the floor | Test |
|---|---|---|
| **Generation** (`distributeHoles`, the one place holes are made) | A precondition: it throws `RangeError` before generating anything | `stitch.test.ts` |
| **Evaluation** | Checks first, and refuses the hole set with `PARAMETER_INVALID` naming it | `derive.test.ts` |
| **Loading** | Passes the number through as data, by the decision above. Evaluation refuses it | `lcp.test.ts`, with a raw `1e-300` written by hand |
| **Editing**: the pitch field | `min={MIN_PITCH_MM}` | — |
| **Editing**: the iron presets | All of them are at or above the floor | `irons.test.ts` |
| **Commands**: *Add stitch holes* with no pitch | Copies the project's `defaultIronPitchMm`, which comes from the file. Evaluation refuses it | `cutOutCommands.test.ts` |

## 4. The audit the roadmap asks for

*Anything whose size scales with `length / parameter` needs a floor the editor already enforces, or
a cap in the domain.* Every quantity that evaluation or drawing generates in proportion to something
in the file:

| Quantity | Scales with | Bounded by | Verdict |
|---|---|---|---|
| **Stitch holes** | path length ÷ **pitch** | nothing, before this slice | **Floored here**: pitch ≥ 0.5 mm |
| PathMeasure samples | segments × steps per segment | steps come from a fixed tolerance, and a radius is at most the ±100 000 mm coordinate limit | Bounded |
| Glyph outlines | characters in a label | the file's own size (no amplification) | Bounded |
| Offset pieces | segments | the file's own size | Bounded |
| Fold ticks (F.7) | length on screen ÷ 96 px | the coordinate limit and the viewport's zoom | Bounded |
| Cut-out hatch (F.7) | box diagonal on screen ÷ 6 px | the coordinate limit and the viewport's zoom | Bounded |
| Measurement precision | — | an enum, 0–2 | Bounded |
| Quantity to cut | — | only printed as words; nothing is repeated per unit | Bounded |

Only the pitch divides a length by a number the file controls, so only the pitch needed a floor.

**Recorded, not fixed here.** With the floor in place, the hole count is linear in the size of the
geometry, but it is still large at the edge of the coordinate range. A circle of radius 100 m at a
0.5 mm pitch is about 1.26 million holes. The editor can draw that, which puts it outside a slice
about refusing what the editor cannot make. It is a performance question for when someone designs a
hide-sized pattern, and it belongs with a hole-count budget if one is ever wanted.

## 5. Acceptance criteria

1. Opening the reproducing file (pitch `1e-300`) **opens the project** in milliseconds. The hole set
   is listed in Problems as *Unusable number*, naming it and the 0.5 mm floor. The rest of the part
   draws. Typing a pitch of 3.85 fixes it.
2. A pitch of **0.5 mm** still stitches, exactly as before. A pitch under it is refused, whatever the
   line.
3. The pitch field in the panel cannot go below the same 0.5 mm, because it reads the same constant.
4. `lcp.fuzz.test.ts` passes at `LEATHERCAD_FC_RUNS=20000`.
5. No format version, no schema change, and no new edge in the layer graph.

## 6. Tests

- **Domain, first:**
  - `evaluate` refuses a pitch of `1e-300` with `PARAMETER_INVALID`, `requirement: 'at-least'`, and
    `minimum: MIN_PITCH_MM`, naming the feature. It finishes within a time bound a runaway loop
    could never meet.
  - A property test: every pitch in `(0, MIN_PITCH_MM)` is refused, and every pitch in
    `[MIN_PITCH_MM, 20]` resolves to holes.
- **Messages:** the `at-least` wording names the parameter and the floor, and never prints a
  rounded-away value.
- **Persist:** the named regression test in `lcp.test.ts` loads the reproducing file and evaluates
  it. The file is written by hand, because the app's serialiser rounds to six decimals and would
  save `1e-300` as 0.
- **Fuzz** at 20 000 runs, locally, with the result reported. CI stays on its pinned 300.
