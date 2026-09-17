# The parts panel, and a lock that means it (slice 4.3b) — design

**Date:** 2026-09-17
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Invariants delivered:** S7; the parts half of §3.1 and §3.2
**Defects fixed:** D8

---

## Why this half

4.3a said what a part is *made of*. This half is how you **see and handle one**: which part you are
working on, what follows what inside it, and how to copy, remove, hide or pin down a piece without
the app quietly doing something else to it.

It is also the slice that makes `locked` mean something. Today it is a **pick lock** — `hitTest` and
`snap` skip a locked feature and every command still edits and deletes it (D8). That is worse than
no lock at all: the one thing it currently does is take the feature away from the canvas, so a
locked outline cannot be selected to be unlocked. The parts panel is the escape hatch, which is why
the lock and the panel are one slice and not two.

## Acceptance criteria

1. **Clicking a part's heading selects the part.** The status bar counts it, and the target part for
   anything that joins a part is the selected part — or, as before, the one part the selected
   features belong to.
2. **The panel is a dependency tree.** A derived feature appears nested under the one it follows:
   *Outline ▸ Stitch line ▸ Holes*. A feature following something in **another** part sits at the
   top level of its own, because the thing it follows is not there to nest under.
3. **Duplicate part** makes a copy beside the original. Derivations **inside** the part are
   re-pointed to the copies, so the copy's stitch line follows the copy's outline; derivations to
   other parts keep pointing where they did. No reference is created from the original into the copy.
4. **Delete part** goes through the same plan and dialog as deleting a feature (ADR 0009): anything
   outside the part that depends on it is shown first.
5. **Visibility** toggles per feature and per part, from the panel. A hidden feature is not drawn and
   is not exported.
6. **Lock means locked** (S7). No command changes or deletes a locked feature, each refusal says why,
   and the only thing that changes a locked feature is unlocking it. A locked feature is still
   **selectable from the panel**, which is how it gets unlocked.
7. Deleting a feature whose **dependent** is locked is refused too — the cascade would otherwise
   delete or freeze a feature the user pinned down.

## What the lock covers, and what it does not

**S7 says "a locked feature changes only by being unlocked."** Read strictly that would include
hiding it, which is the wrong answer for the workbench: you lock the outline so you cannot nudge it,
and you still want to hide it to see what is underneath. So:

| Operation | Locked feature |
|---|---|
| Move, transform, flip, reshape | **Refused** |
| Rename, re-parameterise, re-point a derivation | **Refused** |
| Delete — directly, in a part, or as a cascade | **Refused** |
| Set visible / hidden | **Allowed** — a view convenience, not a change to the piece |
| Select, in the panel | **Allowed** — otherwise the lock cannot be undone |
| Unlock | **Allowed**, obviously |
| Being *followed* by something that changes | **Allowed** — its dependents still follow it |

Lock protects the **geometry and the structure**, not the view. That distinction is written into
`domain-model.md` §8.2 beside S7 so the next person does not have to re-derive it.

## How the refusal is shaped

`FEATURE_LOCKED`, a **structural** code protecting S7, refused through the existing channel — no new
mechanism (ADR 0013). The query is pure and shared with the UI, the pattern `derivationRefusal` and
`additionRefusal` already set:

```ts
export function lockRefusal(project: Project, ids: Iterable<FeatureId>): Problem | null;
```

It names the first locked feature it finds, so the message says *which* one. Commands ask it before
doing anything; the panel asks it to disable a button and say why on hover.

**Deletes ask about the cascade, not only the request.** `planDelete` already computes every
dependent; the lock check runs over the requested features *and* their dependents, so freezing or
deleting a locked stitch line cannot happen by way of its outline.

## The dependency tree

A pure function over one part, in `packages/domain` — the graph is domain knowledge and the panel
should not rebuild it:

```ts
export interface FeatureNode {
  readonly feature: Feature;
  readonly children: readonly FeatureNode[];
}

export function featureTree(part: Part): readonly FeatureNode[];
```

- A feature is a **child** of the feature it derives from, when that feature is in the same part.
- Everything else is a **root**, in document order: drawn geometry, and anything following a feature
  in another part.
- No cycle is possible (S3), so no visiting set is needed — but the builder is written not to loop
  even if one somehow arrived from a file, because a panel that hangs is worse than one that lies.

This is where the reference graph becomes visible, which is what makes the delete dialog
unsurprising rather than alarming.

## Duplicating a part

The command takes the ids it will use, rather than making them, so it stays a pure description of an
edit like every other command:

```ts
export function duplicatePart(
  partId: PartId,
  newPartId: PartId,
  featureIds: readonly FeatureId[],   // one per feature, in document order
): Command;
```

Too few ids refuses and changes nothing, rather than duplicating half a part.

**Re-pointing** is a map from old id to new: every `derived` source whose `sourceId` is in the map
becomes the copy's; every one that is not is left alone, and so keeps pointing at the other part it
already pointed at. That is §3.2's rule in one line, and it is what makes the copy's stitch line
follow the copy's outline rather than the original's.

**The copy is placed beside the original**, one bounding box plus a 5 mm gap to the right. A copy
drawn exactly on top of its original is invisible, and the first thing anyone would do is drag it
off — so the slice does it. Only the copy's **root** features are translated; the derived ones follow
on their own, which is both correct and the reason this costs almost nothing.

The copy is named `<name> copy`, and is selected afterwards, because it is what you are now working
on.

## Part visibility without a format change

`Part` gains **no** `visible` field, so there is no format version 5 and no migration. A part is
hidden when every feature in it is hidden; toggling the part sets all of them.

**The wart, stated rather than hidden:** hiding a whole part and showing it again forgets which
single features were hidden beforehand. That is a real if minor loss, and the alternative is a
persisted field, a format bump and a migration for a view convenience. If real use shows the loss
matters, `Part.visible` is one migration away — this is the cheaper thing first, not the permanent
answer.

## Selection

```ts
interface Selection {
  readonly parts: ReadonlySet<PartId>;
  readonly features: ReadonlySet<FeatureId>;
}
```

Both sets exist, but the panel sets one and clears the other: a part heading and a feature row are
two ways of pointing at different things, and a selection that is quietly both is a selection nobody
can reason about. The **target part** is then, in order: the one selected part; else the one part the
selected features share; else nothing, and the existing `NO_TARGET_PART` / `TARGET_SPANS_PARTS`
refusals are unchanged.

Selection stays outside the document (`architecture.md` §4), so selecting a part does not mark the
file dirty.

## Deliberately not here

- **`Part.transform`, materials, grain direction, notes** — ADR 0012, not Phase 4.
- **Selection drill-down and vertex selection** — slice 3.9, which needs vertex ids first.
- **Mirror**, including mirroring a whole part — slice 4.8. Duplicate is a copy with *no*
  relationship; mirror is the linked one, and they are not variants of each other.
- **Reordering parts or features** by dragging in the panel. Nothing depends on the order but the
  display.
- **Renaming a part from the panel.** `setPartName` exists and the property panel has it.
- The **4.3a deferrals** — sampled containment, traced-outline validation cost, D6's direct-source
  dependency, the hard-coded hole clearance. None is needed here.

## Tests

- `featureTree`: nests a derived chain; keeps document order among roots; puts a cross-part follower
  at the top level; terminates on a cycle that should not exist.
- `lockRefusal`: names the locked feature; null when nothing is locked; finds one among several ids.
- Every mutating command, against a locked feature: refuses and **changes nothing** — identity, not
  deep equality, so it proves no command ran rather than that one was a no-op.
- Delete: refused when a *dependent* is locked, not only when the requested feature is.
- Unlock works while locked; visibility works while locked.
- `duplicatePart`: internal derivations re-pointed; cross-part ones left alone; no reference from the
  original into the copy; too few ids refuses; the copy sits clear of the original.
- Part visibility: toggling the part sets every feature; a part reads as hidden only when all are.
- E2E: draw a panel with a stitch line and holes, see the tree nested; lock the outline and watch a
  drag and a delete refuse with a reason; unlock; duplicate the part and see two parts whose stitch
  lines follow their own outlines.
