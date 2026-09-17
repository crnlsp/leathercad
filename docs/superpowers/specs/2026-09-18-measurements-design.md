# Measurements — a number that cannot disagree with the drawing (slice 4.10a) — design

**Date:** 2026-09-18
**Status:** Accepted (2026-09-18), with the three decisions in §12.
**Builds on:** [ADR 0010](../../adr/0010-anchors-address-geometry.md) (anchors), 4.8b (the
*references* edge), 4.11a (typography)
**Invariants touched:** S2, S3 and X6 gain their second and largest user; no new invariant

---

## 1. What this is for

A pattern that prints at 1:1 does not strictly need dimensions — you can measure the paper. What
dimensions are for is **the drawing in front of you while you design**, and **the sheet someone else
reads**:

> "Is that opening 95 or 96?" is a question a maker should never have to answer with a rule against
> a screen. And a pattern shared with someone else, or with yourself in a year, needs the numbers
> that mattered written on it — the opening, the strap width, the drop.

The thing that makes a CAD dimension worth more than a typed label is that **it cannot be wrong**.
The number is read from the model every time it is drawn (X6), so it cannot drift from the geometry
the way a label typed once does. That property is the whole feature, and every decision below
protects it.

## 2. The smallest useful capability

**4.10a: a linear dimension between two anchors.** Three types, because they differ only in how a
value is read from two points and which way the dimension line runs:

| Type | Value |
|---|---|
| `horizontal` | \|Δx\| |
| `vertical` | \|Δy\| |
| `aligned` | the distance between the two |

That covers the questions in §1 — a panel's width and height, the gap between two corners, a strap's
drop — and needs nothing that does not exist.

**Deferred, and named so they are not designed in quietly:**

- **`radial`**, and with it `centre` refs. A radius is not a distance between two places; it is a
  property of one, and it needs a second kind of reference to exist first.
- **`extent` refs** (the leftmost point of a feature, etc). These are the **least durable** kind:
  an extent is a property of *evaluated bounds*, so it moves when anything at all about the shape
  changes — including a rotation that moves no corner anywhere. A dimension to one is a dimension to
  a number rather than to a place, and it deserves its own thought rather than a line in this table.
- **Angular measurements** — already "later" in `domain-model.md` §3.7.
- **Chained and baseline dimensions**, tolerances, dual units, arrowhead styles. Drawing-office
  features; nothing in §1 asks for them.
- **Dimensions between parts.** A measurement belongs to the part of its first reference (§3.5).
  Cross-part dimensions are meaningful for an assembly, and this product does not have assemblies.

## 3. What a measurement references — and what it does not

**Anchors, and only anchors** in 4.10a: `(featureId, anchorIndex)`, exactly ADR 0010's scheme.

- **Not points.** A dimension to a free point goes stale without saying so — it keeps pointing at
  coordinates the drawing has left behind, and reads as authoritative while being wrong. This is the
  single most important rule here.
- **Not segment indices** (S9). `roundedRect` emits four segments with no radius and eight with one,
  so an index-addressed dimension would silently jump to a different edge the first time a corner was
  rounded.
- **Not whole features.** "The width of that rectangle" sounds durable and is not: it is an extent
  under another name, and it stops meaning anything the moment the rectangle is rotated.

An anchor survives everything a maker normally does: a rectangle has four corners whatever its size,
position, rotation or corner radii, and a derived feature inherits its source's anchors under the
same indices. **That durability is what makes the reference worth having**, and it is why anchors
were built in 4.4b before anything needed them.

### The one known gap in durability

ADR 0010 point 5: *drawn paths gain vertex ids before vertex editing ships (slice 3.9)*. Until then
a drawn path's anchors follow corner order, so **inserting a vertex renumbers them** and a dimension
on a freehand outline would move to a different corner.

Stated rather than worked around. Measurements on **parametric shapes** are fully durable today;
measurements on **drawn paths** carry the same exposure as partial stitch runs already do, and both
are fixed by the same thing. 4.10a does not restrict the maker — a restriction would be a worse lie
than the exposure — but the roadmap entry says so and 3.9 clears it.

## 4. How the user makes one — refs from snaps, without a search

§3.5 says the measure tool builds refs from snaps, which is right, but the snap index does not
currently carry what a ref needs: a candidate has a `featureId` and a **point**, not an anchor index.
Recovering the index by finding the nearest anchor to that point would be exactly the nearest-point
search ADR 0010 forbids — and would land on the wrong corner precisely when two are close, which is
when it matters.

**Checked before deciding, and the shared snap index is the wrong place for it in 4.10a.** Two
facts in `snap.ts` make adding a `SnapKind` a behaviour change for every existing tool:

- `SnapOptions.enabled` is documented as *"Kinds absent from this map are enabled"*, so a new kind is
  **on by default everywhere**;
- `PRIORITY` orders the kinds, and an `anchor` candidate placed above `endpoint` would win wherever
  the two coincide — which is most corners.

So drawing, moving and mirroring would all start snapping to something slightly different, for a
feature that has nothing to do with them. The review's instruction is explicit, and it is right.

**4.10a resolves the reference in the measure tool instead**, against the anchors evaluation already
produces:

```ts
anchorNear(resolved, atMm, toleranceMm): { featureId: FeatureId; anchor: number } | null
```

Shared snapping is untouched. The measure tool asks this question and nothing else does.

**Why this is not the search ADR 0010 forbids.** That rule is about *recovering a mapping* — working
out which output corner came from which input corner after a derivation — where a nearest-point guess
lands on the wrong one exactly when a corner has been removed. This is **authoring**: the maker has
pointed at a corner, and the question is which anchor they meant. The candidates are the anchor list
itself, so the index comes back **with** the answer rather than being inferred from it, and it is
stored once and never re-derived. Every CAD resolves a click this way; nothing downstream re-searches.

Snaps and clicks with no durable reference — empty space, a point along an edge, a midpoint — are
**refused with a reason** rather than quietly making a point-based dimension.

**Promoting this into the shared snap index is a later decision**, and a reasonable one: a corner is
arguably a better snap target than a segment end for every tool. But that is a change to how the whole
application feels, and it should be made on its own merits rather than smuggled in beneath a
measurement.

## 5. Derived data, annotation, or separate entity?

**A feature in a part**, resolved by the same evaluation as everything else. Not a separate entity
and not a parallel mechanism.

A separate "annotations" collection would need its own selection, visibility, lock, delete, undo,
parts-panel row, export layer and file section — every one of which already exists for features and
would then exist twice. The reasons to have one would be that a measurement is not geometry and does
not belong to a part; neither is true. It draws (a dimension line), it belongs to the piece it
measures, and it wants every feature affordance.

### Where the refs live: a `source`, not a missing one

`domain-model.md` §3.5 describes annotations as "features **without** a geometry source". The intent
is right — a measurement has no shape of its own — but implementing it literally means making
`source` optional on a union that 70-odd call sites read, for the sake of a distinction the code does
not otherwise need.

**Proposed instead:** a measurement's source *is* its references, as a new `GeometrySource` arm:

```ts
| {
    kind: 'measurement';
    measure: 'horizontal' | 'vertical' | 'aligned';
    a: MeasureRef;
    b: MeasureRef;
    offsetMm: Mm;          // how far the dimension line sits off the geometry
    precision: 0 | 1 | 2;
  }

type MeasureRef = { kind: 'anchor'; featureId: FeatureId; anchor: number };
```

This is honest rather than a workaround: a `GeometrySource` says *where this feature's geometry comes
from*, and a measurement's dimension line genuinely is computed from its references and its offset.
It is the same shape of change `text` was in 4.11b, and it keeps `Feature` a union of things that all
have a source — which is the assumption the whole domain is built on.

`MeasureRef` stays a union of one arm on purpose, so `centre` and `extent` can join it later without
changing anything that reads it.

### What it resolves to

The fields `ResolvedFeature` already has, used the way a label already uses them:

- **`path`** — the dimension line and its two extension lines. Gives selection, bounds, fit-to-view
  and export for free.
- **`text`** — the value, laid out in millimetres in the vendored typeface (ADR 0011, built 4.11a),
  so what is on screen is what prints.
- **`anchors`** — empty. Nothing measures a measurement.

Role `annotation`, which the layer table already has: grey and thin on screen, its own export layer,
**not in the cut export**. No change needed.

## 6. Evaluation and the graph — extend, do not add

> *Should a measurement update through the existing evaluation/graph machinery, or does it need
> another dependency concept?*

**The existing machinery, and 4.8b is why it fits.** Before the fold reference there was one edge
kind and a linear chain; now there are two edge kinds and a graph walk. A measurement is the same
shape of thing as a fold-tracked mirror: it **references** geometry it is not built from.

What each part already does, and what it needs:

| | Today | For 4.10a |
|---|---|---|
| `edgesFrom` | returns the derivation source, plus a mirror's fold | **add** the measurement's two refs |
| S2 — every edge resolves | walks `edgesFrom` | free |
| S3 — acyclic across both kinds | walks `edgesFrom` | free (and unreachable: nothing can derive *from* a measurement) |
| `dependentsOf` | follows `edgesFrom` | free — deleting a corner's feature lists the dimensions on it |
| Evaluation order | `resolveFeature` follows refs recursively, memoised | free |
| `ANCHOR_MISSING` (E4) | exists, used by runs | free — a dimension to a swallowed corner fails and reads as a warning |

**The one thing that needs generalising.** 4.8b added a single `foldFrom` to the cache entry, so a
mirror is rebuilt when its fold moves. A measurement has **two** references, so the cache's notion of
"what else this depended on" becomes a small list rather than one slot:

```ts
readonly refsFrom: readonly (Path | undefined)[];   // replaces foldFrom
```

Worth doing properly now rather than adding a second special-case field: this is the second user of
the references edge and it is exactly the moment the shape becomes clear. It is a contained change to
`evaluate.ts` with the fold case folded into it.

## 7. When things move, and when they go

| What happens | What the measurement does |
|---|---|
| The referenced geometry **moves, resizes, rotates** | Re-resolves; **the number changes**. The point of the feature. |
| Its **anchor disappears** — an inset swallows a corner | Fails with `ANCHOR_MISSING` (E4), draws as a warning, and **never re-targets a neighbour**. |
| The referenced **feature is deleted** | It is a dependent: ADR 0009's dialog lists it, exactly as it lists a stitch line's holes. |
| …and the maker chooses **freeze** | **Not freezable.** A measurement has no drawn form to keep — the same rule a stitch hole set already follows (`freezable: direct && kind !== 'stitch-hole-set'` gains `&& kind !== 'measurement'`). It goes. |
| The referenced feature is **locked** | Irrelevant: a measurement reads geometry, it does not change it. |
| The **measurement** is locked | Its offset and precision cannot change; the value still updates. It is a view of the model, not a copy of it. |

**Freezing deserves one more sentence,** because "keep it as it is" is the tempting answer and it is
wrong here. A frozen dimension is a number that no longer means anything — precisely the stale label
§1 says this feature exists to replace. Deleting it is the honest outcome, and the dialog says so.

## 8. Acceptance criteria

1. **The measure tool** makes a dimension between two anchors, in `horizontal`, `vertical` or
   `aligned` form, and the measurement joins the part of its first reference.
2. **Snapping to a corner yields an anchor reference** with no nearest-point search; a snap with no
   durable reference is **refused with a reason** rather than making a point-based dimension.
3. **The value is generated on every evaluation** and never stored (X6); it is shown at the
   measurement's `precision`, set in the vendored typeface.
4. **Moving or resizing the referenced geometry changes the number**, on screen and in export.
5. **A missing anchor fails the measurement** with `ANCHOR_MISSING` and never attaches to a
   neighbour (E4).
6. **Deleting a referenced feature lists the measurement** in the delete dialog; freezing is not
   offered for it.
7. The graph invariants hold over the new edges: the loader refuses a dimension to a feature that is
   not there (S2), and `dependentsOf` finds it.
8. **`offsetMm` and `precision` are editable in the panel**; nothing else about the measurement is.
9. The measurement **prints on the annotation layer and never in the cut export.**

## 10. Persistence

`CURRENT_FORMAT_VERSION` 7 → **8**, with `v7_to_v8` returning the document untouched: no version 7
file holds a measurement. The bump's job is the usual forward refusal.

The v8 fixture holds a dimension on a parametric shape, so the corpus proves a reference survives a
round trip — and that no value is stored with it.

## 11. Tests

- **Property:** for any rectangle and any two of its corners, the `aligned` value equals the distance
  between those corners' evaluated points, and `horizontal`/`vertical` equal \|Δx\| and \|Δy\| — under
  translation, rotation and resizing of the rectangle.
- **The number follows:** resize the shape, and the value changes with it; nothing is stored.
- **Durability:** change a rectangle's corner radii and its size; the dimension still names the same
  corners.
- **`ANCHOR_MISSING`:** inset a stitch line far enough to swallow a corner, dimension that corner,
  and see the measurement fail rather than move.
- **Graph:** a dimension to a missing feature is refused by the loader (S2); `dependentsOf` lists a
  measurement when its referenced feature is asked about; a measurement is never freezable.
- **Snaps:** a corner snap produces an anchor ref carrying the right index; `grid`, `on-path`,
  `midpoint` are refused with a reason.
- **Persist:** v8 round trip; no value in the file; a v8 file refused by a build claiming 7.
- **E2E:** dimension a panel's width, retype the panel's width, and watch the number follow.

## 12. Settled at review

1. **A `GeometrySource` arm** (§5), not an optional `source`. A measurement *does* have a geometry
   source — its referenced anchors — even though it is not derived from a single source feature. This
   keeps the model's standing invariant intact and makes the dependency explicit.
   **`domain-model.md` is corrected in the same commit**, so its "features without a geometry source"
   wording does not sit contradicting the code.
2. **Linear only** (§2). Radial, `centre` and `extent` refs, and every other kind, are deferred. The
   first slice establishes the durable anchor-reference model and the graph behaviour; radial is then
   a deliberate follow-up on the same architecture.
3. **Anchor references without touching shared snapping** (§4). The measure tool resolves its own
   reference; the snap index is unchanged in 4.10a, because adding a kind there would alter what every
   existing tool snaps to.

Principles carried into the build:

- moving **either** referenced anchor updates the measurement immediately;
- a missing anchor is `ANCHOR_MISSING`, never a silent re-target;
- a deleted referenced feature goes through the existing dependency and delete machinery, **with no
  freeze**;
- the two references are **normal graph edges**, and the cache generalises to a reference **list**
  rather than growing another one-off field;
- **no separate measurement collection or model.**

## 13. The two reference cases the tests must cover

Called out at review, because they have different durability and the implementation must not paper
over the difference:

1. **Anchors on parametric shapes.** Fully durable: a rectangle has four corners whatever its size,
   position, rotation or corner radii, and the indices are defined by the parameters. A measurement
   here survives every ordinary edit.
2. **Anchors on drawn paths.** Durable under move, rotate and scale — but **not under vertex
   editing**, which does not exist yet: `anchorsOf` numbers a drawn path's corners in order, so
   inserting a vertex renumbers them and a dimension would move to a different corner.

**This is an existing limitation of anchors, not one measurements introduce**, and it is ADR 0010
point 5's open item — *drawn paths gain vertex ids before vertex editing ships (slice 3.9)*. The
measurement implementation must **not** hide it with a fallback, a re-search or a restriction: a
dimension on a drawn path behaves exactly as a partial stitch run on one already does. Both are fixed
by the same work, and the roadmap entry says so.

Tests cover both: the same dimension, on a rectangle and on a drawn polygon, through move, rotate and
resize.
