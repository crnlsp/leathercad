# Anchors through derivations (slice 4.4b) — design

**Date:** 2026-09-16
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Decisions:** [ADR 0010](../../adr/0010-anchors-address-geometry.md)
**Invariants delivered:** S9 through derivations; E4 (`domain-model.md` §8)

---

## Why now

Three things later in Phase 4 have to name a place on geometry that was itself derived:

- **mirror** (4.8) maps anchors through its transform;
- **seam allowance** (4.9) makes a derived outline whose corners a run or a dimension will name;
- **measurements** (4.10) name corners on anything.

Today `anchorsOf` returns **nothing** for a derived feature, so all three would arrive to find the
addressing scheme unfinished — and the tempting fix at that point, looking for the nearest corner in
the result, is exactly the one ADR 0010 rejects: it lands on the wrong corner the moment an offset
removes one, which is the case that matters.

## Acceptance criteria

1. A stitch line inset from a rounded rectangle reports **four** anchors, each on the corner that
   produced it, one inset away.
2. A corner the offset swallowed — a 3 mm radius inset by 3.5 — still has an anchor, at the sharp
   corner it became.
3. A hole set reports its stitch line's anchors, unchanged.
4. Anchors survive two derivations: a drawn seam, its outward allowance, and a stitch line inset
   back from that allowance all share one numbering.
5. A run can name the corners of derived geometry. Before this slice that failed with
   `ANCHOR_MISSING`, because there were no anchors to name.
6. An anchor a partial run does not cover is **missing, not moved**: it keeps its index and comes
   back as `null` (E4), and is never given a number.

**No user interface.** This slice is a prerequisite: mirror (4.8), seam allowance (4.9) and
measurements (4.10) are what will show anchors to anyone. Adding a readout here would be scope for
its own sake, so what this slice ships is checked by tests rather than by a screenshot.

## The correspondence comes from the offset

`offsetPathTraced` returns, beside the path, where every input segment and corner went — both
indexed by **input segment**:

```ts
interface OffsetPiece {
  path: Path;
  segments: readonly (OffsetRange | null)[];   // null when the offset consumed it
  corners: readonly (Mm | null)[];             // the corner at the END of input segment i
}
```

A trimmed corner is the point its neighbours now meet at. A bridged one is the **middle of the
bridging arc**, which is the direction the corner pointed. A corner arc the offset swallowed reports
the join its neighbours meet at, because a swallowed corner arc is a sharp corner, not a collapse
(`geometry.md` §6.2) — so the anchor that named it still has an image.

`offsetPath` keeps its old signature and is now a one-line wrapper, so nothing else changed.

## Anchors live on the resolved feature

```ts
{ ok: true; feature; role; path; anchors: readonly (Mm | null)[]; … }
```

Distances along the feature's **own** path. Roots read them from their parameters as before;
a derived feature carries its source's, under the same indices:

| Derivation | Mapping |
|---|---|
| Offset, whole run | Each source anchor through the trace |
| Offset, partial run | The anchors the run covers, re-based to it; the rest are `null` |
| *(none other exists)* | `Derivation` is exactly `offset` and `stitch-holes` today |
| Stitch holes | The line's anchors, unchanged — holes on a corner are still on that corner |
| Mirror (4.8) | Through its transform, when it arrives |

Computed during evaluation, where the geometry was built, rather than by a query that would have to
rebuild it to find out. `runOf` now reads the **resolved source's** anchors instead of asking
`anchorsOf` about parameters, which is the one-line change that makes runs on derived features work.

**A missing anchor keeps its index.** Dropping it would renumber every anchor after it — a run
silently moving to a different edge, which is the failure ADR 0010 exists to prevent.

## Honest about what is not reachable yet

An anchor that is `null` can only be produced by a partial run today, and the compatibility table
lets only an inward offset from a cut contour take one — so nothing can currently *name* a null
anchor. `ANCHOR_MISSING` already covers it when something does; measurements (4.10) will be the
first. No test pretends otherwise.

## Deliberately not here

- **Mirror's mapping.** Slice 4.8 adds the op and its transform.
- **A run editor in the panel.** Runs are still set through the model; the UI for them belongs with
  the slice that needs it.
- **Vertex ids for drawn paths.** Still slice 3.9, still the prerequisite recorded in ADR 0010 §5:
  inserting a vertex renumbers a drawn path's corners.

## Tests

- **Geometry**: the trace's shape, an inset square's corner at 10√2 on the diagonal, an outset
  corner in the middle of its bridging arc, a rounded corner landing on the concentric arc at
  exactly the inset distance, a swallowed corner still reported, identity at zero, no corner after
  an open run's last segment, and two properties — every traced distance lies on the path it traced,
  and a rounded rectangle keeps four corners with four images however deep the inset.
- **Domain**: the acceptance criteria above, plus a property that the count and the order hold for
  any size, radius and inset.
