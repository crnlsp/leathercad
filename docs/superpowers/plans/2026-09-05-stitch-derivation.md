# Stitch Derivation Chain (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change a rectangle's width and watch its stitch line and its stitch holes update live — M3, which `docs/roadmap.md` §3 annotates "The core value of the product exists."

**Architecture:** One new `GeometrySource` variant, `derived`, pointing at exactly one source feature and carrying one operation. Two operations: `offset` (cut contour → stitch line) and `stitch-holes` (stitch line → hole set). Resolution is recursive and memoised — the chain is two links deep with one source per node, so there is no scheduler and no adjacency structure. Before any of that, two geometry defects are fixed, because the two most ordinary leathercraft shapes cannot currently be offset at all.

**Tech Stack:** TypeScript, vitest + fast-check for unit and property tests, Playwright for the app.

**Spec:** `docs/superpowers/specs/2026-09-05-stitch-derivation-design.md` — read it first. It carries the reasoning and the four worked cases; this plan carries the steps.

## Global Constraints

- **Millimetres only.** Pixels exist in `packages/render` and `packages/editor/viewport.ts` and nowhere else (`CLAUDE.md` invariant 1).
- **Derived geometry is never persisted.** Files store parameters; evaluation recomputes paths and holes on load (invariant 4, `docs/file-format.md` §3.3).
- **Only commands mutate the document** (invariant 5). Tools dispatch; React reads.
- **No float equality.** Use `approxEq` / `approxZero` and the epsilons from `packages/core/epsilon.ts`. Never define a local epsilon (invariant 7). The lint rule enforces this and will fail the build.
- **Quantise user input** to 1e-4 mm via `quantise()` before storing (invariant 8).
- **Geometry and domain functions need property tests**, not only examples (invariant 10, `docs/testing.md` §3).
- **`packages/geometry` is pure** — no DOM, no colour, no state, no clock. It may import only `packages/core` (invariant 3).
- **No new dependency without an ADR** in `docs/adr/`. This plan adds none.
- **pnpm is not on PATH.** Prefix every command with:
  `export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"`
- **`pnpm check` must pass before each commit.** Run it; report the real output.
- Work lands on a slice branch through a pull request, never by pushing to `main`.

## The scope boundary this plan defends

Tasks 1–2 are **geometry correctness fixes required for M3**. They are not leathercraft
functionality and they add no user-visible feature. They exist because Case A (a closed panel with
ordinary corner radii) and Case B (a pocket stitched on three sides) cannot be offset by the current
engine at all.

Tasks 3–9 are **M3 itself**.

Keeping the two separate matters at review time: a reviewer should be able to reject the way a join
is computed without touching the stitch-hole model, and vice versa.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `packages/geometry/src/ops/subPath.ts` | Extract the run between two arc-length positions |
| `packages/geometry/src/ops/subPath.test.ts` | Its tests |
| `packages/domain/src/derive.ts` | Resolve a `derived` source: offset and stitch-holes ops |
| `packages/domain/src/derive.test.ts` | Its tests |
| `packages/domain/src/anchors.ts` | The durable landmarks each source kind defines |
| `packages/domain/src/anchors.test.ts` | Its tests |
| `packages/domain/src/stitch.ts` | Corner splitting, run distribution, per-run reporting |
| `packages/domain/src/stitch.test.ts` | Its tests |
| `packages/document/src/derivedCommands.ts` | Add / edit / cascade-delete derived features |
| `packages/document/src/derivedCommands.test.ts` | Its tests |
| `packages/persist/src/migrations/v1_to_v2.ts` | The first real migration |
| `apps/desktop/src/renderer/src/featureEditors/StitchLineEditor.tsx` | Inset field |
| `apps/desktop/src/renderer/src/featureEditors/StitchHoleSetEditor.tsx` | Pitch, mode, corner policy, iron preset, readouts |
| `apps/desktop/src/renderer/src/irons.ts` | Iron preset library — app metadata, not document data |

**Modified**

| File | Change |
|---|---|
| `packages/geometry/src/ops/offset.ts` | Per-join bridge/trim; drop consumed arcs; open paths; output self-intersection test |
| `packages/geometry/src/ops/offset.test.ts:96-105` | Replace the two tests that pin the defects |
| `packages/geometry/src/index.ts` | Export `subPath` |
| `packages/domain/src/feature.ts` | `derived` variant, `StitchHoleSet` feature kind |
| `packages/domain/src/evaluate.ts` | Resolve `derived`; cycle guard; source-failure errors |
| `packages/domain/src/index.ts` | Export the new surface |
| `packages/persist/src/schema.ts` | Schema for `derived`, both ops, the new feature kind |
| `packages/persist/src/migrations/index.ts` | `CURRENT_FORMAT_VERSION = 2`, register the migration |
| `packages/render/src/displayList.ts` | Batched hole rendering |
| `apps/desktop/src/renderer/src/PropertyPanel.tsx` | Dispatch per feature kind, not only per shape |

---

## Task 1: Per-join offsetting

Fixes Case A and Case C together. Today `offsetPath` decides **once for the whole path** whether to
bridge gaps or trim overlaps, from a single `convexTurnSign`. That is why a mixed path is refused,
and why a convex corner inset past its own radius collapses the entire result.

The fix is to decide **per join**, and to drop an arc whose offset radius has gone negative rather
than abandoning the path.

**Files:**
- Modify: `packages/geometry/src/ops/offset.ts`
- Modify: `packages/geometry/src/ops/offset.test.ts` (lines 99–105 — the non-convex test)

**Interfaces:**
- Produces: `offsetPath(p: Path, distanceMm: Mm, opts: OffsetOptions): Path[]` — unchanged signature, wider accepted domain.

- [ ] **Step 1: Write the failing tests**

Add to `packages/geometry/src/ops/offset.test.ts`:

```ts
describe('corners smaller than the inset', () => {
  it('insets a rounded rectangle past its corner radius, giving sharp corners', () => {
    // A 3 mm corner inset by 3.5 mm. The corner arc is consumed; the two
    // neighbouring edges still meet, so the result is a sharp rectangle —
    // not a collapse. Wallet corners are routinely 3-5 mm and stitch insets
    // 3.5-4 mm, so this is the ordinary case, not an exotic one.
    const [inset] = offsetPath(roundedRect(vec(0, 0), 105, 75, 3), 3.5, ROUND);

    expect(inset).toBeDefined();
    // 105 - 7 by 75 - 7, four sharp corners.
    const box = bbox(inset!);
    expect(box!.maxX - box!.minX).toBeCloseTo(98, 9);
    expect(box!.maxY - box!.minY).toBeCloseTo(68, 9);
    expect(inset!.segments).toHaveLength(4);
  });

  it('still collapses when the inset genuinely exceeds the shape', () => {
    // Unchanged behaviour: 100 x 60 inset by 31 has nowhere to go.
    expect(offsetPath(roundedRect(vec(0, 0), 100, 60, 10), 31, ROUND)).toEqual([]);
  });
});

describe('concave paths', () => {
  it('offsets a concave outline whose result does not self-intersect', () => {
    // A thumb scoop: a gentle concave notch in a pocket. Inset 3.5 mm it
    // produces an ordinary curve, so refusing it for being non-convex
    // refuses valid work.
    const scooped = polyline(
      [vec(0, 0), vec(95, 0), vec(95, 60), vec(60, 60), vec(47, 48), vec(34, 60), vec(0, 60)],
      true,
    );

    const [inset] = offsetPath(scooped, 3.5, ROUND);

    expect(inset).toBeDefined();
    expect(selfIntersections(inset!)).toHaveLength(0);
  });

  it('rejects a concave outline when the inset folds the result over itself', () => {
    // A deep narrow notch inset further than it is wide has no simple answer.
    // Rejecting is correct; pruning the loops is slice 9.11.
    const notched = polyline(
      [vec(0, 0), vec(100, 0), vec(100, 60), vec(52, 60), vec(50, 10), vec(48, 60), vec(0, 60)],
      true,
    );

    expect(offsetPath(notched, 8, ROUND)).toEqual([]);
  });
});
```

Add the imports these need at the top of the file: `bbox` from `../path/index.js` and
`selfIntersections` from `./intersect.js`.

- [ ] **Step 2: Replace the test that pins the defect**

Delete this test entirely — it asserts the behaviour being corrected:

```ts
it('rejects a non-convex path, which needs Tier 2', () => {
  const dart = polyline([vec(0, 0), vec(100, 0), vec(50, 30), vec(100, 100), vec(0, 100)], true);
  expect(() => offsetPath(dart, 5, ROUND)).toThrow(/convex/i);
});
```

Replace it with the corrected contract:

```ts
it('offsets a dart rather than refusing it for being non-convex', () => {
  // Replaced the old "rejects a non-convex path" test in slice 4.2a. That
  // assertion encoded a defect: the engine asked whether concavity *could*
  // cause a problem, when it can check whether it *did*. The rejection is
  // now based on the result, not the input. See the design, section 6.2.
  const dart = polyline([vec(0, 0), vec(100, 0), vec(50, 30), vec(100, 100), vec(0, 100)], true);

  const [inset] = offsetPath(dart, 2, ROUND);

  expect(inset).toBeDefined();
  expect(selfIntersections(inset!)).toHaveLength(0);
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm test packages/geometry
```

Expected: the four new tests fail. The corner test fails with `inset` undefined (the offset returned
`[]`); the concave tests fail with a thrown `RangeError` mentioning "convex".

- [ ] **Step 4: Drop consumed arcs instead of abandoning the path**

In `offsetPath`, the arc branch currently reads:

```ts
if (radius < -EPS_POINT) return [];
if (approxZero(radius, EPS_POINT)) continue;
```

An arc whose offset radius has gone to zero *or past it* has been consumed by its neighbours: the
corner has become sharp, and the two adjacent offset segments still meet. Only a genuine collapse —
which the trim pass detects when a segment is cut past its own end — should return nothing. Replace
both lines with:

```ts
// A corner arc consumed by the offset is a sharp corner, not a collapse:
// the neighbours still meet, and the trim pass below finds where. Only a
// segment cut past its own end means the ring has closed over itself, and
// `trimAll` is what detects that.
if (radius < EPS_POINT) continue;
```

- [ ] **Step 5: Decide bridge-versus-trim per join, not per path**

Delete `convexTurnSign` and its call site, and the `RangeError` it raised. Replace `joinAll` so each
vertex is judged on its own local turn.

The rule at each vertex, between offset segment `i` and offset segment `i + 1`:

- Compute the local turn from the **source** path: `cross(tangentAt(src[i], 1), tangentAt(src[i+1], 0))`.
- `Math.sign(d) * localTurn < 0` → the offsets lean apart, leaving a gap: **bridge** with the
  existing `bridge()` arc, centred on the source vertex.
- Otherwise the offsets overlap: **trim** both to their intersection.
- Endpoints already coincident (every tangent corner of a rounded rectangle) → neither; keep as is.

Two structural notes for the implementer:

1. `trimAll`'s existing two-pass shape must be preserved — compute every corner point before
   rebuilding any segment. Its own comment explains why a single forward pass leaves the ring open
   by exactly the offset distance.
2. `trimAll` currently gives up when either side of an overlap is an arc
   (`if (current.kind !== 'line' || next.kind !== 'line') return undefined`). Once a consumed arc is
   dropped in Step 4 its neighbours are the two lines that flanked it, so the common case is
   line-line. Keep the `undefined` return for arc-arc overlaps: that is honest, and it surfaces as
   a rejection rather than a wrong answer.

- [ ] **Step 6: Reject on the result, not the input**

Immediately before `offsetPath` returns its single path, after the existing winding check:

```ts
// The rejection criterion, replacing the old input convexity gate: a
// concave corner is only a problem if the offset it produced actually
// folded over itself. Pruning those loops is slice 9.11; detecting them
// is enough to refuse honestly.
if (selfIntersections(result).length > 0) return [];
```

Import `selfIntersections` from `./intersect.js`.

- [ ] **Step 7: Run the tests**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm test packages/geometry
```

Expected: PASS, including the three pre-existing `collapse` tests, unchanged. If
`returns nothing when a rounded rectangle collapses in one direction` now returns a path instead of
`[]`, the trim pass is not detecting a segment cut past its own end — fix that rather than
special-casing the test.

- [ ] **Step 8: Add the property tests**

```ts
describe('offset properties', () => {
  it('never produces a self-intersecting result', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 200, noNaN: true }),
        fc.double({ min: 20, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 15, noNaN: true }),
        fc.double({ min: 0.5, max: 8, noNaN: true }),
        (w, h, r, d) => {
          const [inset] = offsetPath(roundedRect(vec(0, 0), w, h, r), d, ROUND);
          if (inset === undefined) return; // a legitimate collapse
          expect(selfIntersections(inset)).toHaveLength(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('shrinks a rounded rectangle by twice the inset in each direction', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 40, max: 200, noNaN: true }),
        fc.double({ min: 40, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 15, noNaN: true }),
        fc.double({ min: 0.5, max: 8, noNaN: true }),
        (w, h, r, d) => {
          const [inset] = offsetPath(roundedRect(vec(0, 0), w, h, r), d, ROUND);
          if (inset === undefined) return;
          const box = bbox(inset)!;
          // Holds whether or not the corner arcs survived the inset — which
          // is the whole point of the Case A fix.
          expect(box.maxX - box.minX).toBeCloseTo(w - 2 * d, 6);
          expect(box.maxY - box.minY).toBeCloseTo(h - 2 * d, 6);
        },
      ),
      { numRuns: 300 },
    );
  });
});
```

- [ ] **Step 9: Update the documentation in the same commit**

`offsetPath`'s doc comment states it "handles convex closed paths of lines and arcs" and refuses
everything else. That is now wrong. Rewrite it to describe the corrected contract: analytic offsets
of closed paths of lines and arcs, concave corners included, rejecting when the result
self-intersects or collapses. Update `docs/geometry.md` §6.2 to match — a stale doc is worse than a
missing one, because it will be followed.

- [ ] **Step 10: Run everything and commit**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check
```

```bash
git add packages/geometry docs/geometry.md
git commit -m "fix(geometry): decide offset joins per corner, not per path"
```

---

## Task 2: `subPath` and open-path offsetting

Enables Case B. Needed twice over: partial runs, and corner policy, which splits at corners and
distributes per run.

**Files:**
- Create: `packages/geometry/src/ops/subPath.ts`, `packages/geometry/src/ops/subPath.test.ts`
- Modify: `packages/geometry/src/ops/offset.ts`, `packages/geometry/src/index.ts`

**Interfaces:**
- Produces: `subPath(p: Path, fromMm: Mm, toMm: Mm): Path` — an **open** path covering the run between two arc-length positions. On a closed path, `fromMm > toMm` wraps through the start.
- Produces: `offsetPath` accepting open paths, returning an open offset.

- [ ] **Step 1: Write the failing tests for `subPath`**

```ts
import { describe, expect, it } from 'vitest';

import { open, polyline, length } from '../path/index.js';
import { vec } from '../vec2.js';
import { subPath } from './subPath.js';

describe('subPath', () => {
  it('extracts a middle run and returns it open', () => {
    const p = polyline([vec(0, 0), vec(100, 0), vec(100, 50)], false);
    const run = subPath(p, 50, 120);

    expect(run.closed).toBe(false);
    expect(length(run)).toBeCloseTo(70, 9);
  });

  it('splits the boundary segments rather than snapping to vertices', () => {
    const p = polyline([vec(0, 0), vec(100, 0)], false);
    const run = subPath(p, 25, 75);

    expect(length(run)).toBeCloseTo(50, 9);
  });

  it('wraps through the start of a closed path', () => {
    // A 100 mm square, from 350 mm round to 50 mm: the last 50 mm of the
    // final edge plus the first 50 mm of the first. This is how a run that
    // spans the start point is expressed.
    const square = polyline([vec(0, 0), vec(100, 0), vec(100, 100), vec(0, 100)], true);
    const run = subPath(square, 350, 50);

    expect(run.closed).toBe(false);
    expect(length(run)).toBeCloseTo(100, 6);
  });

  it('returns an empty path for a zero-length run', () => {
    const p = polyline([vec(0, 0), vec(100, 0)], false);
    expect(subPath(p, 40, 40).segments).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm test packages/geometry
```

Expected: FAIL — cannot find module `./subPath.js`.

- [ ] **Step 3: Implement `subPath`**

Use `measure(p)` for arc-length lookup and `SegmentOps.split(s, t)` to cut the boundary segments.
The shape of the implementation:

1. Clamp `fromMm` and `toMm` into `[0, totalLength]`.
2. If they are equal, return `open([])`.
3. If `fromMm < toMm`, walk segments accumulating length; take the tail of the segment containing
   `fromMm`, whole segments in between, and the head of the segment containing `toMm`.
4. If `fromMm > toMm` and the path is closed, that is a wrapping run: concatenate
   `subPath(p, fromMm, total)` with `subPath(p, 0, toMm)`.
5. If `fromMm > toMm` and the path is open, throw a `RangeError` — there is nothing to wrap through.

Always return `open(...)`. A run has two ends by definition; if the run covers the whole of a closed
path the caller wants the closed original, and asks for it directly.

- [ ] **Step 4: Run the tests**

Expected: PASS.

- [ ] **Step 5: Property test**

```ts
it('preserves total length when split and rejoined', () => {
  fc.assert(
    fc.property(fc.double({ min: 1, max: 199, noNaN: true }), (cut) => {
      const p = polyline([vec(0, 0), vec(100, 0), vec(100, 100)], false);
      const a = length(subPath(p, 0, cut));
      const b = length(subPath(p, cut, 200));
      expect(a + b).toBeCloseTo(200, 6);
    }),
    { numRuns: 200 },
  );
});
```

- [ ] **Step 6: Write the failing test for open-path offsetting**

Add to `packages/geometry/src/ops/offset.test.ts`, replacing the `rejects an open path` test:

```ts
it('offsets an open path, leaving its ends open', () => {
  // Replaced "rejects an open path" in slice 4.2a. A stitch line on three
  // sides of a pocket is an open offset, and it is the most common seam in
  // leatherwork — refusing it refused the normal case. A stitch line has
  // ends, so there is no cap policy to invent.
  const run = polyline([vec(0, 0), vec(100, 0), vec(100, 50)], false);
  const [offsetRun] = offsetPath(run, 3.5, ROUND);

  expect(offsetRun).toBeDefined();
  expect(offsetRun!.closed).toBe(false);
  // Two edges, shortened by the inset at the corner, plus the corner itself.
  expect(length(offsetRun!)).toBeCloseTo(length(run) - 3.5 * 2, 6);
});

it('bridges the outside of a corner on an open path', () => {
  const run = polyline([vec(0, 0), vec(100, 0), vec(100, 50)], false);
  const [outside] = offsetPath(run, -3.5, ROUND);

  expect(outside).toBeDefined();
  expect(outside!.segments.some((s) => s.kind === 'arc')).toBe(true);
});
```

- [ ] **Step 7: Run and watch it fail**

Expected: FAIL — throws `/closed/i`.

- [ ] **Step 8: Accept open paths**

Remove the `if (!p.closed) throw new RangeError(...)` guard. Then make the join loop respect
openness: an open path has `n - 1` interior joins rather than `n`, so the `% offsets.length`
wrap-around in both the bridge and trim passes must not join the last segment back to the first.
The per-join structure from Task 1 makes this a bounds change, not a redesign.

The winding check at the end of `offsetPath` applies only to closed paths — an open path has no
signed area. Guard it with `if (p.closed)`.

- [ ] **Step 9: Run everything and commit**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check
```

```bash
git add packages/geometry docs/geometry.md
git commit -m "feat(geometry): subPath, and offsets of open runs"
```

---

## Task 3: The `derived` source and its resolution

**Files:**
- Modify: `packages/domain/src/feature.ts`, `packages/domain/src/evaluate.ts`, `packages/domain/src/index.ts`
- Create: `packages/domain/src/derive.ts`, `packages/domain/src/derive.test.ts`

**Interfaces:**
- Produces: the `derived` variant of `GeometrySource`, the `Derivation` union, and `StitchHoleSet`.
- Produces: `evaluate` resolving a `derived` feature, with cycle and source-failure errors.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/derive.test.ts`:

```ts
import { PathOps, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';
import { evaluate, evaluationErrors, resolvedFeatures } from './evaluate.js';

function panel(): Feature {
  return {
    id: 'cut-1',
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible: true,
    locked: false,
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width: 105,
        height: 75,
        radii: uniformRadii(8),
        rotation: 0,
      },
    },
  };
}

function stitchLine(sourceId: string, distanceMm = 3.5): Feature {
  return {
    id: 'stitch-1',
    kind: 'stitch-line',
    name: 'Stitch line',
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId,
      op: { type: 'offset', distanceMm, side: 'inward', run: { kind: 'whole' } },
    },
  } as Feature;
}

function projectWith(features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

describe('a derived stitch line', () => {
  it('follows its source inward by the inset', () => {
    const resolved = [...resolvedFeatures(evaluate(projectWith([panel(), stitchLine('cut-1')])))];
    const line = resolved.find((f) => f.feature.id === 'stitch-1');

    expect(line).toBeDefined();
    // 105 x 75 with 8 mm corners, inset 3.5: straights shortened by 2r,
    // plus one circle of the reduced radius.
    const expected = 2 * (98 - 9) + 2 * (68 - 9) + 2 * Math.PI * 4.5;
    expect(PathOps.length(line!.path)).toBeCloseTo(expected, 6);
  });

  it('updates when the source changes, with no explicit regenerate', () => {
    const narrow = evaluate(projectWith([panel(), stitchLine('cut-1')]));
    const wide = evaluate(
      projectWith([
        { ...panel(), source: { kind: 'shape', shape: { type: 'rect', origin: { x: 0, y: 0 },
          width: 205, height: 75, radii: uniformRadii(8), rotation: 0 } } },
        stitchLine('cut-1'),
      ]),
    );

    const a = [...resolvedFeatures(narrow)].find((f) => f.feature.id === 'stitch-1')!;
    const b = [...resolvedFeatures(wide)].find((f) => f.feature.id === 'stitch-1')!;

    expect(PathOps.length(b.path)).toBeCloseTo(PathOps.length(a.path) + 200, 6);
  });

  it('reports one clear error when its source fails, not a cascade', () => {
    const broken: Feature = {
      ...panel(),
      source: { kind: 'shape', shape: { type: 'rect', origin: { x: 0, y: 0 },
        width: Number.NaN, height: 75, radii: uniformRadii(8), rotation: 0 } },
    };

    const errors = evaluationErrors(evaluate(projectWith([broken, stitchLine('cut-1')])));
    const onLine = errors.find((e) => e.feature.id === 'stitch-1');

    expect(onLine).toBeDefined();
    expect(onLine!.error).toMatch(/source/i);
  });

  it('reports a missing source rather than throwing', () => {
    const errors = evaluationErrors(evaluate(projectWith([stitchLine('does-not-exist')])));
    expect(errors[0]?.error).toMatch(/not found/i);
  });

  it('reports a cycle rather than recursing forever', () => {
    const a = stitchLine('stitch-2');
    const b = { ...stitchLine('stitch-1'), id: 'stitch-2' } as Feature;

    const errors = evaluationErrors(evaluate(projectWith([a, b])));
    expect(errors.some((e) => /cycle/i.test(e.error))).toBe(true);
  });

  it('refuses an inset deeper than the outline can hold, naming the problem', () => {
    const errors = evaluationErrors(evaluate(projectWith([panel(), stitchLine('cut-1', 60)])));
    expect(errors[0]?.error).toMatch(/deeper|collaps/i);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm test packages/domain
```

Expected: FAIL — the `derived` variant does not exist, so the test file does not compile.

- [ ] **Step 3: Add the model**

In `packages/domain/src/feature.ts`, extend `GeometrySource` and add the operations:

```ts
/**
 * How a derived feature is built from another one.
 *
 * One source, one operation. The chain in this product is two links deep —
 * cut contour, stitch line, holes — so this is a linked list, not a graph,
 * and there is deliberately no array of sources reserved "for later". A
 * genuinely two-input derivation is a new variant, and adding it then costs
 * less than carrying the generality now.
 */
export type Derivation =
  | {
      readonly type: 'offset';
      readonly distanceMm: Mm;
      readonly side: 'inward' | 'outward';
      readonly run: Run;
    }
  | {
      readonly type: 'stitch-holes';
      /** Nominal, from the iron. The achieved spacing is derived. */
      readonly pitchMm: Mm;
      readonly mode: 'fit-whole' | 'exact-pitch';
      readonly corners: 'continuous' | 'hole-at-corner';
      readonly startOffsetMm?: Mm;
      readonly endOffsetMm?: Mm;
      /**
       * Cosmetic, so the panel can say "KS Blade 3.85". Never read as
       * geometry: `pitchMm` is the truth, so a file opens identically on a
       * machine that has never heard of this iron.
       */
      readonly ironLabel?: string;
    };

/**
 * Which part of the source is used.
 *
 * Anchors, not segment indices. `roundedRect` emits a variable number of
 * segments — a zero radius omits the corner arc — so an index-based run would
 * silently move to different edges when a radius changed. Anchors are defined
 * by the shape's parameters, so a rectangle has four corners whatever its
 * radii. See the design, section 4.
 */
export type Run =
  | { readonly kind: 'whole' }
  | { readonly kind: 'between'; readonly fromAnchor: number; readonly toAnchor: number };
```

Add the variant:

```ts
| { readonly kind: 'derived'; readonly sourceId: FeatureId; readonly op: Derivation }
```

And the feature kind:

```ts
/** Where the awl goes. Derived from a stitch line; never persisted as points. */
export interface StitchHoleSet extends FeatureBase {
  readonly kind: 'stitch-hole-set';
}
```

Add `StitchHoleSet` to the `Feature` union and give it the existing `stitch-holes` layer role in
`roleOf`.

- [ ] **Step 4: Resolve it**

In `packages/domain/src/evaluate.ts`, thread a `visiting: Set<FeatureId>` and a feature lookup
through resolution. The shape:

```ts
function resolveDerived(
  feature: Feature,
  source: GeometrySource & { kind: 'derived' },
  ctx: ResolveContext,
): Result<Path, string> {
  if (ctx.visiting.has(feature.id)) {
    return err('This feature is derived from itself, through a cycle.');
  }

  const from = ctx.byId.get(source.sourceId);
  if (from === undefined) {
    return err('The feature this is derived from was not found.');
  }

  ctx.visiting.add(feature.id);
  const resolved = resolvePath(from, ctx);
  ctx.visiting.delete(feature.id);

  // One clear message, not the root cause repeated down the chain.
  if (!resolved.ok) return err(`The ${from.name} it follows could not be built.`);

  return applyDerivation(resolved.value, source.op, from);
}
```

`applyDerivation` handles `offset` in this task. For `stitch-holes` it returns
`err('Stitch holes are not implemented yet.')` rather than throwing — an unfinished operation must
not be able to blank a document. Task 5 replaces that branch.

For `offset`: convert `side` to a signed distance using the source path's winding — inward is
positive on a counter-clockwise ring — call `offsetPath`, and map the empty array to
`err('A 60 mm inset is deeper than this outline can hold.')` with the real number interpolated.

Keep the existing object-identity memoisation, extending the cache key to include the resolved
source so a dependent invalidates when its source changes and not otherwise.

- [ ] **Step 5: Run the tests**

Expected: PASS, all six.

- [ ] **Step 6: Run everything and commit**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check
```

```bash
git add packages/domain
git commit -m "feat(domain): derived features, resolved one source at a time"
```

---

## Task 4: Anchors and partial runs

**Files:**
- Create: `packages/domain/src/anchors.ts`, `packages/domain/src/anchors.test.ts`
- Modify: `packages/domain/src/derive.ts` (the `offset` branch), `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `anchorsOf(source: GeometrySource, path: Path): Mm[]` — arc-length positions of the durable landmarks, or `[]` when the source defines none.

- [ ] **Step 1: Write the failing test**

```ts
describe('anchors', () => {
  it('gives a rectangle four corners, whatever its radii', () => {
    for (const radius of [0, 3, 8]) {
      const shape = { type: 'rect' as const, origin: { x: 0, y: 0 }, width: 100,
        height: 60, radii: uniformRadii(radius), rotation: 0 };
      const path = pathForShape(shape);
      expect(anchorsOf({ kind: 'shape', shape }, path)).toHaveLength(4);
    }
  });

  it('keeps a run on the same edges when the corner radius changes to zero', () => {
    // The trap this design exists to avoid: roundedRect emits 8 segments at
    // 8 mm and 4 at 0 mm, so an index-based run would silently move.
    const rounded = stitchRunLength(8);
    const sharp = stitchRunLength(0);

    // Three sides of a 100 x 60 panel: 100 + 60 + 100 = 260, less the
    // corner rounding, which is why these differ but stay close.
    expect(rounded).toBeGreaterThan(240);
    expect(sharp).toBeCloseTo(260, 6);
  });

  it('gives a circle no anchors, so only a whole run is possible', () => {
    const shape = { type: 'circle' as const, centre: { x: 0, y: 0 }, radius: 20 };
    expect(anchorsOf({ kind: 'shape', shape }, pathForShape(shape))).toHaveLength(0);
  });

  it('gives a drawn polyline its vertices', () => {
    const path = polyline([vec(0, 0), vec(10, 0), vec(10, 10)], false);
    expect(anchorsOf({ kind: 'path', path }, path)).toHaveLength(3);
  });
});
```

Write `stitchRunLength(radius)` as a local helper that builds a rect of that radius, resolves a
stitch line with `run: { kind: 'between', fromAnchor: 0, toAnchor: 3 }`, and returns
`PathOps.length` of the result.

- [ ] **Step 2: Run and watch it fail**

Expected: FAIL — `anchorsOf` does not exist.

- [ ] **Step 3: Implement `anchorsOf`**

A switch on the source kind, exhaustive with a `never` check so a new shape must answer the
question:

- `shape.type === 'rect'` — the four corners in emission order (bottom-left, bottom-right,
  top-right, top-left, matching `roundedRect`'s anticlockwise start at the bottom edge). For a
  radiused corner the anchor is the **midpoint of the corner arc**, which is the point that stays
  put as the radius changes.
- `shape.type === 'circle'` — `[]`.
- `shape.type === 'arc'` — `[]`; an arc is already open and `whole` means the whole arc.
- `kind === 'path'` — the arc-length position of each vertex, from `PathOps.vertices`.
- `kind === 'derived'` — `[]` for now. A run on a derived feature is not needed by M3.

- [ ] **Step 4: Use anchors in the offset branch**

In `applyDerivation`'s `offset` case, when `run.kind === 'between'`:

1. `const anchors = anchorsOf(sourceFeature.source, sourcePath)`
2. Bounds-check both indices; out of range is `err('That run no longer exists on this outline.')`
3. `const run = subPath(sourcePath, anchors[from], anchors[to])`
4. Offset the open run.

- [ ] **Step 5: Run the tests, then everything, then commit**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check
```

```bash
git add packages/domain
git commit -m "feat(domain): partial stitch runs, addressed by anchors"
```

---

## Task 5: Stitch holes and corner policy

**Files:**
- Create: `packages/domain/src/stitch.ts`, `packages/domain/src/stitch.test.ts`
- Modify: `packages/domain/src/derive.ts`, `packages/domain/src/evaluate.ts`

**Interfaces:**
- Produces: `StitchHoles { holes: readonly StitchHole[]; count: number; achievedPitchMm: Mm; runs: readonly RunReport[] }` where `StitchHole = { point: Vec2; tangent: Vec2; runIndex: number; ordinal: number }` and `RunReport = { lengthMm: Mm; count: number; achievedPitchMm: Mm }`.
- Note: holes carry **no id**. They are addressed positionally by `(runIndex, ordinal)`. See the design §5.

- [ ] **Step 1: Write the failing test**

```ts
describe('stitch holes', () => {
  it('distributes a whole number of holes round a closed line', () => {
    const holes = holesOn(rectStitchLine(105, 75, 8, 3.5), { pitchMm: 3.85,
      mode: 'fit-whole', corners: 'continuous' });

    expect(holes.count).toBeGreaterThan(80);
    expect(holes.achievedPitchMm).toBeCloseTo(perimeter / holes.count, 6);
  });

  it('reports the spacing it achieved, not the pitch it was asked for', () => {
    const holes = holesOn(rectStitchLine(100, 100, 0, 3.5), { pitchMm: 3.85,
      mode: 'fit-whole', corners: 'continuous' });

    expect(holes.achievedPitchMm).not.toBe(3.85);
    expect(Math.abs(holes.achievedPitchMm - 3.85)).toBeLessThan(3.85 / 2);
  });

  it('puts a hole exactly on each corner, without doubling it', () => {
    const holes = holesOn(rectStitchLine(100, 60, 0, 3.5), { pitchMm: 3.85,
      mode: 'fit-whole', corners: 'hole-at-corner' });

    // Four runs, four shared corner points, each appearing once.
    expect(holes.runs).toHaveLength(4);
    const corners = holes.holes.filter((h) => isCorner(h.point));
    expect(corners).toHaveLength(4);
  });

  it('reports each run separately, so the odd spacing is attributable', () => {
    const holes = holesOn(rectStitchLine(100, 60, 0, 3.5), { pitchMm: 3.85,
      mode: 'fit-whole', corners: 'hole-at-corner' });

    expect(holes.runs.every((r) => r.count >= 2)).toBe(true);
    expect(holes.runs.reduce((n, r) => n + r.count, 0)).toBeGreaterThan(holes.count - 5);
  });

  it('gives a run shorter than one pitch two holes, not none', () => {
    const holes = holesOn(shortRun(2), { pitchMm: 3.85, mode: 'fit-whole',
      corners: 'continuous' });

    expect(holes.count).toBe(2);
  });

  it('computes positions from the index, so they do not drift', () => {
    const holes = holesOn(longRun(4000), { pitchMm: 3.85, mode: 'exact-pitch',
      corners: 'continuous' });

    const last = holes.holes[holes.holes.length - 1]!;
    expect(last.point.x).toBeCloseTo((holes.count - 1) * 3.85, 6);
  });
});
```

Write these local helpers at the top of the test file, so every test above reads against real
geometry rather than a mock:

```ts
/** A stitch line: a rounded rectangle, inset. Returns the resolved path. */
function rectStitchLine(w: number, h: number, radius: number, insetMm: number): Path {
  const outline = Shapes.roundedRect({ x: 0, y: 0 }, w, h, uniformRadii(radius));
  const [inset] = offsetPath(outline, insetMm, { join: 'round' });
  if (inset === undefined) throw new Error('the fixture itself collapsed');
  return inset;
}

/** A straight open run of a given length, for the degenerate cases. */
const shortRun = (mm: number): Path => PathOps.polyline([{ x: 0, y: 0 }, { x: mm, y: 0 }], false);
const longRun = shortRun;

function holesOn(path: Path, op: Omit<Extract<Derivation, { type: 'stitch-holes' }>, 'type'>) {
  return distributeHoles(path, { type: 'stitch-holes', ...op });
}

/** Within a tenth of a millimetre of one of the four rectangle corners. */
function isCorner(p: Vec2): boolean {
  return CORNERS.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < 0.1);
}
```

`perimeter` in the first test is `PathOps.length` of the same stitch line the test builds — compute
it in the test body rather than hard-coding it, so a change to the offset engine cannot make the
assertion vacuously true.

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement `stitch.ts`**

Two functions:

`splitAtCorners(path: Path): Path[]` — split where the tangent turns by more than `EPS_ANGLE`
between consecutive segments. A closed path with no corners (a circle) returns itself as one run.
Use `subPath` for the extraction.

`distributeHoles(path, op): StitchHoles` —
- `corners: 'continuous'` → one run, `distributeAlongPath` once, `closed` from the path.
- `corners: 'hole-at-corner'` → `splitAtCorners`, then `distributeAlongPath` per run with
  `closed: false`, then **de-duplicate the shared endpoints**: the last hole of run *n* and the
  first of run *n+1* are the same corner point. Keep one. Getting this wrong doubles a hole and is
  invisible until punching.
- Aggregate `count`, `achievedPitchMm` (total usable length over total intervals), and the per-run
  report.

- [ ] **Step 4: Wire it into `applyDerivation`**

Replace the `stitch-holes` placeholder from Task 3. The resolved geometry of a hole set is the hole
points; the `ResolvedFeature` gains the `StitchHoles` payload so the panel and the renderer can read
count and spacing without recomputing.

- [ ] **Step 5: Property test**

```ts
it('never places holes closer together than half the pitch', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 20, max: 300, noNaN: true }),
      fc.double({ min: 2, max: 6, noNaN: true }),
      (size, pitch) => {
        const holes = holesOn(rectStitchLine(size, size, 0, 3.5), { pitchMm: pitch,
          mode: 'fit-whole', corners: 'hole-at-corner' });

        for (let i = 1; i < holes.holes.length; i++) {
          const a = holes.holes[i - 1]!.point;
          const b = holes.holes[i]!.point;
          const gap = Math.hypot(b.x - a.x, b.y - a.y);
          // A doubled corner hole shows up here as a gap of zero.
          expect(gap).toBeGreaterThan(pitch / 2);
        }
      },
    ),
    { numRuns: 200 },
  );
});
```

- [ ] **Step 6: Run everything and commit**

```bash
git add packages/domain
git commit -m "feat(domain): stitch holes, with a hole on every corner"
```

---

## Task 6: Commands, cascade delete, and the format bump

**Files:**
- Create: `packages/document/src/derivedCommands.ts`, `packages/document/src/derivedCommands.test.ts`
- Create: `packages/persist/src/migrations/v1_to_v2.ts`
- Modify: `packages/persist/src/schema.ts`, `packages/persist/src/migrations/index.ts`, `packages/document/src/index.ts`

**Interfaces:**
- Produces: `addStitchLine(partId, featureId, sourceId, distanceMm)`, `addStitchHoles(partId, featureId, sourceId, op)`, `setDerivation(featureId, op)`, and `deleteFeatures` extended to cascade.

- [ ] **Step 1: Write the failing tests**

```ts
describe('derived commands', () => {
  it('refuses a derivation that would close a cycle, before it enters the document', () => {
    const store = storeWithChain();
    const before = store.getState().document;

    store.dispatch(setDerivationSource('cut-1', 'stitch-1'));

    expect(store.getState().document).toBe(before);
  });

  it('deletes dependents with their source, as one undoable step', () => {
    const store = storeWithChain();   // cut -> stitch line -> holes

    store.dispatch(deleteFeatures(['cut-1']));
    expect(featureIds(store)).toHaveLength(0);

    store.undo();
    expect(featureIds(store)).toHaveLength(3);
  });

  it('edits an inset without touching anything else', () => {
    const store = storeWithChain();
    store.dispatch(setDerivation('stitch-1', { type: 'offset', distanceMm: 5,
      side: 'inward', run: { kind: 'whole' } }));

    expect(insetOf(store, 'stitch-1')).toBe(5);
    expect(featureIds(store)).toHaveLength(3);
  });
});

describe('format version 2', () => {
  it('opens a version 1 file, which has no derived features', () => {
    const loaded = loadProject(readFileSync(FIXTURE_V1));
    expect(loaded.project.parts).toHaveLength(3);
  });

  it('round-trips a stitch line and its holes', () => {
    const saved = saveProject(projectWithChain(), OPTIONS);
    expect(loadProject(saved).project).toEqual(projectWithChain());
  });
});
```

Helpers for this file:

```ts
/** cut contour -> stitch line -> hole set, in one part, all three linked. */
function storeWithChain(): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(addPart(shapePart('part-1', 'cut-1', 'Panel',
    rectShape({ x: 0, y: 0 }, 105, 75, 8))));
  store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 3.5));
  store.dispatch(addStitchHoles('part-1', 'holes-1', 'stitch-1',
    { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' }));
  return store;
}

const featureIds = (store: DocumentStore): string[] =>
  store.getState().document.project.parts.flatMap((p) => p.features.map((f) => f.id));

function insetOf(store: DocumentStore, id: string): number | undefined {
  const feature = store.getState().document.project.parts
    .flatMap((p) => p.features).find((f) => f.id === id);
  const source = feature?.source;
  return source?.kind === 'derived' && source.op.type === 'offset'
    ? source.op.distanceMm : undefined;
}

/** The project `storeWithChain` builds, for the persistence round trip. */
const projectWithChain = (): Project => storeWithChain().getState().document.project;

const FIXTURE_V1 = resolve(import.meta.dirname, '../../../fixtures/format/v1.lcp');
const OPTIONS = { applicationVersion: '0.0.0', now: () => new Date('2026-09-05T00:00:00.000Z') };
```

`setDerivationSource` in the cycle test is a test-only helper that builds a `setDerivation` command
pointing at a different source — the production surface has no reason to expose re-pointing, and the
test exists to prove the guard, not the feature.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement the commands**

Cycle rejection walks the `sourceId` chain from the proposed source; if it reaches the feature being
edited, return the document unchanged. Do it in the command, not in evaluation, so the document is
never in a cyclic state.

Cascade delete collects the transitive dependents of every deleted id — features whose
`source.kind === 'derived'` and whose `sourceId` is in the set — and removes them in the same
command, so one undo restores all of them.

- [ ] **Step 4: Bump the format, with a real migration this time**

`CURRENT_FORMAT_VERSION = 2`. Add `v1_to_v2` to `MIGRATIONS`. Version 1 files contain no derived
features, so the migration is structurally an identity — but write it, register it, and commit
`fixtures/format/v2.lcp` alongside the existing v1 fixture.

The latitude used in slices 3.6b and 3.7 to add fields in place is **spent**. `docs/file-format.md`
§4.2 applies from here.

Keep `fixtures/format/v1.lcp` exactly as it is. It is now a real migration test.

- [ ] **Step 5: Run everything and commit**

```bash
git add packages/document packages/persist fixtures
git commit -m "feat(persist): format version 2, and the commands that build a chain"
```

---

## Task 7: The panel, the canvas, and the PDF

**Files:**
- Create: `apps/desktop/src/renderer/src/irons.ts`, `apps/desktop/src/renderer/src/featureEditors/StitchLineEditor.tsx`, `apps/desktop/src/renderer/src/featureEditors/StitchHoleSetEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/PropertyPanel.tsx`, `packages/render/src/displayList.ts`, `packages/export/src/scene.ts`
- Test: `e2e/shell.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

```ts
test('a stitch line and its holes follow the panel width', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 250);
    await window.mouse.down();
    await window.mouse.move(box!.x + 550, box!.y + 450, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-line').click();
    await panel.getByTestId('add-stitch-holes').click();

    const count = window.getByTestId('hole-count');
    const before = Number(await count.textContent());
    expect(before).toBeGreaterThan(10);

    // The whole product in one interaction: type a width, everything downstream follows.
    await window.getByTestId('parts-list').getByText('Outline').click();
    const width = panel.locator('label', { hasText: /^Width/ }).locator('input');
    await width.fill('205');
    await width.press('Enter');

    await expect(count).not.toHaveText(String(before));
    await expect(window.getByTestId('achieved-spacing')).toContainText('mm');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: The iron presets**

`apps/desktop/src/renderer/src/irons.ts` — app metadata, never document data:

```ts
/**
 * Real irons, by the pitch stamped on them.
 *
 * Application configuration, not document data: the *value* is persisted on
 * the hole set, so a file opens identically on a machine that has never heard
 * of this list. The label rides along only so the panel can name it.
 */
export const IRON_PRESETS = [
  { id: 'ks-3.85', label: 'KS Blade 3.85 mm', pitchMm: 3.85 },
  { id: 'ks-3.38', label: 'KS Blade 3.38 mm', pitchMm: 3.38 },
  { id: 'crimson-3.0', label: 'Crimson Hides 3.0 mm', pitchMm: 3.0 },
  { id: 'amy-roke-3.0', label: 'Amy Roke 3.0 mm', pitchMm: 3.0 },
  { id: 'amy-roke-2.7', label: 'Amy Roke 2.7 mm', pitchMm: 2.7 },
] as const;
```

- [ ] **Step 4: The editors**

`StitchLineEditor` — one inset field. `StitchHoleSetEditor` — iron preset select, pitch (typeable,
overriding the preset), mode, corner policy, and the read-only report: hole count
(`data-testid="hole-count"`), achieved spacing (`data-testid="achieved-spacing"`), and the per-run
counts. Warn in the panel when achieved spacing deviates from nominal by more than a quarter pitch.

`PropertyPanel` currently dispatches on `shape.type`. Extend it to dispatch on the feature kind
first, then the shape — the same narrowing switch with a `never` check, so a new feature kind fails
the build until it has a panel.

- [ ] **Step 5: Batched hole rendering**

Holes are hundreds of identical circles. Emit one display-list item carrying the point array and a
diameter rather than one item per hole, so 3 000 holes stay at 60 fps.

- [ ] **Step 6: The PDF layer**

Holes export on the `stitch-holes` layer at true millimetre diameter. Extend the existing raster
verification to measure hole spacing on the rendered page, not only the calibration square.

- [ ] **Step 7: Run everything and commit**

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check && pnpm test:e2e
```

```bash
git add apps packages/render packages/export e2e
git commit -m "feat(desktop): stitch lines and holes in the panel, on the canvas, in the PDF"
```

---

## Task 8: Look at it, then print it

**Files:**
- Create: `docs/print-verification-log.md`
- Modify: `docs/roadmap.md`, `docs/superpowers/specs/2026-09-05-stitch-derivation-design.md` (status)

- [ ] **Step 1: Drive the app and screenshot it**

Build, then drive with Playwright: draw a panel, add a stitch line and holes, change the width, and
screenshot before and after. Look at the screenshots. Check that holes sit *on* the stitch line, that
corners have a hole exactly on them, and that no hole is doubled.

- [ ] **Step 2: Export and measure the PDF by raster**

Rasterise with poppler at 254 dpi and measure hole spacing in pixels, the way slice 6.3 measures the
calibration square. Ten holes at 3.85 mm should span 34.65 mm.

- [ ] **Step 3: Print it and measure it with a steel rule**

Print at 100%. Measure the 50 mm verification square and the stitch run. Record the printer, the
paper, the driver settings and the measured values in `docs/print-verification-log.md`.

This is **M5**, and `CLAUDE.md` forbids claiming print accuracy without it.

- [ ] **Step 4: Measure the performance budget**

`docs/product-spec.md` §7 sets two numbers, and M3's acceptance criteria 15 repeats them. Verify
both rather than assuming:

```ts
test('3 000 holes stay interactive', async () => {
  // A long strap stitched both sides reaches this in real use.
  // Budget: 60 fps while dragging, and a chain regeneration under 50 ms.
  await withFreshApp(async (window) => {
    // ... build a panel whose hole count exceeds 3000, drag it, and measure
    // frame times with performance.now() inside window.evaluate.
  });
});
```

If the budget is missed, the batched rendering from Task 7 Step 5 is the first place to look, not
the distribution maths — `distributeAlongPath` is O(n) and computes from the index.

- [ ] **Step 5: Walk the sixteen acceptance criteria**

Open the design's §8 and check each one off against the running application, not against the test
suite. State how each was checked. Criteria 7, 8 and 9 are the three that currently fail on `main`;
criterion 13 (save, quit, reopen — bytes unchanged, holes identical) is the invariant-4 proof and
the one most easily skipped.

- [ ] **Step 6: Update the roadmap and the spec status**

Mark 4.2, 4.4, 4.5 and 4.6 done with the gotchas worth not rediscovering. Mark the design
implemented. Record that the format latitude is spent.

- [ ] **Step 7: Commit and open the PR**

```bash
git add docs
git commit -m "docs: record the derivation chain slice, and the 1:1 measurement"
git push -u origin HEAD
gh pr create --fill
```

---

## What we intentionally are NOT building in Stage 1

Every item here is possible with the model this plan lands. That is exactly why the list exists.

- **Seam pairing and hole-count parity.** The counts are produced; the pairing is not. Next slice.
- **Hole suppression or nudging.** The parameter shape is reserved in the design §5 — `suppressed:
  number[]` on the hole set — and nothing implements it.
- **Mirror and seam allowance.** Both are `derived` variants and both are one small function away.
  They are the following slice, not this one.
- **Multi-source derivations.** One `sourceId`. No arrays, no adjacency lists, no "while we're here".
- **A general DAG scheduler, topological sort, or dependency graph API.** Two links deep, one source
  per node. If the implementation grows a `Graph` type, the plan has been exceeded.
- **A constraint solver, or any two-way relationship.** `product-spec.md` §6 rejected it.
- **Loop pruning in the offset engine.** Task 1 detects a self-intersecting result and refuses.
  Computing the correct remaining outline is slice 9.11 and stays there.
- **Vertex ids on drawn paths.** Needed before slice 3.9 ships, not before M3.
- **Runs on derived features.** `anchorsOf` returns `[]` for a `derived` source. A stitch line on a
  stitch line is not a thing anyone has asked for.
- **Any further drawing tool, editing tool, guide, or alignment feature.** Slices 3.8–3.11 stay
  behind M3.
- **Thickness, material, grain, or BOM fields.** Cheap and valuable, and still not this slice.
