# Testing Strategy

**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. Why this document is long

Most of this application is arithmetic whose output the user cannot check by looking. An offset that
is 0.3 mm wrong looks perfectly reasonable on screen and ruins a piece of leather. A stitch line
that comes out 2 % short produces a pattern whose two halves do not match, discovered after cutting.

So the testing effort is deliberately unbalanced: **`geometry` and `domain` get exhaustive testing;
the UI gets smoke tests.** A bug in a panel layout is visible and cheap. A bug in `offsetPath` is
invisible and expensive.

## 2. The layers

| Layer | Tool | Count (rough) | Runtime | What it protects |
|---|---|---|---|---|
| Unit — geometry, domain | Vitest | ~600 | < 5 s | Arithmetic correctness |
| Property-based | Vitest + fast-check | ~50 | < 20 s | Correctness across inputs nobody thought of |
| Golden / approval | Vitest + JSON fixtures | ~40 | < 2 s | Unintended algorithm drift |
| Document & command | Vitest | ~80 | < 3 s | Undo, evaluation, serialisation |
| Export accuracy | Vitest + pdfjs-dist | ~40 | < 10 s | The 1:1 promise |
| Rendering (SVG snapshot) | Vitest | ~30 | < 3 s | What is drawn |
| Rendering (pixel diff) | Playwright + pixelmatch | ~12 | ~60 s | Anti-aliasing, hairlines, grid |
| E2E | Playwright + Electron | ~4 | ~90 s | The app actually runs |
| Benchmarks | Vitest bench | ~8 | ~30 s | Accidental O(n²) |

`pnpm test` runs everything except the pixel-diff and E2E layers, in under a minute. Those two run
in CI and on demand — fast enough to run on every save is what makes tests actually get run.

## 3. Property-based testing

The highest-value technique for this codebase, because geometry has genuine mathematical invariants
and the interesting failures come from inputs a human would not write down: a nearly-degenerate
cubic, two almost-parallel lines, an arc sweeping 359.9999°.

### 3.1 Generators

Build a shared `packages/geometry/test/arbitraries.ts` once and reuse it everywhere:

```ts
arbFiniteMm          // finite doubles in [-2000, 2000], biased toward small values and exact ints
arbVec2
arbLineSegment       // never zero-length
arbArc               // includes 0°, 180°, 360°, and tiny sweeps
arbCubic             // includes degenerate: collinear controls, cusps, all-coincident
arbSimplePolygon     // non-self-intersecting, both windings
arbConvexPolygon
arbClosedPath        // mixed segment kinds
arbOpenPath
arbRigidTransform    // rotation + translation only
arbProject           // whole documents, for round-trip and undo properties
```

Bias matters. Uniform random doubles almost never produce the coincident points, right angles, and
round numbers that real user input is full of, and those are exactly where epsilon bugs live. Mix
uniform values with a pool of "interesting" ones: 0, ±1, ±0.1, ±100, and values differing by
`EPS_POINT`.

### 3.2 The property catalogue

**Vectors and transforms**
- `apply(invert(m), apply(m, p)) ≈ p` for invertible `m`
- `compose(a, b)` applied equals `a` applied then `b` applied
- Rigid transforms preserve distances between points and path length
- `mirrorAbout(axis)` applied twice is the identity

**Paths**
- `length(reverse(p)) ≈ length(p)`
- `length(transform(p, rigid)) ≈ length(p)`
- `bbox(p)` contains every flattened point, **and is tight** — some point touches each of the four
  sides within tolerance. Tightness is the half that catches control-hull bugs.
- Splitting at any `t` produces two paths whose lengths sum to the original
- `signedArea(reverse(p)) ≈ -signedArea(p)` for closed `p`
- Every point of a closed path is inside or on it (`containsPoint` agrees with `winding`)

**Flattening**
- Every flattened vertex lies within `tolerance` of the true curve
- Flattening is deterministic: identical input yields bitwise-identical output
- Tighter tolerance never produces fewer points
- Flattened length underestimates true length and converges as tolerance shrinks

**Arc length**
- `pointAtDistance(0)` is the start; `pointAtDistance(totalLength)` is the end
- `distance(pointAtDistance(d1), pointAtDistance(d2)) ≤ |d2 − d1|` — a chord is never longer than
  its arc
- `pointAtDistance` is monotonic in `d` along the path

**Offsetting** — the most important group
- Every point on `offsetPath(p, d)` is at distance `≈ |d|` from `p`, and never *closer* than
  `|d| − tolerance`. (Closest-distance, not per-point correspondence — offsetting changes
  parameterisation.)
- For a convex closed path, `offsetPath(offsetPath(p, d), −d) ≈ p`
- Offsetting a convex closed path outward strictly increases its area; inward strictly decreases it
- An inward offset larger than the inradius returns an empty array — it does not throw and does not
  return garbage
- Offset preserves closedness
- `offsetPath(p, 0)` is `p`

**Boolean operations**
- `area(A ∪ B) + area(A ∩ B) ≈ area(A) + area(B)`
- `A ∪ A ≈ A`, `A ∩ A ≈ A`, `A − A` is empty
- Union and intersection are commutative

**Stitch distribution**
- All holes lie on the source path within tolerance
- Consecutive spacings sum to the usable path length
- Under `fit-whole`, every spacing equals `actualPitch` within `EPS_LENGTH`
- Under `fit-whole` on a closed path, `holeCount === intervalCount` — the last hole never lands on
  the first
- `actualPitch` is within one interval's worth of nominal pitch
- Hole count is monotonically non-increasing as pitch increases

**Document and commands**
- **`undo(apply(cmd, doc))` deep-equals `doc`, for every command and every generated document.**
  One property test that covers every command that will ever be written. Write it in the first
  document slice and never delete it.
- `redo(undo(apply(cmd, doc)))` deep-equals `apply(cmd, doc)`
- Applying a command never mutates the input document (frozen-input check in tests)
- Evaluation is deterministic and free of side effects
- Evaluating twice yields identical results; evaluating after a no-op command yields identical
  results

**Serialisation**
- `parse(serialise(doc))` deep-equals `doc`
- `serialise(parse(serialise(doc)))` is byte-identical to `serialise(doc)`
- Evaluating a document, saving, loading, and re-evaluating produces geometry identical within
  `EPS_POINT` — this is what proves that not persisting derived geometry is safe

### 3.3 Discipline

- Every failing case fast-check shrinks to gets **committed as a named regression test**. The
  property stays; the specific case becomes permanent.
- Seeds are fixed in CI so failures reproduce. Local runs may use random seeds to find new cases.
- `numRuns` at 100 by default, 1000 for offsetting and distribution, and a nightly CI job at 10 000.

## 4. Edge-case corpus

Property tests find unknown unknowns. This is the list of *known* hazards, each with an explicit,
named test. It is a living checklist; the `geometry-review` skill walks it.

**Degenerate geometry**
- Zero-length line segment
- Two identical consecutive points in a polyline
- Cubic with all four control points coincident
- Cubic with collinear control points (it is a line)
- Cubic with a cusp (`p1` and `p2` crossing)
- Arc with zero radius; arc with zero sweep; arc with exactly 360° sweep
- Arc with sweep of exactly 180° (the ambiguous case for endpoint parameterisation)
- Path with a single segment; empty path; closed path of one segment

**Numeric hazards**
- Collinear points; near-collinear at 1e-9 rad
- Nearly-parallel lines (determinant approaching zero)
- Tangent circles — exactly one intersection, numerically fragile
- Coordinates spanning 0.1 mm to 2000 mm in the same path
- Values differing by exactly `EPS_POINT`, and by slightly less
- `NaN` and `Infinity` at every public entry point

**Offset hazards**
- Inward offset equal to the inradius (the shape collapses to a point)
- Inward offset that splits a waisted shape into two pieces
- Offset of a shape with a concave corner sharper than the offset distance
- Offset with `miterLimit` exceeded
- Offset of an open path (produces one path, not a closed loop)
- Offset of a self-intersecting input

**Stitch distribution hazards**
- Pitch larger than the path length
- Path length an exact integer multiple of pitch
- Path length an exact half-multiple (the rounding tie in `fit-whole`)
- `startOffset + endOffset` exceeding the path length
- A corner run shorter than one pitch under `hole-at-corner`
- A path with 500 corners under `hole-at-corner`

**Domain hazards**
- Derivation chain 10 deep
- A cycle attempted (must be rejected at command time)
- Deleting a feature with three dependents (the bake behaviour)
- A part with no outer contour; with two outer contours
- An inner contour lying outside its outer contour

**Format hazards**
- Truncated ZIP; missing `document.json`; malformed JSON; wrong mimetype
- `formatVersion` above current; equal to zero; negative; not a number
- A dangling `fromId`
- Unicode in part names, including RTL text and emoji
- A 5 MB document with 40 parts

## 5. Rendering tests

### 5.1 SVG snapshots — the primary mechanism

The renderer produces a `DisplayList` consumed by both a Canvas2D backend and an SVG backend
([architecture.md](architecture.md) §3). That makes the SVG string a faithful, *textual* proxy for
what the canvas draws.

```ts
const scene = buildDisplayList(evaluate(fixture), style, viewport);
expect(renderToSvgString(scene)).toMatchSnapshot();
```

Deterministic, diffable in a code review, no image tooling, no platform variance, milliseconds to
run. A changed number in a snapshot diff tells you exactly what moved — which a pixel diff never
does. **This should be where most rendering coverage lives.**

### 5.2 Pixel diffs — the narrow remainder

Reserved for genuinely raster concerns: anti-aliasing quality, hairline crispness, grid moiré,
device-pixel-ratio handling, text rendering. Playwright drives Electron, screenshots the canvas, and
`pixelmatch` compares.

Kept small (about a dozen scenes) because it is by far the highest-maintenance layer. Determinism
requires: DPR pinned to 1, animations disabled, **vendored fonts** rather than system fonts, a fixed
window size, and a fixed CI container image. Without all five, this suite produces false failures
until someone deletes it.

### 5.3 Interaction tests without a canvas

Snapping, hit testing, tool state machines, and the viewport are pure logic and are tested as such —
synthesised pointer events into a tool, assertions on the commands it dispatched. No DOM, no
rendering, milliseconds. Reaching for Playwright to test snapping would be a design smell: it would
mean the logic is entangled with the canvas.

## 6. Export and print accuracy tests

The tests that most directly protect the product's promise.

```ts
it('exports a 100 × 50 mm rectangle at exactly 1:1', async () => {
  const pdf   = await exportPdf(rectFixture(100, 50), { paper: 'A4', mode: 'fit-single-page' });
  const paths = await extractVectorPaths(pdf);          // pdfjs-dist
  const bbox  = boundsOf(paths).map(pt => pt * 25.4 / 72);
  expect(bbox.width ).toBeCloseTo(100, 2);              // within 0.01 mm
  expect(bbox.height).toBeCloseTo( 50, 2);
});
```

The full obligation list lives in [printing.md](printing.md) §14. The ones worth restating as
principles:

- **Parse the output back.** Do not assert on the code that generated it; assert on the artefact. A
  test that checks "we called `drawLine` with 100" proves nothing about the file.
- **Assert the absence of scaling**, not just the presence of correct numbers — scan the content
  stream for `cm` operators with non-unit scale factors.
- **Test pagination as pure arithmetic**, exhaustively: coverage with no gaps, exact overlap
  widths, correct page counts, centred grids, and the degenerate cases (content smaller than a page,
  overlap wider than the content area).
- **Assert that the preview and the print use the same pagination** by deep-equality on the
  `Page[]`, so the two can never drift.

The strongest of these checks rasterise the PDF with poppler and measure the result in pixels,
which is stronger than parsing our own numbers back out: it proves the file means what we think,
according to an independent implementation. `pdftoppm` is therefore a soft requirement — absent it,
those tests skip and everything else still runs, so a contributor without poppler is not met with a
wall of failures.

That skip must never happen silently in CI, where a broken install step would delete the strongest
print checks in the suite and still report green. CI sets **`LEATHERCAD_REQUIRE_POPPLER=1`**, which
turns a missing `pdftoppm` into a hard failure. Set it locally to prove the rasterised tests are
really running.

## 7. What is deliberately *not* tested heavily

- React component internals. Tested through the few E2E flows, not in isolation.
- Panel layout and CSS. Visual, cheap to fix, expensive to test.
- Electron main-process plumbing beyond one "the window opens" smoke test.
- Third-party libraries. Test *our* use of Clipper2, not Clipper2.

Coverage policy: **90 % lines and 85 % branches in `geometry` and `domain`, enforced in CI**; no
threshold elsewhere. Branch coverage matters more than line coverage in geometry, because the
untested branches are exactly the degenerate cases. Chasing a global percentage would push effort
toward the parts of the codebase where it is worth the least.

## 8. Determinism requirements

Non-negotiable, because golden tests, snapshots, and byte-stable saves all depend on them:

- **Vendored fonts.** Never a system font, in the app or in tests.
- **Injected clock.** Nothing in a serialisation path calls `Date.now()` directly.
- **Seeded randomness.** ULID generation takes an injectable entropy source; tests use a fixed one.
- **Fixed locale and timezone** in the Vitest config — `en-GB`, `UTC`. Number formatting varies by
  locale and will silently corrupt snapshots otherwise.
- **No `Set`/`Map` iteration order dependence** in output. Sort explicitly before serialising.
- **No floating-point accumulation order dependence.** Summing lengths in a different order gives a
  different last bit; where a sum feeds a comparison, define the order.

## 9. CI

Three jobs, run in parallel on every pull request, so one run reports every failure rather than
only the first:

```
static   pnpm typecheck         # tsc --build across the workspace
         pnpm lint              # eslint, including the custom geometry rules
         pnpm format:check      # prettier; markdown is excluded
         pnpm depcruise         # layering violations — fails the build

test     pnpm test:coverage     # unit, property, golden, export, snapshot,
                                # and the coverage thresholds in one pass
                                # LEATHERCAD_REQUIRE_POPPLER=1

e2e      pnpm test:e2e          # Playwright + Electron, under xvfb
                                # uploads playwright-report/ on failure
```

`pnpm check` runs the `static` and `test` work locally and is what the pre-push hook invokes, so a
green `pnpm check` predicts a green CI for everything but E2E.

Still to come, each with the slice that adds it: `pnpm test:visual` (2.3, pixel diffs in the pinned
container) and `pnpm bench --compare` (1.9, against the committed baseline).

Nightly: property tests at `numRuns: 10000` with a random seed, reporting any new shrunk
counterexample as an issue.

## 10. Test-driven development, concretely

For `geometry` and `domain`, tests come first. Not as ritual — because in this domain the test *is*
the specification, and writing it first is how the specification gets pinned down before an
implementation quietly redefines it.

The loop for a new geometry function:

1. Write the signature and a doc comment stating the contract, including behaviour on degenerate
   input.
2. Write the **property** tests. What must be true of every output?
3. Write the specific **edge cases** from §4 that apply.
4. Implement.
5. Add a **golden** fixture for a representative case, and review the committed output by hand once.
6. Run the `geometry-review` skill's checklist.

For UI work, the order relaxes: write the command and its test first, then wire the interface to it.
The command is the part with a contract; the panel is not.
