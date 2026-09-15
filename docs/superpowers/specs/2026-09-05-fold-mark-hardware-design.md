# Fold lines, marking lines and hardware holes (slice 4.7) — design

**Slice:** 4.7
**Status:** Design, approved
**Date:** 2026-09-05

---

## Why this slice exists

After M3 a part can be cut and stitched. It cannot be *assembled*. A wallet body that folds has no
way to say where it folds; a panel that is glued has no way to say where the glue goes; a strap that
takes a rivet has no way to say where the rivet goes. All three are ordinary leatherwork and none of
them is expressible today.

The model is already most of the way there. `FoldLine` and `MarkingLine` exist from 4.1, and
`ROLE_STROKES` already gives `fold` a dash-dot green and `mark` a light grey. Nothing can create
them. This slice is mostly about **creation and targeting**, not about new geometry.

**Slice 3.3b is a prerequisite and landed first.** These three features are *defined by where they
are*, and until 3.3b nothing in the app snapped: `buildSnapIndex` had no caller. A cut contour
survives being drawn roughly because it is a parametric shape with numeric fields, but a fold line
drawn as a path has no editable parameters until 3.9 — so an eyeballed one would have been
uncorrectable. With snapping wired, a bifold's fold line catches the midpoints of the panel's top
and bottom edges, and a D-ring anchor catches a corner.

## The thesis this serves

A pattern is a set of instructions to a person with a knife. "Cut here" is one instruction; "fold
here", "glue to here" and "punch a 4 mm hole here" are three more, and a tool that can only express
the first is a drawing program with leather-coloured defaults.

## 1. What is missing, precisely

| Want | Today |
|---|---|
| A fold line | No way to create one. The type exists and nothing constructs it. |
| A marking line | Only as an accident: an *open* path or arc becomes one, on a part of its own. |
| A hardware hole | The `hardware` layer role exists. The feature kind does not. |
| Any of them on an existing part | Impossible. Every draw calls `addPart`. |

That last row is the real gap. A fold line on a part of its own is a "part" that can never be cut —
exactly the nonsense `shapePart`'s closed/open rule was written to avoid.

## 2. `HardwareHole`

```ts
export interface HardwareHole extends FeatureBase {
  readonly kind: 'hardware-hole';
  readonly hardwareType: 'rivet' | 'snap' | 'screw' | 'eyelet' | 'other';
}
```

**Its geometry lives in `source`**, as `{ kind: 'shape', shape: { type: 'circle', centre, radius } }`.

`docs/domain-model.md` §3.6 sketches it with its own `centre` and `diameterMm` fields. That sketch
predates `GeometrySource`, and following it would make `HardwareHole` the only feature whose
position does not live in `source` — which means `transformFeatures`, `translateFeatures`,
`transformShape`, hit-testing, rendering and the mirror arriving in 4.8 would each need a case for
it. As a circle shape, every one of those works the day this lands, and §3.6 gets corrected in the
same commit.

**The record stores a radius, the panel says diameter.** `ParametricShape.circle` is already
radius-based, and hardware is sold by diameter — a 4 mm rivet. Storing both spellings of one number
is a divergence waiting to happen, so the conversion lives in the editor, at the boundary where the
user's word becomes the model's.

**The radius is what gets quantised, not the diameter.** Invariant 8 quantises user input to
1e-4 mm, and quantising the typed diameter *before* halving puts the stored radius on a 5e-5 grid —
half off the grid every time the diameter's last digit is odd. The stored number is the radius, so
the radius is the number that must land on the quantum: halve first, quantise second.

`roleOf` gains `case 'hardware-hole': return 'hardware'`. The switch is exhaustive and returns
`LayerRole`, so the compiler finds every site that must learn the new kind.

## 3. Persistence — format version 3

Not a judgement call. `packages/persist/src/migrations/v1_to_v2.ts` records the rule in its own
header:

> The latitude taken in slices 3.6b and 3.7 — adding a field in place because nothing had shipped —
> is spent. From here, a new persisted variant means a version bump, a fixture, and a migration
> where one is needed.

So `hardware-hole` costs:

- `CURRENT_FORMAT_VERSION = 3`, with the `hardware-hole` variant added to the `feature` union in
  `schema.ts`.
- `migrations/v2_to_v3.ts` — an **identity**. No version 2 document can contain a hardware hole, so
  there is nothing in an old file to rewrite. It is registered anyway, because a gap in the chain is
  only discovered at the *second* bump, when it is expensive.
- `fixtures/format/v3.lcp`, committed, holding a hardware hole among the rest.
- `v1.lcp` and `v2.lcp` **never regenerated**. They are the only proof that an old file still opens.

## 4. Creation: one selector, not nine tools

A fold line can be drawn as a line, an arc or a polyline. The *kind* is orthogonal to the *drawing
primitive*, so a tool per combination is nine tools for three concepts.

`ToolContext` gains a `settings` member:

```ts
export interface ToolSettings {
  readonly drawAs: 'cut' | 'fold' | 'mark';
}
```

`App.tsx` owns the state and `ToolOptions` renders the selector — which is what `ToolOptions.tsx`'s
own comment anticipated ("tool settings are arriving shortly … without a designated home they end up
in the rail"). The rail stays modes-only, as the tool-palette spec requires.

The four sites that call `shapePart` / `pathPart` / `rectanglePart` — `rectangleTool`, `circleTool`,
`arcTool`, `polylineTool` — all route through one helper:

```ts
commitDrawn(ctx, nextId, { name, source }): boolean
```

The helper mints the ids it needs, because which ids it needs depends on the answer: `'cut'` makes a
part and a feature, `'fold'` and `'mark'` make only a feature. A caller that pre-minted a part id
would burn one on every fold line — harmless with ULIDs, but it would mean the call site claims to
know something it does not.

- **`drawAs: 'cut'`** — today's behaviour, unchanged: a new part, closed geometry becomes a cut
  contour, open geometry becomes a marking line.
- **`'fold'` / `'mark'`** — `addFeature` onto the target part.

Returning `false` lets the tool leave its own state alone when the commit was refused.

### The target part

The part owning the current selection. `Selection` holds feature ids, and `findFeature` already
returns the owning part, so this is a lookup and not a new concept.

- Exactly one part represented in the selection → that part.
- Nothing selected, or features from two different parts → **refuse**. Dispatch nothing, and say why
  in `notice()`, which already renders in the status bar.

Refusing beats guessing. A fold line silently attached to the wrong panel is invisible until the
leather is cut, which is the failure mode this project spends its effort avoiding.

**Why `'cut'` still makes a new part** rather than an inner contour on the selected one: inner
contours — card-slot windows, thumb scoops — are slice 4.3's business, and giving `'cut'` a
selection-dependent meaning here would change existing behaviour in a slice that is not about cut
contours. Noted in §9.

## 5. The hardware tool

A new palette entry under Draw: **Hardware**, key `H`. One click places one hole at the snapped
point. Options: diameter (default 4 mm) and type (default rivet). Same target-part rule, same
refusal.

**Punch presets, not a hardware catalogue.** Diameter is picked from the sizes a leatherworker
actually owns — 2, 2.5, 3, 3.5, 4, 4.5, 5, 6 mm — in a `punches.ts` beside `irons.ts` and for the
same reason: application configuration, with the millimetre value persisted so a file opens
identically on a machine that has never heard of the list. The list is deliberately **punch sizes
and not hardware**, because a list that named snaps and rivets would imply the app knows what hole a
line-24 snap needs. It does not, and will not until the hardware library in v1.1. `hardwareType`
records what the hole is *for*; the diameter records what it *is*.

**A hardware hole renders as a `pathItem`, not a `dots` item.** `dots` carries a radius in *pixels*,
which is right for stitch holes — a stitch hole is a punch mark whose visibility matters more than
its width at 15% zoom. A hardware hole is a 4 mm circle that will be punched at 4 mm and must print
at 4 mm, so it is a circle path in millimetres like any other geometry. This is invariant 1 applied
to hardware.

The overlay preview is the same circle at true diameter, so what the user sees before the click is
what lands.

## 6. Property editors

Three, registered in `featureEditors/index.tsx` beside the two that exist:

- **`FoldLineEditor`** — direction (mountain / valley) and a material thickness override that is
  **blank when not set**, and cleared to remove it. Not `0`: 0 mm reads as a claim that the leather
  has no thickness, which is a different and false statement from not having said. `NumberField`
  gained an opt-in `onClear` for this — without it an empty draft still reverts as a typo, so no
  other field changed behaviour. Nothing consumes thickness yet; it is editable because 4.1
  deliberately stored it, and an unreachable field is how stored-but-unreachable becomes
  stored-but-wrong.
- **`MarkingLineEditor`** — purpose (glue-area / alignment / logo / skive / other).
- **`HardwareHoleEditor`** — diameter, type, and centre X/Y.

### Names carry what the render cannot

**Mountain and valley look identical on screen.** `ROLE_STROKES` is keyed by layer role, so both
draw dash-dot green, and giving them separate strokes means per-feature styling that no other
feature has. A cardholder has two or three folds and the user has to tell them apart, so the
*name* carries it: a new fold line is called "Fold (valley)", not "Line". Same reasoning for the
other two — a marking line is named from its purpose ("Glue area"), and a hardware hole from its
type and size ("Rivet 4 mm"). The parts list is where these are distinguished, so the parts list is
where the distinction has to exist.

Renaming stays available: these are defaults at creation, not derived labels that fight the user.

## 7. Acceptance criteria

Slice 4.7 had no written criteria. These are them, and they are things a person can check by using
the app.

1. With a panel selected and **Draw as: Fold**, drawing a line across it adds a fold line **to that
   panel** — the parts list shows one part, not two — and it draws dash-dot green.
2. With **Draw as: Mark**, the same gesture adds a marking line to the selected part, drawn light
   grey.
3. With nothing selected, drawing in Fold or Mark mode changes the document not at all, and the
   status bar says a part must be selected first.
4. **Draw as: Cut** behaves exactly as it does today: a new part, closed → cut contour, open →
   marking line. Every existing test of the four draw tools passes unchanged.
5. The Hardware tool places a 4 mm rivet hole on the selected part with one click; it renders as an
   orange circle that measures 4 mm at any zoom.
6. Selecting a fold line shows direction and thickness; changing direction to mountain survives a
   save and reload.
7. A hardware hole's diameter survives a save and reload exactly — 4 mm comes back 4 mm, not
   3.999999.
8. `fixtures/format/v1.lcp` and `v2.lcp` still open, through the full migration chain, into the
   documents their tests assert.
9. Undo removes any of the three in one step, and redo brings it back on the same part.
10. Deleting a part's cut contour leaves its fold line alone — a fold line is drawn, not derived,
    so it has no source to be orphaned from.
11. A fold line drawn across a panel with snapping on starts and ends **exactly** on its edges, and
    the parts list names it "Fold (valley)", a marking line "Glue area", a hole "Rivet 4 mm" — three
    folds on a cardholder are told apart without selecting them.

## 8. Tests

Written before the implementation in `domain` and `document`, per `CLAUDE.md`.

**Property tests** (invariant 10):

- A hardware hole's circle has the requested diameter, within `EPS_MM`, for any centre in
  ±500 mm and any diameter in 0.5–50 mm.
- `roleOf` is total: every `FeatureKind` maps to a `LayerRole`, and hardware maps to a role for
  which `isCutting` is true — the laser export depends on it.

**Example tests:**

- `commitDrawn` targeting: one part selected → lands there; nothing selected → no command
  dispatched; two parts represented → no command dispatched. The refusal cases assert the store's
  revision is unchanged, not merely that no exception was thrown.
- Each add command lands the feature on the named part and undoes in one step.
- `persist`: a v3 round trip holding one of every feature kind; `v1.lcp` and `v2.lcp` still open;
  a hardware hole's radius survives byte-exact through `stableJson`.

**E2E:** draw a rectangle, select it, switch to Fold, draw across it, and assert one part with two
features and a dash-dot stroke in the display list. Then place a hardware hole and assert it appears
on the same part.

## 9. Out of scope, recorded so it is not relitigated

- **Inner cut contours** from a selected part — slice 4.3, per §4.
- **`MarkingLine.label`** — documented in §3.5, never implemented, nothing reads it. It stays
  unimplemented until something does.
- **`bendAllowanceMm`** and thickness compensation — v1.1, and the reason `materialThicknessMm` is
  already stored.
- **The hardware library** and `hardwareRefId` — v1.1. `hardwareType` is an enum, not a catalogue.
- **Mirror** of any of these — slice 4.8. They all inherit it free, which is the point of §2.
- **Reporting** ("6 × 4 mm rivet holes") — belongs with the validation panel, 4.12.
- **Rows of holes** — belt adjustment holes, a row of rivets along a strap. This is the canonical
  hardware task in leatherwork and one click per hole serves it badly: five adjustment holes at
  25 mm is five clicks and five corrections. It is left out deliberately rather than overlooked,
  because it is not a variation on a single hole — it is a *set*, distributed along a path at a
  pitch, which is what `StitchHoleSet` already is and what `geometry/ops/distribute.ts` already
  does. Recorded here so the one-off design is not stretched to cover it badly: when it comes, it
  comes as a derived set, and 4.7's holes stay what they are good at — snaps, single rivets, D-ring
  anchors.
- **Holes that track their part.** A hardware hole placed here is absolute: widen the panel and the
  hole stays put, which is the failure M3 fixed for stitch lines. That is acceptable *only* because
  §2 makes the fix additive — the geometry lives in `source`, which already has a `derived` variant,
  so "12 mm in from that edge" becomes a new `Derivation` on the same feature with no migration and
  no change to anything that reads it.
