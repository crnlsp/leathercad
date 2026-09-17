# Mirror — a counterpart that stays matched (slice 4.8) — design

**Date:** 2026-09-17
**Status:** Accepted, split into 4.8a and 4.8b
**Decides:** [ADR 0012](../../adr/0012-mirror-is-a-derivation.md)'s open questions
**Invariants delivered:** S4 (the mirror row), X3 for mirror-derived gestures; ADR 0010's mirror
anchor mapping

---

## 1. The workflows this has to serve

Mirror is only worth building if a leatherworker reaches for it. Four real jobs:

1. **A symmetric panel from half of it.** Draw the left half of a bag front, mirror it, get the
   whole. Editing the half edits both halves — a symmetric panel that has drifted is scrap.
2. **A left and a right piece.** Two side gussets, two straps, the two halves of a bifold. They must
   stay the same size: if one grows, so does the other.
3. **Paired features on one panel.** Two card slots at the same height, a pair of hardware holes
   either side of a centre line. Today you draw one, duplicate it, and nudge it until it looks
   right; the pair is not actually symmetric and nothing says so.
4. **Across a fold.** A wallet's back and front are one piece either side of a fold line. Mirroring
   across the fold is how the piece is drawn, and the fold line is already in the document.

**The pay-off that is not obvious:** the counterpart's holes are the *original's holes reflected*, so
the two pieces have the same hole count by construction. Two panels sewn together must have matching
holes, and distributing holes independently along two nominally-equal paths produces an off-by-one
the first day a rounding difference appears. That property is why mirror is a derivation, not a copy.

## 2. The split

**4.8a — the mirror operation.** The semantic and architectural core, proven on its own:

- the mirror derivation model, and axis + glide as its representation;
- the transform/re-factor algebra, including what happens when the counterpart is dragged;
- evaluation, and anchor propagation;
- the compatibility row, and every refusal rule;
- persistence, format version 6;
- **Mirror ↔ / ↕** on a feature, counterparts joining the same part;
- the property tests that pin the invariants.

Ends with: **paired card slots on one panel that stay symmetric when you edit one** — workflow §1.3.

**4.8b — the composition on top.** Consumes a proven mirror operation and adds no algebra:

- whole-part mirroring;
- **Mirror across fold**, using an existing `fold-line` as the axis;
- labels and text;
- hole-count parity, checked by construction;
- how a linked pair reads in the dependency tree, and the workflow around it.

Ends with: **a left and a right piece, matched, with equal hole counts** — workflows §1.1, §1.2, §1.4.

The boundary is deliberate: **4.8b must not need to extend the algebra.** If it turns out to, that is
a design failure in 4.8a to report, not to paper over.

---

# Part one — 4.8a

## 3. Acceptance criteria (4.8a)

1. **Mirror ↔ and Mirror ↕** create a counterpart of the selected feature — same kind, a cut contour
   keeping its role — in the **same part**, whose geometry is the original's reflected.
2. **Editing the original reaches the counterpart**: change its shape, move it, change a stitch
   margin, and the counterpart follows, holes included.
3. **The counterpart behaves like a normal piece**: drag it and it moves, turn it and it turns, and
   it stays linked throughout. The original does not move.
4. **Dragging the pair together moves the pair rigidly**, rather than sliding the two halves apart.
5. **Scaling the counterpart is refused** with a reason, as is reshaping it. Both say what to do
   instead.
6. **The relationship is visible, not discovered.** The property panel says what the counterpart
   mirrors and that moving the original moves it the opposite way.
7. **Anchors survive a mirror**: every anchor has an image, and it is the reflection of the source's.
8. **Format version 6**, so a build that predates mirror refuses a file holding one.
9. The axis and glide are **never shown as numbers** and never need to be edited by hand.

## 4. What is linked, exactly

The counterpart owns two things and inherits everything else.

| | Owned by the counterpart | Follows the original |
|---|---|---|
| Placement | ✅ its own | — |
| Name, visibility, lock | ✅ its own | — |
| Geometry — path, holes, anchors | — | ✅ entirely |
| Kind and role | — | ✅ preserved, not editable |
| Derivation parameters (margin, pitch, run) | — | ✅ it has none of its own |

**The counterpart is "the original, reflected, placed here."** Everything about *what it is* comes
from the original; everything about *where it is* is its own. Every answer below follows from that.

## 5. The op

As [ADR 0012](../../adr/0012-mirror-is-a-derivation.md) fixed it:

```ts
{ type: 'mirror'; axis: { origin: Vec2; angleRad: Radians }; glideMm: Mm }
```

A reflection across the axis, then a slide of `glideMm` **along** it. Together these express every
orientation-reversing isometry of the plane — precisely the set of "reflections, placed somewhere" —
so any move or turn of the counterpart is absorbed back into these two numbers without ever needing
a third. `MatOps.fromMirror(origin, radians)` already exists.

### Winding reverses, and that is safe

Reflecting a closed contour reverses its winding: an anticlockwise outline becomes clockwise. That is
what a reflection *is*, and it is safe because `applyDerivation` reads the **actual signed area**
rather than assuming a direction, so a stitch line inset from a mirrored outline still runs into the
leather. Property-tested, because it is true until someone tidies it up.

### Anchors map by doing nothing

The mirrored path's vertices are the source's reflected **in the same order**, so each edge is the
image of the corresponding edge with the same length: the arc-length parameterisation is identical
and an anchor at *s* maps to *s*. This satisfies ADR 0010 — the mapping comes from the code that
built the geometry, not a nearest-point search. Property-tested the honest way: **the image anchor's
point equals the reflection of the source anchor's point**, and no anchor goes missing, because a
reflection loses nothing.

## 6. A — manipulating the counterpart, in the user's terms

> The interaction has to feel like handling a normal piece that happens to stay linked. The algebra
> below is how that is achieved; **none of it reaches the user.**

### What the maker sees

| They do this | This happens | Why it is the right answer |
|---|---|---|
| **Drag the counterpart** | It moves where they put it. The original stays where it is; the two remain the same shape. | This is how you set the gap between a left and a right piece. |
| **Rotate the counterpart** | It turns where they put it, still linked. | A pair of gussets is not always parallel. |
| **Flip the counterpart** | It flips, still linked. | Falls out; no reason to refuse it. |
| **Drag the counterpart *and* the original together** | The pair moves **rigidly**, like one object. | Selecting a whole symmetric panel and moving it must not slide its halves apart. This is the case that would be wrong if we were naïve about it. |
| **Drag the original alone** | The original moves; the counterpart moves the **opposite** way. | The mirror line stays put, so the pair opens and closes symmetrically. Correct for a symmetric design, and §7 makes it visible instead of surprising. |
| **Scale the counterpart** | **Refused:** *"A counterpart is the size of its original. Scale Outline instead."* | A mirror is a reflection; a scaled reflection is a different piece. |
| **Reshape the counterpart** (width, radius, vertices) | **Refused:** *"This is a mirror of Outline. Change Outline and this follows."* | It has no shape of its own. |
| **Rename, hide, lock, delete it** | All allowed. They are its own. | |

### Does the maker ever think about the axis?

**No.** There is no axis field, no origin, no angle, no glide. The axis is not editable and not
displayed as numbers. *Where the counterpart is* is expressed the only way that needs no explanation:
by dragging it. The panel names the **relationship** — "Mirrors Outline" — not its parameters.

### "Cannot be represented" never happens

Worth stating plainly because it removes a whole class of interaction design: **composing any
translation, rotation or reflection with a reflection is still a reflection-plus-glide.** The
orientation-reversing isometries are closed under composition with isometries, so the re-factor
cannot fail for any gesture the interface offers. The only thing that fails is a non-isometry — a
scale or a shear — and that is exactly the refusal above. There is no "sorry, that cannot be
expressed" state to design, and no silent fallback.

### The algebra behind it

One function, not a case per gesture: compose, then factor the result back into an axis and a glide.

```ts
function decomposeGlide(m: Mat2x3): { axis: Axis; glideMm: Mm } | null;  // null ⇔ not an isometry
```

The linear part of an orientation-reversing isometry is a reflection about a line through the origin;
its angle gives the axis direction, and the translation part splits into a component **along** the
axis (the glide) and one **across** it (which offsets the axis by *half* that component — translating
a mirror line perpendicular by *t* moves the image by *2t*; the halving is the geometry, not a fudge).

Two compositions, because there are two situations:

| Situation | New transform | Effect |
|---|---|---|
| Counterpart moved **alone** | `T ∘ M` | The axis absorbs the gesture; the original does not move. |
| Counterpart moved **with its source** | `T ∘ M ∘ T⁻¹` | The axis travels with the pair, so the whole assembly moves rigidly. |

The second is the one that makes criterion 4 true, and it is the difference between a mirror that
behaves like an object and one that fights the user. Both go through the same `decomposeGlide`.

## 7. Making the relationship visible

Decision 3 of the review: the maker must not *discover* that moving the original moves the
counterpart the other way. No dialog; a compact indication where the relationship already lives.

The property panel, where an offset shows *Follows: Panel › Outline* and an **Edge margin** field,
shows for a mirror:

> **Mirrors** Panel › Outline
> *Reflected across a fixed line. Moving Outline moves this the opposite way — drag this piece to
> place the pair.*

Two sentences: what it is, and what the maker's next question will be. The exact wording is settled
in implementation; what is fixed here is that **the relationship and the fixed axis are stated, and
the parameters are not**.

Drawing the mirror line on the canvas while the counterpart is selected would say it better still.
That is a natural **4.8b** addition alongside the dependency-tree presentation, and is deliberately
not in 4.8a.

## 8. B — the axis, defined exactly

*Mirror ↔ / ↕* has to be pinned down now, because for an upright panel every interpretation agrees
and for a rotated one they do not.

### The definition

- **Coordinate system: world millimetres, Y-up.** The same frame as the rulers and every stored
  coordinate. `PathOps.bbox` over the resolved geometry of everything selected.
- **The bounding box is world-axis-aligned**, not oriented to the selection.
- **Mirror ↔** takes the **vertical line through the box's maximum x**; **Mirror ↕** takes the
  **horizontal line through the box's minimum y**. The counterpart therefore lands immediately to the
  right of, or immediately below, the selection, touching it.
- **Degenerate selection** — nothing resolves, or the box has no extent on the relevant axis —
  is **refused** with `MIRROR_NO_AXIS`: there is no edge to measure from.

### Why world-aligned, and what that means for rotated geometry

For a rotated panel the world bbox is larger than the piece, so the counterpart lands beside the
*box* rather than snug against the piece's edge. That is accepted deliberately:

- **"↔" means left-and-right in the drawing.** That is what the glyph says, what the ruler shows, and
  what the maker means. An axis that tilted with the piece would make the arrow a lie.
- **A selection has no orientation.** Two features rotated differently share no local frame, so an
  object-oriented axis is undefined for exactly the selections that most need mirroring.
- **Predictability beats tightness.** The counterpart is always exactly left-or-right, or
  exactly-above-or-below. A snug fit on a rotated piece is what **Mirror across fold** (4.8b) is for:
  draw the line where you mean it, and mirror across that.

So the rotated case is not a gap to be closed later; it is answered by the other gesture.

### What the gesture promises, and what it does not

**`Mirror ↔ / ↕` create a linked counterpart at the current placement. They do not create a
permanently symmetric relationship around a bounding box that keeps moving.** The axis is captured
when the gesture is used and stays fixed. Three consequences, all intended:

- changing the original afterwards **changes the gap** between the pair;
- growing it past the axis makes the two **overlap**, and nothing reports that, because nothing is
  wrong — the counterpart is still exactly its original reflected;
- **persistent symmetry belongs to mirror-across-fold** (4.8b), whose axis is a fold line in the
  drawing rather than a measurement of a shape that keeps changing.

The UI copy is held to this: the tooltip says the mirror line stays where it is put, the panel note
says resizing the original changes the gap, and neither implies a pair that stays symmetric on its
own. A test pins the overlap so that a later reader does not "fix" it by making the axis track the
source.

### How the axis is stored, and why it stays predictable

Stored in the op, in **world coordinates**, as an absolute line: `origin` a point on it, `angleRad`
its direction, **normalised to `[0, π)`** (a line at θ and θ+π is the same line, and leaving both
representable would make two equal mirrors compare unequal and round-trip differently). The glide's
sign is read against that normalised direction.

**The axis does not track the source.** It is computed once, from the selection at the moment of
mirroring, and then it is just a line in the document. This is the decisive property:

- If the axis *chased* the source's bounding box, it would move whenever the source's geometry
  changed — widen the panel and the mirror line would jump, moving the counterpart by twice as much
  for reasons the maker could not see.
- With a fixed axis, the rule is one sentence: **the counterpart is always the original reflected in
  that line.** Move the original and the counterpart moves oppositely. Rotate it and the counterpart
  counter-rotates. Both are what a mirror does, and both are predictable because the line is not
  moving underneath them.

A fixed axis is also what makes §6's "move the pair together" work: the axis is carried by the
conjugation rather than recomputed, so the assembly is rigid.

## 9. Refusals

| Code | When | Category |
|---|---|---|
| `MIRROR_WOULD_SCALE` | A scale or shear applied to a mirror-derived feature | interaction, X3 |
| `MIRROR_NO_AXIS` | Nothing to take an edge from | interaction, X3 |
| `TEXT_WOULD_READ_BACKWARDS` | Mirroring a label — **already built** | interaction, X9 |
| `DERIVATION_INCOMPATIBLE` | The mirror row of the compatibility table | structural, S4 |

Reshaping a counterpart is refused by the existing derived-source rules; the panel already hides
shape fields for a derived feature, so this is a command-level guarantee rather than a new surface.

## 10. Persistence

`CURRENT_FORMAT_VERSION` 5 → **6**, with `v5_to_v6` returning the document untouched: no version 5
file contains a mirror, so there is nothing to rewrite. Registered anyway for the reason `v1_to_v2`
gives — a gap in the chain is only discovered when the file that needed it is already on a disk. The
bump's real job is **forward** refusal: a build predating mirror must reject a file holding one
rather than silently dropping the counterpart.

## 11. Tests (4.8a)

- **The op.** Property: mirroring twice about the same axis is the identity. Property: the
  counterpart's path is the source's reflected, point for point. Property: a mirrored contour has the
  opposite signed-area sign, and a stitch line inset from it still lies inside it.
- **Anchors.** Property: the image anchor's point is the reflection of the source anchor's point, and
  no anchor becomes `null`.
- **The algebra.** Property: `decomposeGlide` round-trips — for any axis, glide and isometry, the
  re-factored transform equals the composed one within `EPS_POINT`. Property: moving alone by *d*
  then by −*d* restores the parameters. `null` for a scale.
- **In user terms**, the table in §6, each as a test: drag alone → the counterpart moves and the
  original does not; drag together → both move by the same delta; rotate; scale refused changing
  nothing; reshape refused.
- **Editing the original** — shape, margin, pitch — reaches the counterpart in all three.
- **The axis.** `Mirror ↔` on an upright panel puts the counterpart touching its right edge; on a
  rotated one, beside the world box, with the rule stated in a comment that names §8. Degenerate
  selection refused.
- **Persist.** A round trip through v6 holding a mirror; a v6 file refused by a build claiming 5; the
  v5 fixture still opens.
- **E2E.** Draw a slot, mirror it, see two on one part; edit the original and watch the pair follow;
  drag the counterpart and see the original stay; read the refusal on a scale.

---

# Part two — 4.8b, for later

Whole-part mirroring; **Mirror across fold**, using an existing `fold-line` as the axis and
introducing no construction-line system; labels and text in a mirrored part; hole-count parity
checked by construction; and how a linked pair presents in the dependency tree, including drawing
the mirror line while a counterpart is selected.

The labels position, carried over: a label is never mirrored (`TEXT_WOULD_READ_BACKWARDS`). Mirroring
a selection containing one is refused, naming it; mirroring a *part* carries no labels and says so in
the undo label rather than dropping them in silence.

## 12. Deliberately not here, in either half

- **Viewport framing.** A mirrored piece can land outside the view exactly as a duplicate can. Same
  general question, recorded in the [reconciliation §10](2026-09-15-phase-4-reconciliation-design.md),
  and not attached to this slice. If mirror proves genuinely unusable without it, that is a finding
  to report, not a licence to build it.
- **A general symmetry system or constraint solver.** A mirror is one derivation.
- **Arbitrary drawn mirror axes as a tool.** The gestures in §8 and 4.8b's fold line cover §1; a
  free-hand axis is a tool and no workflow needs one.
- **`Part.transform`** — ADR 0012 point 7.
- **Mirroring into a different part** from a chosen feature.
