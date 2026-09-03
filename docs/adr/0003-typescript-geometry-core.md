# 3. TypeScript geometry core, not Rust

**Status:** Accepted
**Date:** 2026-09-03

## Context

The geometry engine is the heart of the application and the part where correctness matters most.
Rust is the conventional choice for numerically-intensive geometry, and pairs naturally with Tauri.

## Decision

Write the geometry engine in TypeScript, as a pure package with no runtime dependencies beyond
`@leathercad/core` and (behind one file) a Clipper binding.

Reasoning:

1. **The workload is small.** A complex bag is perhaps 40 parts, a few hundred curves, and a few
   thousand stitch holes — three or four orders of magnitude below where JavaScript's numeric
   performance becomes limiting.
2. **Precision is identical.** V8 numbers are IEEE-754 doubles, the same as Rust's `f64`. There is
   no accuracy argument for Rust here.
3. **A language boundary would hurt where it matters most.** Every geometry call would cross an
   async IPC or WASM boundary with serialisation. Live tool preview — recomputing an offset on every
   pointer move — is exactly the workload that punishes.
4. **One language** means one toolchain, one test runner, one debugger, and property tests that run
   in milliseconds.

## Consequences

- A lower performance ceiling than Rust. Accepted, and guarded by a benchmark suite with a committed
  baseline so regressions are caught rather than discovered.
- The team (of one) can hold the whole engine in context.

## Reversibility

Preserved by design. `packages/geometry` exposes pure functions taking plain data with no internal
state, so any single function can be replaced by a WASM implementation behind an identical
signature. The existing property tests become the conformance suite for the replacement.

The realistic candidates for that treatment, if ever needed, are boolean operations on complex
nested contours and auto-nesting — not the everyday offsetting path.

## Alternatives rejected

- **Rust core via Tauri commands.** Async boundary on every call; incompatible with live preview.
- **Rust core compiled to WASM.** Synchronous, so live preview would work, but adds a second
  toolchain and a serialisation layer for a workload that does not need it. This is the option to
  revisit first if profiling ever justifies it.
