# Performance work

How a `PERF-` task from [`docs/performance-backlog.md`](../../docs/performance-backlog.md) is done.
The backlog owns each task's evidence and acceptance; its *Verification and evidence* and
*Protections to preserve* sections are part of these rules. Strengths are as in
`engineering-practices.md`.

- **Never sacrifice accuracy** *(strict)*. Millimetre precision, deterministic geometry, undo and
  redo, and 1:1 printing are kept exactly. No approximation, reduced precision, scaling to fit or
  shorter history to buy speed. Show it unchanged: the existing property, golden, export and print
  tests pass untouched, and an optimisation that changes output proves it is identical — byte for
  byte for a file, pixel for pixel for the screen.
- **Measure before optimising.** Reproduce the problem on current `develop`, not on the audit's
  numbers, with the workload named and kept (`fixtures/perf/`, `tools/perf-*.mjs`). A problem that
  does not reproduce is recorded as such and not fixed.
- **Before and after, in the same metric.** CPU time, retained memory, frame gaps or long tasks —
  whichever the task is about — on the same machine and build, with the method and run counts, in
  the pull request and in the backlog's measurement record.
- **Keep the baseline, and guard it.** The before and after stay in the backlog as the reference.
  Each task adds a check that fails if the problem comes back, run by `pnpm check`: a work bound, a
  retention bound or a count — deterministic, never a tight wall-clock budget, which flakes on CI
  runners. Update `pnpm bench`'s baseline only on the machine that recorded it, and never to hide
  a regression.
- **One pull request per task**, unless two depend on each other so tightly that neither lands
  alone — and then say why. Its title names the PERF ID, and it ticks the task in both the
  backlog's register and the roadmap's release list, which the release gate reads.
- **No rewrites without evidence.** No move to Rust, WebAssembly, WebGL, another renderer or
  framework unless a measurement shows the current design cannot meet the need; the backlog found
  none. Fix the hot path in the code that has it.
- **Retest on every platform the change can behave differently on.** Electron lifecycle (windows,
  tabs, workers, quit), PDF export and printing, and persistence (save, recovery, preferences)
  differ on Windows and macOS: CI's Windows and macOS jobs must be green, and the packaged app is
  checked by hand on each before the release, through `docs/release-checklist.md`. A pull request
  says plainly which platforms it was run on; one not run there is not called verified there.
