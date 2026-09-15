# Reference graph and explicit deletion (slice 4.2b) — design

**Date:** 2026-09-15
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Decisions:** [ADR 0009](../../adr/0009-explicit-resolution-when-deleting-a-source.md), [ADR 0013](../../adr/0013-invariants-are-enforced-rules-are-reported.md)
**Invariants delivered:** S2, S3, S4 (`domain-model.md` §8.2); X1 for cycles and derived moves; X2

---

## Why this is first

Every later Phase 4 slice deletes things, derives things, or both. Seam allowance makes a part's
outline derivable, so the M3 cascade would delete a part's own cut line. This slice replaces that
before anything depends on it.

## Acceptance criteria

Checkable by using the application:

1. Deleting a feature nothing depends on happens at once, and one Undo brings it back.
2. Deleting an outline that has a stitch line and holes opens a dialog listing both, grouped by
   part. The document does not change until a choice is made.
3. **Delete all** removes the outline, its stitch line and its holes as one Undo step.
4. **Keep, frozen** removes the outline and keeps the stitch line as drawn geometry, in exactly the
   same place, noted *Frozen from Outline*. Its holes still follow it. One Undo restores the chain.
5. Deleting a stitch line that has holes does not offer to freeze the holes: the dialog says they
   cannot exist without their line, and lists them as deleted.
6. Cancel or Escape changes nothing and adds nothing to Undo.
7. Deleting a part's last feature leaves the part in the parts list, marked empty, with a *Remove*
   button.
8. A derived feature's panel shows *Follows: Outline*. Choosing another outline re-points it. A
   source that would close a loop, or that the compatibility table does not allow, is not offered,
   and the command refuses it with the reason.
9. Dragging a stitch line on its own does not move it, and the status bar says why. Dragging it
   together with its outline moves both.
10. Opening a file whose graph is broken — a source that does not exist, a loop, a derivation the
    table does not allow, a repeated id — is refused with a message naming the feature.
11. A frozen stitch line survives save and reload with its note (format version 4); files from
    versions 1 to 3 still open.

## The model

In `packages/domain/src/graph.ts`, pure:

| Function | Answers |
|---|---|
| `dependentsOf(project, ids)` | Everything that transitively depends on `ids`, not counting `ids` themselves |
| `derivationRefusal(project, feature)` | Why this derived feature is not allowed — missing source, a loop, or the compatibility table — or `null` |
| `followRefusal(project, featureId, sourceId)` | Why re-pointing would not be allowed, or `null` |
| `graphProblems(project)` | Every S1–S4 violation, each naming a feature; what the loader refuses |

The **compatibility table** is `domain-model.md` §4.2, minus the `mirror` row, which arrives with
4.8. "Closed" for a seam-allowance source is read from **parameters**, not evaluation: a shape that
encloses an area, a closed drawn path, or a whole-run offset of a closed source. A structural
invariant cannot depend on whether evaluation happened to succeed.

In `packages/document`:

| Command or query | Behaviour |
|---|---|
| `planDelete(project, ids)` | The dependents, each marked **direct** or not and **freezable** or not. A direct dependent is freezable if it has a drawn form (not a hole set) and currently resolves |
| `deleteFeatures(ids, resolution?)` | With no dependents: deletes. With dependents and no resolution: **refuses, returning the document unchanged**, so the store records no history. `'delete-dependents'` or `'freeze-dependents'` resolve it. Never removes a part |
| `deletePart(id, resolution?)` | Deletes a part and its features, planned the same way |
| `setSource(id, sourceId)` | Re-points, refusing whatever `followRefusal` refuses |
| `addFeature` and the derived adders | Refuse a derived feature `derivationRefusal` rejects |
| `refusedTransforms` | Also reports a derived feature moved without its source |

Freezing a dependent replaces its `source` with a drawn `path` from its last resolved geometry and
records `frozenFrom`: the name of what it followed. Its own dependents stay linked to it.

## Interaction

- **One entry point for deleting.** The panel's Delete button and the Delete key both call the
  app's `requestDelete(ids)`. It deletes at once when `planDelete` finds no dependents, and
  otherwise opens the dialog. Tools reach it through an optional `ToolContext.requestDelete`.
- **The dialog never has a destructive default.** Focus starts on Cancel; Escape cancels.
- **The select tool explains a refused move** through `notice()`, reading the same
  `refusedTransforms` the scale tool already reads.

## Format version 4

`frozenFrom?: string` on every feature. The `v3_to_v4` migration is an identity, and
`fixtures/format/v4.lcp` holds a frozen feature. A part's `features` could already be empty in the
schema; what changes is that commands now leave empty parts in place.

## Deliberately not here

- **Part selection, and deleting or duplicating a non-empty part from the panel.** Slice 4.3.
  `deletePart` exists now so an emptied part can be removed.
- **`EMPTY_PART` as a diagnostic.** The diagnostic channel is 4.12a; this slice only keeps the part
  and marks it empty in the list.
- **References** (measurement ends). Slice 4.10 adds the second kind of edge to the same functions.
