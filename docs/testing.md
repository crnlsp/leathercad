# Testing Strategy

**Status:** Implemented — every layer in §2 exists
**Last updated:** 2026-10-07

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
| Golden / approval | Vitest `toMatchFileSnapshot` + JSON fixtures | 8 | < 1 s | Unintended drift in offsetting and hole distribution (§11); the committed `.lcp` format fixtures and the SVG snapshots cover the rest |
| Document & command | Vitest | ~80 | < 3 s | Undo, evaluation, serialisation |
| Export accuracy | Vitest + poppler (`pdftoppm`, `pdfinfo`) | ~40 | < 10 s | The 1:1 promise |
| Rendering (SVG snapshot) | Vitest | ~30 | < 3 s | What is drawn |
| Rendering (pixel diff) | Playwright `toHaveScreenshot`, in the pinned container | ~12 | ~60 s | Anti-aliasing, hairlines, grid |
| E2E | Playwright + Electron, with axe scans | ~320, in 48 specs | ~9 min, ~4 in CI's three shards | The app actually runs, workflow by workflow |
| Packaged smoke | Playwright + the packaged binary | 10 | ~60 s | app origin and denied paths, CSP, asar, fuses, resources |
| Loader fuzzing | Vitest + fast-check | 6 | < 1 s | A damaged `.lcp` refuses with a reason |
| Benchmarks | Vitest 5 `bench` fixture | 22 | ~100 s | Accidental O(n²) |
| Mutation | StrykerJS, weekly | — | hours | Tests that run code without checking it |

`pnpm test` runs everything except the pixel-diff and E2E layers, in under a minute. Those two run
in CI and on demand — fast enough to run on every save is what makes tests actually get run.

## 3. Property-based testing

The highest-value technique for this codebase, because geometry has genuine mathematical invariants
and the interesting failures come from inputs a human would not write down: a nearly-degenerate
cubic, two almost-parallel lines, an arc sweeping 359.9999°.

### 3.1 Generators

The shared generators are in `packages/geometry/test/arbitraries.ts`; reuse them before writing
another. A generator nothing uses is deleted, not kept for later — `pnpm knip` reports one.

```ts
arbCoord                 // what a maker could type: [-2000, 2000] mm, biased to round numbers and 0
arbVec2, arbNonZeroVec2
arbAngle
arbScaleFactor           // keeps a matrix comfortably invertible
arbRigidTransform        // rotation, translation and mirroring — no scaling
arbRadius                // positive, not vanishingly small
arbSweep                 // includes the full turn and both half turns
arbLineSegment, arbArcSegment, arbCubicSegment, arbSegment
arbNonDegenerateSegment  // real extent, for properties a degenerate one cannot satisfy
arbOpenPath, arbClosedPath
arbPitch                 // the pitches irons come in, plus awkward ones
```

There is no shared whole-document generator. The undo properties run a generated sequence of
commands (`commandArb` in `packages/document/src/store.test.ts`) over a small document; the
reference graph's properties build projects of their own (`arbProject` in
`packages/domain/src/graph.test.ts`); and the loader is fuzzed by
`packages/persist/src/lcp.fuzz.test.ts`.

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
- A cubic along a line measures the distance it travels, turns and all — the speed kinks where it
  turns back, which once fooled the quadrature (issue 27)

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
- Under `fit-whole`, consecutive spacings sum to the usable path length. Not under `exact-pitch`,
  where the leftover at the end is the whole point of the mode
- Under `fit-whole`, every spacing equals `actualPitch` within `EPS_LENGTH`
- Under `fit-whole` on a closed path, `holeCount === intervalCount` — the last hole never lands on
  the first
- `actualPitch` is within one interval's worth of nominal pitch — precisely, the achieved and
  nominal interval counts differ by at most a half. Holds once the run is at least half a pitch
  long; below that the clamp to a single interval deviates further, deliberately
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
  The nightly job picks a random seed and prints it. `LEATHERCAD_FC_RUNS` and `LEATHERCAD_FC_SEED`
  reproduce any run anywhere (`vitest.setup.ts`). A failure opens or updates an issue labelled
  `nightly-property`.

### 3.4 Mutation testing

Coverage proves a line ran. It does not prove that any test would notice if the line were wrong,
and in geometry that is the whole question. StrykerJS mutates `geometry` and `domain`, turning `<`
into `<=` and `+` into `-`, emptying a return, and re-runs the tests that cover each mutant. A
mutant that survives marks an assertion nobody wrote.

`pnpm test:mutation:geometry` and `pnpm test:mutation:domain` run one package each, from inside the
package, so each uses its own Vitest config. They are slow, so CI runs them weekly and keeps the
HTML report as an artifact. There is no break threshold yet: the first full report sets the one to
hold. On Vitest 5 the runner needs the local patch described in ADR 0016. Without it every mutant
survives and the score measures the setup, not the tests.

Stryker's first run instruments every line and runs the suite in one thread. There the thousand-run
properties outlast the 30 s a test has in `pnpm test`, so `stryker.config.mjs` gives each test ten
minutes through `LEATHERCAD_TEST_TIMEOUT`, which `vitest.setup.ts` reads. Without it the geometry
run stopped at that first run, before testing a single mutant, both of the first two weeks.

A whole geometry run then lasts longer than a CI job may. Measured on four cores, as CI's runner
has, the first two thousand mutants take about half an hour. The remaining fourteen hundred take
hours more: the ones that survive or hang re-run minutes of instrumented thousand-run properties
each. So `weekly.yml` stops Stryker after three and a half hours and keeps what it has tested, and
the next run carries on from there. The first full report takes a few weeks to build; after it, a
run tests only what has changed. Stopped by SIGTERM to its own process, Stryker saves a partial
incremental file and restores the files it mutated in place. A signal to its whole process group
once left it hung, with nothing saved.

## 4. Edge-case corpus

Property tests find unknown unknowns. This is the list of *known* hazards, each with an explicit,
named test. It is a living checklist; the `geometry-review` skill walks it.

**Degenerate geometry**
- Zero-length line segment
- Two identical consecutive points in a polyline
- Cubic with all four control points coincident
- Cubic with collinear control points (it is a line)
- Cubic with a cusp (`p1` and `p2` crossing) — the tangent there is the *outgoing* direction, and
  is deliberately not antisymmetric under `reverse`; see [geometry.md](geometry.md) §4.3
- Cubic whose first two or last two control points coincide — the derivative vanishes at the
  endpoint and the fallback has to pick a sign, which unit-length assertions cannot see. Test
  *just short of* the end too, log-uniformly down to 1e-15: the derivative is non-zero there but
  too short to normalise, and that window is where a fix keyed on distance from `t = 1` failed
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
device-pixel-ratio handling, text rendering. Playwright drives Electron, screenshots the window or
the canvas, and compares with `toHaveScreenshot` (`e2e/visual/`, `playwright.visual.config.ts`).

`pnpm test:visual` runs it inside the official Playwright image at the version in the lockfile
(`tools/visual.mjs`), on a laptop and in CI alike, and it needs `pnpm build` first.
`pnpm test:visual --update-snapshots` rewrites the references; look at every changed image before
committing it. The version string and the cursor readout are masked, because they change for
reasons that are not regressions.

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
it('prints the 100 × 5 mm gauge at 100 × 5 mm', async () => {
  const pdf    = await exportPdf(planFor(project), options);
  const pixels = rasterise(pdf, { dpi: 254 });          // poppler's pdftoppm: 10 px per mm
  const widthMm = measureGauge(pixels).width / 10;     // outer edge to outer edge
  expect(widthMm).toBeGreaterThan(99.8);                // 100 mm, plus up to the stroke
  expect(widthMm).toBeLessThan(100.4);
});
```

(A sketch of `packages/export/src/pdf/writer.test.ts`, which measures poppler's rendering of the
real file. An independent renderer is a stronger witness than parsing our own numbers back.)

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
- **Read an SVG or a DXF back by hand.** They are text, and a parser for either would be a
  dependency and an ADR for a few dozen lines a test can own. The unit tests parse the writer's
  output and compare it with the model, as a property over random curves; the end-to-end test
  exports the print test through the app and measures the file with a reader of its own that
  shares nothing with the writer (`e2e/vectorFiles.ts`). The files are written with one line
  ending each (`\n` for SVG, `\r\n` for DXF), and a test holds it, so the cross-platform job sees
  the same bytes.

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
- Third-party libraries. Test *our* use of pdf-lib, not pdf-lib.

Coverage policy: **90 % lines and 85 % branches in `geometry` and `domain`, enforced in CI**; no
threshold elsewhere. Branch coverage matters more than line coverage in geometry, because the
untested branches are exactly the degenerate cases. Chasing a global percentage would push effort
toward the parts of the codebase where it is worth the least.

## 8. Determinism requirements

Non-negotiable, because golden tests, snapshots, and byte-stable saves all depend on them:

- **Vendored fonts.** Never a system font, in the app or in tests. Since 4.11a the glyph outlines
  themselves are committed (`packages/typography/src/generated/`), so text geometry is identical on
  every machine even if no font is installed at all.
- **Injected clock.** Nothing in a serialisation path calls `Date.now()` directly.
- **Seeded randomness.** ULID generation takes an injectable entropy source; tests use a fixed one.
- **Fixed locale and timezone** in the Vitest config — `en-GB`, `UTC`. Number formatting varies by
  locale and will silently corrupt snapshots otherwise.
- **No `Set`/`Map` iteration order dependence** in output. Sort explicitly before serialising.
- **No floating-point accumulation order dependence.** Summing lengths in a different order gives a
  different last bit; where a sum feeds a comparison, define the order.

## 9. CI

Jobs run in parallel, so one run reports every failure rather than only the first. A pull request
runs only the jobs its change can break. The first job, `changes`, sorts the changed files into
kinds with `tools/ci/changes.mjs`, which holds the table and the tests for it. A renamed file
counts by its old path too, and a path that is not certainly documentation counts as code:

| Kind | Paths |
|---|---|
| `docs` | `docs/**` (except `docs/domain-model.md` and this file, which tests read), `packaging/aur/**`, `*.md` outside `.claude/` and `apps/` |
| `workflows` | `.github/**` |
| `deps` | `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/**`, any `package.json`, `osv-scanner.toml`, `.node-version` |
| `packaging` | `apps/desktop/electron-builder.config.mjs`, `apps/desktop/build/**`, `apps/desktop/src/main/**`, `assets/fonts/**` |
| `code` | everything else |

| Job | Runs for |
|---|---|
| `static` | every change |
| `test`, `cross-platform`, `e2e`, `visual`, Linux's `installers` leg | `code`, `packaging`, `deps`, `workflows` |
| Windows's and macOS's `installers` legs, and the Flatpak | `packaging`, `deps`, `workflows` |
| `dependencies` | `deps`; `nightly.yml` scans `develop` every night |
| `workflows` | `workflows` |

A push to `develop` runs everything, and nothing runs on a push to `main`, which gets only what
`develop` tested. CodeQL skips a pull request that changes documentation alone. The jobs:

```
static   pnpm typecheck         # tsc --build across the workspace
         pnpm lint              # eslint, including the custom geometry rules
         pnpm format:check      # prettier; markdown is excluded
         pnpm depcruise         # layering violations — fails the build

test     pnpm test:coverage     # unit, property, golden, export, snapshot,
                                # and the coverage thresholds in one pass
                                # LEATHERCAD_REQUIRE_POPPLER=1
         pnpm test:perf         # domain/perf.test.ts alone, serial, uninstrumented

cross-platform  pnpm test       # the unit tests on Windows and macOS, where the
                                # rasterised print checks skip without poppler

e2e      pnpm build             # Playwright + Electron, under xvfb, incl. the axe scan,
         playwright test        # in three shards of whole files, one worker each;
           --shard=N/3          # e2e-report merges the failed shards' blobs into
                                # one playwright-report/

visual   pnpm test:visual       # pixel diffs in the pinned container

workflows     actionlint, zizmor   # workflow syntax, injection, pinning
dependencies  osv-scanner          # the lockfile against known vulnerabilities

installers    installers.yml       # the packaged smoke test and every installer,
                                   # on Linux, Windows and macOS
```

`static` also runs `pnpm knip` and `pnpm test:tools`, the tests of the CI scripts in `tools/ci/`. Every action is pinned to a commit; zizmor fails the run on one that
is not.

`installers` calls `installers.yml` on Linux, Windows and macOS: `pnpm test:packaged`, the smoke
test of the packaged binary, then `pnpm package` — the AppImage, the Flatpak, the `.deb` and the SBOM on Linux,
the NSIS installer, the universal dmg — uploaded as `installers-<OS>`. The release builds its files
with the same workflow, from its tag. On a pull request whose change cannot differ between the
platforms, it runs Linux's leg alone, without the Flatpak (its `everywhere` input).

On Linux the smoke test runs twice: against the unpacked app, and against a sibling `.deb` that
apt installs (`LEATHERCAD_PACKAGED_EXECUTABLE=/opt/LeatherCAD/leathercad`), with Chromium's sandbox
on, which Playwright otherwise switches off. A removal then checks that the menu entry, the
command and the AppArmor profile are gone.

A last job, *Ready to merge*, waits for every other and passes only when each one passed or was
skipped, so a job the change did not need passes it; a cancelled run fails it. It is the one check the rulesets require from CI, beside
*Conventional title* on `develop` and *Release gate* on `main`, so a job added to CI goes in its
`needs` and the rulesets stay as they are.

`pnpm check` runs the `static` and `test` work locally — including `test:coverage`, not plain
`test` — and is what the pre-push hook invokes, so a green `pnpm check` predicts a green CI for
everything but E2E. It runs the coverage build deliberately: slice 1.8 shipped a property test that
passed uninstrumented and timed out under coverage in CI, which is precisely the divergence this
closes.

The one exception is `packages/domain/src/perf.test.ts`, which asserts wall-clock ceilings.
Instrumented and sharing the machine with every other file, it measured 25–35 % over them on GitHub
runners, so `test:coverage` excludes it and `test:perf` runs it afterwards, alone, serially and
without coverage — in CI and in `pnpm check` alike. `pnpm test` still runs it with everything else.

Nightly (`nightly.yml`): property tests at `numRuns: 10000` with a random, printed seed; the E2E
suite on Windows and macOS, which a pull request runs on Linux only; the known-vulnerability scan;
and the benchmarks, uploaded as a trend. E2E and the benchmarks run only when they have not passed
at that commit already, so a night `develop` did not move skips them; the property tests and the
scan always run, because a fresh seed or a new advisory can fail them without a commit. Both E2E
runners' screens start at 1024 × 768, and Windows and macOS fit a window into its screen, so the
job sets them to 1920 × 1080 first (`tools/ci/full-hd-display.swift` on macOS). Each job
reports to an issue of its own (labels `nightly-property`, `nightly-e2e-windows`,
`nightly-e2e-macos`, `nightly-vulnerabilities`): a failure opens it, or comments on the open one,
and the first run that passes closes it. Weekly (`weekly.yml`): mutation testing of `geometry` and
`domain`, reporting a failure as an issue too. CodeQL runs on every pull request and push, and
OpenSSF Scorecard on `main`; both skipped themselves while the repository was private.

GitHub runs a schedule from the workflow file on the default branch, `main`, which holds the last
release, while the code is being written on `develop`. The two schedules handle that differently:

- **The nightly schedule starts `nightly.yml` again on `develop`** and does nothing else, so the
  night runs `develop`'s copy of the file at `develop`'s commit, and a change to it takes effect the
  night after it merges. Only a run on `develop` opens or closes issues; a run started by hand on
  another branch (*Actions* → *Nightly* → *Run workflow*) is watched by whoever started it.
- **The weekly job checks out `develop` itself.** A change to `weekly.yml` takes effect on schedule
  once it reaches `main`, with the next release. Until then, run it by hand on `develop`, which uses
  `develop`'s copy of the file.
- **A failure names its commit,** because `develop` moves on: the nightly issue gives the commit and
  the seed, which together reproduce it anywhere.

### 9.1 Benchmarks and timing

`pnpm bench` runs the benchmarks. `pnpm bench:compare` sets each against the baseline committed
under `packages/*/bench/`, and `pnpm bench:baseline` rewrites it. A baseline compares only on the
machine that recorded it; the committed ones are all from the maintainer's, an AMD Ryzen 5 7600X
on Linux. A baseline is re-recorded when its workload changed, never to hide a regression, and the
commit that re-records one changes its row here:

| Baselines | Recorded at | Node | Vitest | Why |
|---|---|---|---|---|
| `domain/evaluate-strap`, `domain/evaluate-traced`, `domain/diagnose-strap`, `domain/diagnose-strap-slots`, `domain/diagnose-traced`, `geometry/offset-strap`, `geometry/offset-traced`, `geometry/measure-build`, `geometry/measure-3000`, `export/export-scene`, `persist/save`, `persist/open` | `68c2709`, 2026-09-23 | 22 (pinned 22.23.2; the run's own not recorded) | 5.0.0 | The first baselines |
| `export/pdf`, `export/display-list` | `199cb50`, 2026-10-26 | 22.23.3 | 5.0.4 | Their workloads had changed since `68c2709` (PERF-017) |
| `export/svg`, `export/dxf` | `80afa43`, 2026-10-26 | 24.22.0 | 5.0.5 | The writers that ship, not the render backend (Q40) |
| `editor/snap-drag-traced-250`, `editor/snap-drag-traced-500`, `editor/snap-drag-traced-1000`, `editor/snap-drag-beside-traced` | PERF-004's fix, `e845ffa`, 2026-10-28 | 24.22.0 | 5.0.5 | New with PERF-004 |
| `geometry/self-traced-1000`, `geometry/self-star-1002` | PERF-006's fix, 2026-11-01 | 24.22.1 | 5.0.5 | New with PERF-006 |

`apps/desktop/src/bench-discovery.test.ts` fails if a baseline has no row here, or a row names
one that is not committed. `domain/diagnose-strap-slots` compared 1.3–1.4× its baseline, and was
kept: a regression, not a new workload. Since 3.9c (`2f1132a`) a hole's distance to a round slot
is found through the nearest point on the arc rather than radially. Since
[PERF-005](performance-backlog.md#perf-005) a hole is measured only against the edges that can be
nearest it, and the case compares 0.52×.

Benchmark discovery is pinned: each package that has benchmarks sets
`benchmark.include: ['src/**/*.bench.ts']`, because `tsc --build` emits `dist/src/*.bench.js` and
Vitest's default glob would run every case twice (44, not 22). `bench-discovery.test.ts` asks
Vitest itself, set up as `vitest bench` sets it up, in a process of its own, and fails if the run
would not be the committed `src/*.bench.ts` files each once, if any bench project's globs would
take a generated `dist/` copy — asked of the globs, so it holds on a runner with no `dist/` — or if
a package's collected cases are fewer or more than its committed baselines. Vitest warns that the benchmarks "accessed module export getters too many
times": the benchmarks import source through Vitest's module runner, whose export getters add
overhead. The committed baselines were recorded the same way, so a comparison is like for like; the
absolute numbers are not what a bundled production build costs, and the warning is left visible
rather than suppressed. `perf.test.ts` asserts upper ceilings only, never that something is slow.

The benchmarks run the sources through Vitest's module runner, which the app does not have.
`node tools/perf-compute.mjs` times the same computations as the app runs them: it bundles the
sources with the Vite that builds the renderer, runs the bundle in plain Node, and gives the
median and range of 20 runs, after 3 to warm up, for each of the audit's workloads (the sample
wallet, the strap, with and without its 20 slots, traced outlines of 250, 500 and 1,000 points,
bags of 30, 40 and 50 parts) four ways: fresh evaluation, fresh diagnosis, diagnosis after a
rename, and the snap index. It prints the commit, Node and V8, the processor and the load first,
since the numbers mean nothing without them. `--root <tree>` measures another checkout with the
same bundler, so a before and an after can be run turn about, A, B, A, B, on a machine doing
other work. On 2026-11-01 a bundled fresh diagnosis of the 500-point outline took 23 ms, where the
benchmark's took about 150 ms.

The [performance backlog](performance-backlog.md) records the 2026-10-25 audit's environment,
workloads and measurements, plus implementation acceptance criteria. Its
[verification plan](performance-backlog.md#verification-and-evidence) distinguishes reliable CI
checks from controlled-machine trends.

What the Sheets view costs to draw is a controlled-machine trend: `node tools/perf-sheets.mjs time`
times the drawing callbacks of the real app on the 33-sheet strap, and `pixels` fingerprints the
canvas at every step of a pan, to show a change moved no pixel. Both need `pnpm build` first.
`node tools/perf-design.mjs` does the same for the Design board (PERF-008): `time` gives each
painted frame's script time and its canvas draw calls — `stroke`, `fill`, `fillText`, a count
whatever the machine — hovering and panning with the project framed and at 100 %, and `pixels`
fingerprints the board along pans at three zooms, hovering and clicking; `--project` names the
project, by default the strap, and `fixtures/perf/bag-50.lcp` is the audit's fifty-part bag;
`--app` points it at another checkout's build. `designContent.test.ts` keeps it in `pnpm test` by
counts: sixty hover frames build the pattern once, and at 100 % on the bag a frame draws no more
than eight of the fifty straps' items. `node tools/perf-drag.mjs` likewise times a piece and a guide dragged across a traced outline
(`fixtures/perf/traced-<n>.lcp`), p50, p95 and long tasks (PERF-004).
`node tools/perf-save.mjs` times the window's longest stop while the path-heavy project
(`fixtures/perf/traced-40x500.lcp`) is saved and its recovery copy written, with `--app` for
another checkout's build (PERF-009); under Xvfb, in the Playwright container, as the next one.
`node tools/perf-retention.mjs` reads the renderer's heap after a full collection with the strap
open, edited, reloaded and closed, and whether the project left behind is still reachable
(PERF-010); `--app` points it at another checkout's build. Run it under Xvfb, in the Playwright
container: a window the desktop covers draws nothing, and the run stalls. Heap bytes after a
collection do not move with load, so this one is a figure, not a trend. What keeps it is
collecting through `WeakRef`s in `pnpm test` (`sheets.test.ts`, `tool.test.ts`), and
`e2e/retention.spec.ts`, which reads the same heap over the debugging protocol in the E2E suite
and bounds it by half of what the run's own Sheets pages measured. `node tools/perf-folds.mjs`
counts the pieces Parts holds folded as wallets open, fold and close (PERF-016), in the same
container; `e2e/parts-tree.spec.ts` keeps it, counting the pieces shown folded in a project that
folded none.

What React renders is counted, not timed: `e2e/renderCount.ts` installs the hook React reports
each commit to, as React DevTools does, and counts the components that rendered.
`node tools/perf-pointer.mjs` uses it to count the commits and renders of sixty pointer moves
over the wallet, with the script time beside them (PERF-007); `e2e/pointer-renders.spec.ts` holds
them in the E2E suite: no render of App, and one component render a move, the readout.

`node tools/perf-pdf.mjs <label> --preview` opens the Print Preview on the 5.8 m strap three
times, and reports the main thread's busy time, the renderer's CPU time and how many of the 33
sheets the list beside the page drew; then twenty previews closed or changed mid-way, with the
pdf.js workers left running and the post-GC heap (PERF-013). `e2e/pdf-worker.spec.ts` holds the
count — only the sheets near the list's view are drawn — and `pdfPages.test.ts` the pdf.js loading
task ended at once when the preview no longer wants it, and a few thumbnails drawn at a time.

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
5. Add a **golden** fixture for a representative case, and review the committed output by hand once
   (§11).
6. Run the `geometry-review` skill's checklist.

For UI work, the order relaxes: write the command and its test first, then wire the interface to it.
The command is the part with a contract; the panel is not.

## 11. Golden fixtures

Properties say what must hold of every answer. A golden says what the answer *was*, so that a change
which moves a stitch hole is seen, read and explained instead of shipped. They exist for the two
algorithms where silent drift costs leather: offsetting, which makes every derived stitch line, and
hole distribution.

`packages/geometry/src/golden.test.ts` builds a corpus of real pieces — a wallet panel, a panel
whose 3 mm corners an inset consumes, a strap with round ends, the three sewn sides of a card
pocket, the pocket with a V thumb notch and with the sample project's scooped one, a stitch line
drawn by hand with its seam allowance, and a pouch front of arcs and a cubic — sets each stitch line
3 and 4 mm in from the edge, or its allowance 3 and 4 mm out, and places holes along it with a
3.0 mm and a 3.85 mm iron, `fit-whole` as the app does. Each piece is one JSON file in
`packages/geometry/__golden__/`, compared with Vitest's own `toMatchFileSnapshot`: no dependency.

**Reading one.** Each stitch line opens with what a reviewer looks at first: its `lengthMm`, then
per iron the number of `holes` and the `spacingMm` achieved (pitch is nominal, spacing achieved —
[glossary](glossary.md)). Then come its segments, and every hole's position, one per line, so a
moved hole is a one-line diff. `[]` is an offset that gave nothing back: the strap inset by its
half-width collapses, and the scooped pocket's inset would trim an arc against a line at its tips,
which Tier 1 does not do ([geometry.md](geometry.md) §6.2). `"refused"` is an offset that threw:
a cubic has no exact one.

**No float noise.** Every number is millimetres on the model's 0.1 µm grid (`quantise`). An arc's
sweep is written as its length along the arc, signed like the sweep, so even that is a length. A
difference in the last bits of a double never reaches a file; a hole that moves by more than half a
grid step does.

**Updating.** A changed golden is a behaviour change. When it is meant, `pnpm test golden -u`
rewrites the files. **Look at every changed golden before committing it**, and say in the commit
message what moved and why ([geometry.md](geometry.md) §12). An unexplained golden diff is a silent
behaviour change, and the reason this layer exists. A run writes a golden that is missing; CI, with
`CI` set, never writes one, so a golden left uncommitted fails there. `.gitattributes` keeps the
files' `\n` line endings on a Windows checkout, so every platform compares the same bytes.

What they do not cover: the domain's corner policy. `hole-at-corner`, the default, splits a stitch
line at its sharp corners and distributes each run on its own; on a line with no sharp corners it
is the single run these goldens record. Its own tests are in `packages/domain/src/stitch.test.ts`.

## 12. Interface localization (U.26)

`pnpm test problemText problemNavigation keymap` also guards 9.15: every listed outcome or rule
has a reason and correction, and walking the diagnostic list wraps without skipping several
problems on one feature. `e2e/problem-navigation.spec.ts` checks the shared wording, F8 / Shift+F8,
rebinding, repairs with Undo/Redo, tab isolation, modal/field key ownership, accessibility and the
minimum window. Navigation leaves the document and its history untouched.

`pnpm test locales i18n untranslated` validates every catalogue, the typed-key runtime and JSX text
audit. Missing translations pass, including a newly added English message and an absent plural
family. Unknown keys and groups, malformed JSON, non-string values, invalid placeholders and partial
CLDR families fail. English is checked for its own valid plural definitions.

`pnpm locales:report` reports logical messages, missing keys, English copies and structural
errors without using coverage as a gate. The tests and report share `shared/catalogue.ts`.
`pnpm locales:report --review pl` prints a side-by-side Markdown review table.

`e2e/localization.spec.ts` drives the production build: every registered language, live renderer and native
dialog changes, restart persistence, Linux system-language selection, project-data round trips,
minimum/desktop window sizes, recovery and accessibility. Screenshots are attached to test results.
Unit tests cover Polish and Russian 0, 1, 2, 5, 11, 21, 22 and fractional counts, including complete,
missing and incomplete families. French tests also cover zero, fractions below two, exact millions,
one million plus one, and a fractional million, with whole-English fallback if `_many` is absent.
Spanish tests cover those counts too, with singular only for 1, and require the `_many` form.
The template-picker regressions exercise Enter/Delete in the focusable details region, Escape,
list shortcuts, row padding selection/double-click and independent pin buttons. Localization
scenarios check translated sort punctuation and all drawing modes at 1199, 1200, 1201 and
1280 px in every production language, including axe scans.
The report lists the runtime's required plural categories and ignores whitespace-only English copies.
In `pnpm dev`, *English (expanded)* is the overflow probe; it is
not a production language. See [the verification record](localization-verification.md) for actual
platforms, commands, findings and remaining limits.
