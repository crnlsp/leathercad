# Engineering practices

How to write code here, beyond the invariants in `CLAUDE.md`. Those win where the two meet. Each
rule below is a default: break it when you can say why, and say why in the commit or the review.

## Understand first

- **Read before you write.** Trace the real flow end to end — every caller of what you change, the
  test beside it, the doc the `CLAUDE.md` table points at. The smallest diff in the wrong place is a
  second bug.
- **Fix the cause, not the symptom.** Find where all callers route through and fix it once there.
  Grep for siblings of the bug: if one caller was wrong, others usually are.
- **Reproduce before fixing.** A bug gets a failing test first; the test is the proof it is fixed
  and the guard that it stays fixed.

## KISS and YAGNI

- **Build what the slice needs, nothing for "later".** No option nobody sets, no parameter with one
  value, no hook "in case". Later can add it, with the requirement in hand.
- **Boring over clever.** A loop that reads plainly beats a chain someone must decode. Optimise only
  what `pnpm bench` shows is slow, and keep the benchmark.
- **Prefer deletion.** Dead code, unused exports and stale flags go — `pnpm knip` finds most of them.
  A smaller codebase is cheaper to keep correct.
- **Reach for what exists, in order:** this codebase, the standard library and platform, an
  installed dependency, and only then new code. A new dependency needs an ADR.

## DRY — of knowledge, not of text

- **One fact, one place.** An epsilon, a theme token, a key binding, a role's dash rhythm, a word on
  screen: each has a home (`core/epsilon.ts`, `render/src/theme/`, `keymap.ts`, `en.json`). Read it
  from there; never restate it.
- **Look before you write a helper.** Re-implementing what lives a few files over is the commonest
  duplication. Search `core`, `geometry` and the package's own `index.ts` first.
- **Three similar lines are not yet an abstraction.** Extract on the third real repetition, and only
  when the copies change for the same reason. Two things that look alike but change for different
  reasons stay apart — a wrong abstraction costs more than a duplicate.
- **Docs point, they do not copy.** Link to the section; duplicated prose diverges.

## SOLID, as it applies to TypeScript here

- **Single responsibility.** A module, function or component has one reason to change. A React
  component reads and renders; a tool dispatches commands; a command mutates; geometry computes.
  When a file needs "and" to describe it, split it.
- **Open/closed through data, not hierarchies.** New feature kinds, tools and export formats are
  added by registering an entry in an existing table or discriminated union, not by editing a
  growing `if` chain in many places. An exhaustive `switch` with a `never` check makes the compiler
  list every place a new case must be handled.
- **Liskov.** Anything implementing an interface — `PlatformHost`, a render backend, an export
  writer — honours its whole contract, including the error cases, so callers never test which
  implementation they hold.
- **Interface segregation.** Ask for the narrowest type that works: a function that needs a point
  takes a `Vec2`, not a `Part`. Small parameter types keep the pure layers pure and tests cheap.
- **Dependency inversion at the edges.** Clock, entropy, file system and dialogs come in as
  parameters or through `PlatformHost`; nothing below `apps/desktop` reaches for the OS. No
  interface with one implementation unless it is such a boundary.

## Functions and types

- **Make illegal states unrepresentable.** Discriminated unions over optional-field soup;
  `readonly` data.
- **Expected failure has a type; a broken precondition throws.** A derivation that cannot resolve
  is an `ok: false` entry or a problem code; a file that cannot load is a typed error the caller
  handles (`InvalidProjectFileError`, `NewerFormatError`). A call that breaks a function's contract
  — a zero pitch, a negative radius — throws a `RangeError` naming the value it received.
- **Pure where possible.** Inputs in, value out, no hidden state. Side effects live at the edges,
  where they can be seen and faked.
- **Validate at trust boundaries, trust inside.** Files, IPC and user input are checked once (zod in
  `persist`, quantising user input); code past that boundary does not re-check.
- **No `any`, no non-null `!` to silence the compiler, no `as` that lies.** If the type is wrong,
  fix the type.
- **Small and named.** A function fits on a screen and its name says what it returns or does. Names
  come from `docs/glossary.md`; *pitch* and *spacing* are not interchangeable.
- **Comments say why, not what.** The code says what. A comment explains a constraint, a trade-off
  or a source; a deliberate shortcut names its ceiling and the way out.

## Errors

- **Fail loudly at the cause.** No empty `catch`, no swallowed `Result`. An error carries enough
  context to act on, as a code the app words — never a sentence below `apps/desktop`.
- **Never lose the user's work.** Any path that writes or discards a document handles failure
  explicitly and leaves the previous state intact.

## Tests

- **Test behaviour, not implementation.** A test that breaks on a refactor that changed no
  behaviour is testing the wrong thing.
- **Properties for maths, examples for stories.** Geometry and domain get property tests
  (`docs/testing.md` §3); the edge-case corpus (§4) is not optional.
- **Deterministic.** Inject the clock and entropy; no sleeps, no order dependence, no system fonts.
  A flaky test is a bug in the test or the code — find which; never retry it into green.
- **One reason to fail.** A failing test's name and message should say what broke without a
  debugger.

## Changes and review

- **One objective per change**, plus the bugs and clear gaps found in the same area. Unrelated
  clean-up goes in its own pull request.
- **Leave it working.** Every commit builds and passes `pnpm check`; a slice ends demonstrable.
- **Refactor and change behaviour in separate commits**, so each can be reviewed and reverted alone.
- **Evidence over assertion.** "Done" means the command ran and its output says so; "fixed" means a
  test failed before and passes now. Say plainly what was not verified.
- **Review for what the code will cost to keep**: correctness first, then whether anything can be
  deleted, then whether the next reader will understand it without the author.
