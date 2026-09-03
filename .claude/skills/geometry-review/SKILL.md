---
name: geometry-review
description: Use when reviewing or completing any change under packages/geometry, packages/core, or packages/domain — the pure layers where a wrong answer is invisible. Walks the definition-of-done from docs/geometry.md §12 and the edge-case corpus from docs/testing.md §4.
---

# Geometry review

A bug in a panel layout is visible and cheap. A bug in `offsetPath` is invisible and ruins leather.
This checklist exists because the failure mode in this codebase is *plausible-but-wrong* — code that
looks right, passes its examples, and is off by 0.3 mm on a shape nobody tried.

Work through every section. Report findings as a list; say explicitly which items pass.

## 1. Purity

- [ ] Imports nothing outside `@leathercad/core` and its own package.
- [ ] No DOM, canvas, colour, stroke width, DPI, or device pixel ratio.
- [ ] No filesystem, network, or Node built-in (`pnpm depcruise` enforces this — run it).
- [ ] No `Math.random()`, no `Date.now()`, no ambient state. Same input, same output, always.
- [ ] No identifier named for pixels. Millimetres are the only unit here.

## 2. Numerics

- [ ] No `===`, `!==`, `<`, `>` between values that could be equal floats. Use `approxEq`.
- [ ] Epsilons come from `@leathercad/core`. **No locally defined epsilon**, not even inline.
- [ ] The right epsilon for the quantity: `EPS_POINT` for mm distances, `EPS_PARAM` for `t`,
      `EPS_ANGLE` for radians, `EPS_AREA` for areas.
- [ ] Comparisons prefer squared lengths where a square root would only be discarded.
- [ ] Public entry points reject `NaN` and `Infinity` rather than propagating them. A single NaN
      blanks a canvas and produces an unopenable file; catching it at the boundary turns a mystery
      into a message.

## 3. Degenerate input

Every one of these needs either a handled case or an explicit documented precondition. Name the ones
that apply and confirm each is covered by a test:

- [ ] Zero-length segment; two identical consecutive points
- [ ] Cubic with all four control points coincident; collinear controls; a cusp
- [ ] Arc with zero radius, zero sweep, exactly 180°, exactly 360°
- [ ] Empty path; single-segment path; closed path of one segment
- [ ] Collinear and near-collinear points (1e-9 rad apart)
- [ ] Nearly-parallel lines, where the determinant approaches zero
- [ ] Geometry spanning 0.1 mm to 2000 mm in the same call
- [ ] For offsets: distance ≥ the inradius (shape vanishes), and a distance that splits the shape
- [ ] For distribution: pitch longer than the path; length an exact multiple of pitch; an exact
      half-multiple (the `fit-whole` rounding tie)

## 4. Tests

- [ ] At least one **property** test, not only examples. Examples confirm what you thought of;
      properties catch what you did not.
- [ ] The properties actually constrain the result. "Returns an array of the right length" is not a
      property. Check the catalogue in `docs/testing.md` §3.2 for the ones that apply.
- [ ] Any counterexample fast-check shrank to has been committed as a named regression test.
- [ ] Golden fixtures updated **deliberately** — if committed output changed, the diff was read and
      the reason is in the commit message. An unexplained golden diff is a silent behaviour change.
- [ ] Tests assert on values, not on the shape of the implementation.

## 5. Contract

- [ ] The doc comment states behaviour on degenerate input, not just the happy path.
- [ ] The return type admits reality. `offsetPath` returns `Path[]` because an offset can produce
      zero or several paths; a signature that cannot express failure forces a lie.
- [ ] Units and the coordinate convention are unambiguous: millimetres, radians, **Y-up**.
- [ ] Tolerance is a parameter where the caller could reasonably need a different one.

## 6. Finish

Run and report the actual output:

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check
```

Do not claim any of this passes without having run it.
