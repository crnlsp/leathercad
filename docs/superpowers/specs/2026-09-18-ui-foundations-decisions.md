# UI Foundations — decisions, disagreements, and the final direction

**Date:** 2026-09-18
**Status:** Proposed — for review. Nothing implemented.
**Amends:** [UI Foundations](2026-09-17-ui-foundations-design.md) · follows
[the audit](2026-09-17-ui-ux-audit-and-visual-language.md)
**Superseded in part** by [paper reference and typography](2026-09-18-paper-reference-and-typography.md):
§2.3's page-guide argument, and the two-family typography in §5.

---

## 0. Your three refinements, accepted — with one correction

**Physical-mm dashes with readability constraints** — accepted, and §1.4 settles the constraint, but
**not as a min/max clamp**. A clamp distorts a dash *rhythm*, and the rhythm is what carries the
meaning. The rule is "true, or none". See the disagreement in §2.4.

**Selection halo, tested against every feature class** — done in §1.3. It survives, with **three
refinements it would not have had without the test**: hole sets, measurements and failed geometry
each needed a specific answer.

**"Drafting ground", not "card"** — accepted and adopted throughout, including the token names
(`--sheet-*` → `--ground-*`). The coordinate space is unbounded and the language should not imply
otherwise. One caveat in §2.3.

**"Same semantic meaning, expressed appropriately for the medium"** — accepted as the governing
principle, and it is better than the sentence it replaces. But applied without a boundary it would
license the exact bug the audit just found, so §3 draws that boundary: what is **invariant** across
contexts, and what is free to **vary**.

---

## 1. The six decisions from §15

### 1.1 Base size 14 px, up from 13

**Decision.** The interface base moves 13 → 14 px, with the scale in the foundations spec §4.2.

**Rationale.** The current UI runs 10–14 px — five sizes inside a 4 px range, which produces no
hierarchy, only unevenness. Field labels at 11 px are below comfortable reading size for an
instrument used for hours, and Plex Sans has a smaller apparent x-height than the system faces this
was tuned against, so a like-for-like swap at 13 px would *lose* legibility.

**Trade-offs.** Every panel gets taller. The properties panel is the tightest: at 14 px with 20 px
line height, the stitch-hole panel grows roughly 15 % and will need its label column tightened from
88 px and its `Measured` block trimmed (which §1 of the audit says should shrink anyway — most of
those rows are noise). Density fans will find it airy.

**Recommendation.** **Take it.** But pair it with a **density token** from day one —
`--density: comfortable | compact`, where compact returns row heights to roughly today's while
keeping the *type* at 14. That way the decision is reversible per user without re-deriving the
scale, and we are not guessing on their behalf.

---

### 1.2 Warning moves from `#E0A93A` to orange `#E08A2E`

**Decision.** Warning leaves the gold family. Accent keeps `#C9A227`; hardware has already left for
violet.

**Rationale.** Today four near-identical ambers mean four unrelated things and two of them —
selection and hardware — co-occur on the same drawing. Accent and warning is the pair that co-occurs
most often in chrome: a focused control beside a warning badge.

**Trade-offs.** Orange sits closer to `--error` red than gold does, and error/warning co-occur in the
problems list constantly. That is the collision we would be trading into, and it is a worse one if
colour is the only carrier.

**Recommendation.** **Take it, but not on colour alone.** Severity is *always* colour **plus a
glyph** — filled triangle for error, hollow triangle for warning, dot for info — in the problems
list, the badges, the property panel and the canvas marker. Then orange-versus-red never has to be
told apart by hue, which also fixes the photocopy and colour-blindness cases the foundations spec
already commits to. With the glyph in place I would go slightly further from red than `#E08A2E`:
**`#D9891F`**, a touch more saturated and yellower.

---

### 1.3 Selection as a halo, not a repaint — tested

**Decision.** Selection keeps the feature's role colour and adds a `--tan-ink` halo beneath it,
rather than repainting the geometry amber.

**Rationale.** Today selecting a stitch line repaints it in selection amber, so it stops looking like
a stitch line — you lose the information you selected it to work on, exactly when you are about to
act on it. Selection is a *state*; states add, they do not overwrite identity (foundations §3).

**The test you asked for.** Nine classes. Six pass unchanged; **three needed a specific answer**, and
finding them is what the test was for.

| Class | Result |
|---|---|
| **Cut edge** — near-black, 1.75 px | Passes. Tan behind dark ink on a light ground is unambiguous |
| **Stitch line** — blue, dashed | Passes. A *continuous* halo under a dashed line reads as a highlighter behind it, and shows the whole path, which is an improvement |
| **Fold** — green, dash-dot | Passes. Direction ticks sit above the halo and stay legible |
| **Marking** — grey, 1 px, low contrast | Passes, and benefits most: the halo is what makes a faint line findable |
| **Hardware** — violet ring | Passes. Halo as a ring around the ring |
| **Derived features** | Passes. The link tick is a small role-coloured mark on the path; the halo is a broad tan band beneath. No confusion |
| **Stitch holes** ⚠ | **Needed an answer.** A halo per slit is a cloud of tan blobs. **The halo follows the line the holes are placed along**, and the slits are untouched — which is also what the feature *is*: holes along that line |
| **Measurements** ⚠ | **Needed an answer.** Haloing extension lines, arrows and text is mush. **The halo follows the dimension line only**; extension lines and the number are untouched |
| **Failed / invalid geometry** ⚠ | **Needed an answer.** A failed feature has no geometry — under foundations §8.5 its source draws normally and the failure is a marker. So **the halo goes on the marker, never on the source**, which is the healthy feature and is not selected. This falls out of 4.12's "select the subject, frame the evidence" exactly |

**Trade-offs.** A 5 px halo on a dense hole set at working zoom adds visual weight where the drawing
is already busiest — mitigated by haloing the line rather than each hole. And selection becomes
*less* loud than today, which is a real change for anyone used to the amber repaint.

**Recommendation.** **Take it, with the three refinements**, and add one more that the test surfaced:
**selection is expressed differently on the two grounds** — a halo on the drafting ground, a left
edge plus tint in the tree and property header. That is your own "appropriately for the medium"
principle applied inside a single state, and it needs saying or someone will try to put a halo on a
list row.

---

### 1.4 Dash patterns in millimetres

**Decision.** Dash *rhythms* are stored in millimetres, shared by screen and export. Stroke *width*
stays screen-constant.

**Rationale.** The audit found the screen and the exporter already disagree — a marking line is solid
on screen and dotted `[1, 1.5] mm` on paper — and CLAUDE.md promises the screen previews the paper.
One table for both media is the only version that cannot drift.

**Your principle, adopted verbatim:** *at 1:1, screen and printed geometry correspond physically; at
other zooms, preserve the same semantic visual language while allowing readability constraints.*

**One honesty correction.** There is no screen calibration today. `Viewport.scale` is device pixels
per millimetre, and `docs/printing.md` §8 calibrates the **printer**, not the display. So "1:1 on
screen" is currently a nominal-DPI approximation, not a measured one. What holds unconditionally is
the *relative* truth: a 2 mm dash is always a fifth of a 10 mm grid square. A literal 1:1 needs a
screen-calibration step — worth doing, post-1.0, and it would make this claim exact.

**Trade-offs, and the readability constraint.** Zoomed out, a 1 mm marking dash becomes sub-pixel and
turns to grey mush.

**Recommendation.** **Take it — with a lower bound only, and as "true or none" rather than a clamp.**
See §2.4 for why I am declining the upper clamp and the distorting lower one.

```
render the true mm pattern   when  pxPerMm × smallestSegmentMm ≥ 1.5 px
render solid                 otherwise
```

Self-tuning per role: stitch `[2,2]` keeps its dash to 0.75 px/mm, fold `[7,2,1.5,2]` to 1.0, marking
`[1,1.5]` to 1.5. Below that the line is solid and is told apart by colour and by the width order,
which is exactly the overview band the foundations spec already defines. **Either the dash is true or
there is no dash — it is never a distorted approximation of one.**

---

### 1.5 The whole viewport is the drafting ground; no page boundary

**Decision.** The entire canvas viewport is the light drafting ground. No page rectangle until
pagination introduces one.

**Rationale.** The coordinate space is unbounded. Drawing a page edge would imply a page the document
does not have, and would make one arbitrary paper size look like part of the model. Your terminology
correction is right and I have adopted it — including in the token names.

**Trade-offs.** The most common failure in pattern making is discovering *at export* that a piece does
not fit the paper, and 4.12's `exportReadiness` reports that after the PDF is written.

**Recommendation.** **Take it, with one addition I would argue for.** Design a **page-guide overlay**
now — off by default, toggled from the status bar, reading the existing `packages/print` pagination —
and ship the capability in F.5 even if the toggle stays off. It is not an implied boundary: it is a
drafting aid the user asks for, it appears only when asked, and it is the one thing that makes the
1:1 promise visible *while designing* rather than at export. See §2.3.

---

### 1.6 F.1–F.3 before F.4–F.7 — structure before styling

**Decision.** Systemic interaction, then layout architecture, then the viewport fix; only then
tokens, colour, icons and leather treatment.

**Rationale.** F.4–F.7 style containers that F.2 moves. Doing them first means doing them twice.
F.1 is independent of both and unblocks the largest correctness gain — `ReasonedButton` retires a
whole class of silent refusals.

**Trade-offs.** F.1 and F.2 produce **no visible improvement in the product's look.** Three steps
land before anything looks better, which is uncomfortable if anyone is watching, and it puts the
riskiest structural change (F.2) before the reward.

**Recommendation.** **Take it**, with one sequencing change I would make: **move the typography half
of F.4 to the front, before F.1.** Applying the vendored face and the tabular figures is a one-line
fix plus a token file; it touches no container, it cannot conflict with F.2, and it is the single
largest visible change per line of code in the whole programme. It also means F.1's new components
are authored in the final type from the start rather than restyled later.

So: **F.0 typography → F.1 interaction → F.2 layout → F.3 viewport → F.4 remaining tokens →
F.5 colour and canvas → F.6 icons → F.7 leather treatment.**

---

## 2. Where I think your direction is worse than an alternative

You asked for this explicitly, so here it is plainly. Four items.

### 2.1 Tool prominence by frequency — I would not do it

You asked whether frequently used tools should be visually stronger than rarely used ones. **I think
that is worse than the alternative, and I would decline it.**

- **It guesses a workflow that varies.** A maker doing wallets lives in Rectangle and Stitch; someone
  doing a knife sheath lives in Arc and Polyline. Whatever we rank, we are wrong for half the users.
- **It breaks what the palette exists to teach.** The palette's job is "these are modes: each changes
  what a click does, and one is active at a time." Unequal buttons say the opposite — that some are
  more like actions, or more important as objects. The current design already made this argument for
  excluding Undo and Delete from the rail, and it holds here.
- **If it ever adapted to actual usage, it would be worse still.** A palette whose geometry moves
  under the user destroys the muscle memory that makes a palette fast.
- **The convention is uniform for good reason.** No professional drawing tool sizes its tools by
  frequency.

**What I would do instead — two things that create real hierarchy from information rather than a
guess:**

1. **Group by meaning, and separate the home mode.** *Select* stands alone (it already does), then
   **Draw**, then **Place** (Hardware, Text, Measure — things put down with a click rather than
   dragged out), then **Modify**. That is four groups carrying a true fact — how the tool is *used* —
   and it also fixes the drag-versus-click-click confusion from the audit by making it structural.
2. **Let the active work provide the prominence, dynamically.** §4 proposes that the draw tools take
   the colour and dash of the active *Draw as*. Choose Fold, and Rectangle/Line/Arc render in fold
   green dash-dot. The palette then emphasises what you are actually doing right now, which is better
   than any static ranking and costs nothing when you switch.

### 2.2 "Don't optimise for visual sameness" — right in general, dangerous for dash rhythm

Your principle is better than the one it replaces and I have adopted it. But applied without a
boundary it **licenses exactly the bug we just found**: someone reasonably concludes that a marking
line may be solid on screen (legible at working zoom) and dotted on paper (distinguishable in ink),
because those are different media with different requirements. That is the current behaviour, and it
is a defect.

The boundary is in §3: a dash **rhythm** is a *code*, not a rendering choice. Distorting it changes
what the line says. Size, weight, detail level and even the presence of colour may all vary by
medium; rhythm may not.

### 2.3 "No page boundary" — I would design the overlay now, off by default

A small one, and I may be wrong. Your instruction is right about the model: the space is unbounded.
But a *toggled, non-default* page guide is not a claim about the model — it is the same kind of aid
as the grid, which also is not part of the model.

My worry about deferring it entirely: once the drafting ground is light and paper-coloured, users
will read it as paper anyway, and the first question will be "where does the page end?". Better to
have the honest answer available than to have the ground imply something we refuse to show. Cost is
low — `packages/print` already paginates.

### 2.4 Min **and** max dash clamps — I am declining the max, and reshaping the min

You asked me to consider min/max screen representation. I have, and I think a clamp is worse than the
alternative on both ends.

- **An upper clamp is actively wrong.** Long dashes when zoomed in are not a readability problem,
  they are the point: you zoomed in to inspect the stitching, and the dash *is* 2 mm. Capping it
  would make the one view where fidelity matters most the one view that lies.
- **A lower clamp distorts the rhythm**, which §2.2 says is the one thing that must not vary. A
  marking dash rendered 1.5× true to stay visible is a marking line claiming a spacing it does not
  have — and at that zoom nobody can measure it anyway, so the distortion buys nothing.

**"True, or solid"** (§1.4) gets the same readability outcome without ever drawing a rhythm that is
not the real one. It is also simpler to implement and to test.

**Where a floor *is* acceptable, and why the distinction is principled:** a stitch hole's *size* may
be floored at 3 px in the working band, because size is a measurement rather than a code — flooring
it is the same lie the product already accepts for screen-constant stroke width, and it never changes
what the thing is. A rhythm is a code. Floor sizes; never floor rhythms.

---

## 3. The boundary: what is invariant, what may vary

Your governing principle, made operable. This table is what stops "expressed appropriately for the
medium" from becoming drift.

| Property | Invariant across rail, tree, canvas, diagnostics, export | May vary by context |
|---|---|---|
| **Hue identity** | ✅ A stitch line is the stitch hue wherever colour exists | Greyscale print substitutes the **width order**, not another hue |
| **Dash rhythm (ratio)** | ✅ Never distorted. `[2,2]` is 1 : 1 everywhere | It may be **absent** (solid, below the legibility threshold) — absent, never wrong |
| **The distinguishing device** | ✅ Hatch for cut-out, ticks for fold, slant for holes, arrowheads for a dimension | Simplified at small sizes — three slits in a 16 px mark, eighty on the canvas |
| **Relative weight order** | ✅ Cut heaviest, then hardware, then stitch/fold, then marking/annotation | Absolute widths differ: px on screen, mm on paper |
| **Level of detail** | — | Free. A 16 px mark shows three slits; overview zoom shows none |
| **Absolute size** | — | Free, with documented floors |
| **Presence of colour** | — | Free. Paper is greyscale by design |

**One sentence for the codebase:** *what a line is may not change; how much of it you can see may.*

---

## 4. The tool palette — icon audit and structure

### 4.1 The structural finding

Of eleven tools, **nine are generic geometry** — Select, Rectangle, Circle, Arc, Line, Polyline,
Text, Rotate, Scale — and only two are leather-specific: Hardware and Measure.

**That is why the app reads as a vector editor.** Its primary palette is a vector editor's palette.
The leather meaning lives in the *Draw as* strip, a secondary control that appears and disappears.

This is a structural identity problem, not a styling one, and the honest fix is not to restructure the
modes — the existing design deliberately separated *what a click does* from *what the result is
called*, because a fold can be drawn with any of five tools and a tool per combination would be
fifteen buttons for three ideas. That reasoning still holds.

**The fix is to make the leather setting primary without moving it:**

1. **The draw tools take the role of the active *Draw as*.** Choose *Fold*, and the Rectangle, Circle,
   Arc, Line and Polyline icons render in fold green with the fold dash-dot. Choose *Stitch*, they go
   blue and dashed. The palette then states what you are about to make, and the coupling between the
   two controls — currently invisible, and the cause of several audit findings — becomes the most
   visible thing about them.
2. **The options row is always present.** Reserving its height removes the canvas jump *at its source*
   (as well as F.3 fixing the viewport), and keeps the leather setting on screen instead of appearing
   and vanishing with the tool.
3. **The *Draw as* chips carry the Tier 2 marks** — the outline mark, the stitch mark, the fold
   valley mark. Six chips that each show the line they make.

### 4.2 Icon assignment

| Tool | Tier | Mark |
|---|---|---|
| Select | 1 | Pointer |
| Rectangle | 1 | Square **with corner nodes** |
| Circle | 1 | Circle with centre + radius node |
| Arc | 1* | Three-point arc with its three nodes |
| Line | 1 | Segment with endpoint nodes |
| Polyline | 1 | Three-segment path with vertex nodes |
| Rotate | 1 | Rotation arc about a pivot |
| Scale | 1 | Corner handles |
| Text | 1 | Type mark |
| **Hardware** | **2** | The hardware-hole mark — ring with centre cross |
| **Measure** | **2** | The measurement mark — extension lines and arrowheads |

\* Arc has no clean equivalent in a general stroke set and will be drawn, but **in the generic family's
visual language**, not as a LeatherCAD mark.

**The one detail that makes the generic set feel authored:** every geometry icon shows its
**construction nodes** — the corner, the centre, the three points of an arc. That is a drafting
convention, it distinguishes *Rectangle the tool* from *a rectangle*, and it gives the adopted set a
family resemblance to the Tier 2 marks without drawing custom versions of solved icons. It is the
"specimen" principle applied to geometry: the icon shows how the shape is *made*.

### 4.3 Layout: icon **and** label, collapsible

You want the icon to work without reading and the label and shortcut to stay visible. Both, with a
collapse:

```
Expanded — 152 px, default            Collapsed — 52 px
┌──────────────────────────┐          ┌────┐
│ ▣  Select            V   │          │ ▣ ᵥ│
│                          │          ├────┤
│ DRAW                     │          │ ▭ ᴿ│
│ ▭  Rectangle         R   │          │ ○ ᶜ│
│ ○  Circle            C   │          │ ◠ ᴬ│
│ ◠  Arc               A   │          │ ╱ ᴸ│
│ ╱  Line              L   │          │ ⌇ ᴾ│
│ ⌇  Polyline          P   │          ├────┤
│                          │          │ ◎ ᴴ│
│ PLACE                    │          │ T ˣ│
│ ◎  Hardware          H   │          │ ⟷ ᴹ│
│ T  Text              X   │          ├────┤
│ ⟷  Measure           M   │          │ ↻ ᵀ│
│                          │          │ ⤢ ˢ│
│ MODIFY                   │          └────┘
│ ↻  Rotate            T   │
│ ⤢  Scale             S   │
└──────────────────────────┘
```

- **Expanded is the default.** Icon 20 px · label `--t-label` · shortcut in a `kbd` badge · 30 px rows.
- **Collapsed** keeps the shortcut as a corner badge; the tooltip carries name and shortcut.
- **Auto-collapses below 1200 px**, and the user's own toggle persists above it.
- **A column of its own**, so the rail never again competes with Parts for vertical space — which was
  audit finding 3.3.
- **All buttons identical in size and weight**, per §2.1. Groups and order carry the hierarchy.

*Considered and rejected:* a two-column icon grid inside the existing left column. It is more compact,
but it re-couples the rail to Parts for height and needs a second layout below the breakpoint. One
layout with one variable width is worth the pixels.

---

## 5. The final direction

### Visual identity

A **precision workshop instrument**: a light drafting ground inside a dark application shell, crisp
hairlines, flat chrome, one accent. Identity comes from semantics — how a cut, a fold and a stitch
line are drawn — never from material imagery. The forbidden list (foundations §11) is normative:
no glassmorphism, blur, gradients, giant radii, emoji, animation beyond 120 ms on colour,
grey-on-grey, dashboard styling, leather or paper textures, colour as the only carrier of meaning.

### Typography

**One family: IBM Plex Sans**, 400/500/600. Superseded on 2026-09-18 — the second family was dropped
([why](2026-09-18-paper-reference-and-typography.md) §2.2): Plex Sans digits are already tabular at
600 units, so a mono would add texture rather than steadiness, and the same measurement appears in
the panel and on the drawing, where it must be the printed face. Base **14 px**. Nine tokens from
`--t-micro` 11/15 to `--t-dialog` 19/26. Measurements are one weight above body, never another face.
No uppercase with letter-spacing anywhere. The unit sits in a reserved 28 px column. A `--density`
token so row heights can compact without re-deriving the scale.

### Colour planes

Four, and they never borrow from each other. **Shell**: warm-biased greys plus veg-tan `#C9A227`,
which means only *the user's current focus*. **Ground**: `#F1EEE8` with three grid tiers.
**Geometry**: cut `#1D2126`, stitch `#2F6690`, fold `#2E7D53`, hardware `#5B4CA8`, measurement
`#8A5A2B`, marking `#7A7468`, construction `#B6AD9B`. **State**: selection takes the accent
(`--tan-ink` `#A8810E` on the ground), error `#E5675F`, warning `#D9891F`, info `#6F9FD8` — and
**severity is always a colour plus a glyph**, never a hue alone.

### Icon system

Two tiers. **Tier 1** adopts one stroke set for ~25 generic verbs and the nine geometry tools; every
geometry icon shows its construction nodes. **Tier 2** is eleven LeatherCAD marks — piece, cut edge,
cut-out, stitch line, stitch holes, fold valley, fold mountain, marking, seam allowance, mirror across
fold, hardware hole, measurement. 16 px box, 1.5 px stroke, round caps, no fill except where fill
means *punched*; a state changes colour, never shape. No custom replacements for generic actions.

### Feature and line language

One table defines every role once, for both media. Width is screen-constant; **dash rhythm is true
millimetres, rendered true or not at all**. Distinguishing devices carry meaning where colour cannot:
inward hatch on cut-outs, direction ticks on folds, slant on stitch holes, arrowheads on dimensions.
Relationships have one word each: **Follows · Mirrors · Mirrors … across · Measures**. Derived
geometry keeps its role colour and gains a link tick. The invariant/variable table in §3 governs how
far expression may adapt.

### Canvas

An unbounded **drafting ground** — no page rectangle; an optional page-guide overlay, off by default
(§2.3). Three grid tiers at 1 / 10 / 100 mm, each dropping out at the zoom where it would become
texture. Rulers in Mono with a cursor tick on both axes. Three zoom bands for detail, with meaning
constant across them. Anchors on hover in every tool. Snap feedback names what it caught —
`corner · Outer edge`. A failure is a marker with a leader, never red drawn over healthy geometry.
A collapsible legend in the language of the drawing.

### Selection and interaction states

**Selection adds, never replaces**: a `--tan-ink` halo beneath the geometry on the ground, a left edge
plus tint in the tree and property header. Hole sets halo their line; dimensions halo the dimension
line; a failed feature halos its marker. Focus is a 2 px accent ring on `:focus-visible` only.
**Disabled renders its reason** — `ReasonedButton`, fed by the refusals the domain already produces.
Motion is 120 ms on colour alone, zero under `prefers-reduced-motion`. Refusals are said where the
thing happened: near the pointer for a gesture, under the control for a control, in the drawer for a
diagnostic.

### Panel and layout system

`rail | parts | canvas + options + problems drawer | properties`. The rail is its own column,
**152 px expanded / 52 px collapsed**, auto-collapsing below 1200 px, never competing for height.
Parts takes the full remaining left column; names wrap rather than truncate; row actions move to
hover. The options row is **always present**, which removes the canvas shift at its source. Problems
is a full-width collapsible drawer under the canvas. Properties is 288 px with a sticky header
carrying the feature's mark, name and badges. **No panel is ever removed at any window size**;
minimum supported 860 × 600. Three radii, one 4 px spacing rhythm, two elevation steps — and only
dialogs cast a shadow.

### Leathercraft identity

The things that make the answer to the wordmark test *yes*: true-size slanted stitch slits at the
iron's angle; seam allowance drawn as the band it physically is; folds that show which way they fold;
cut-outs hatched inward; dimensions drawn like drafting; the parts tree reading *Outer edge ▸ Stitch
line ▸ Stitch holes* in leathercraft marks; the iron on the pattern as a quiet caption
(`88 holes · 3.85 mm · KS Blade`); millimetres in Mono that never move; and the draw tools wearing the
role they are about to create.

---

## 6. The wordmark test, re-run against this direction

> Remove the logo. Does the visual language still strongly suggest a leather pattern application?

**Yes** — and specifically because of these, none of which a general drawing tool would show:

1. Stitch slits at a pricking iron's real angle, spacing and size.
2. A seam allowance rendered as the band of material between stitch line and edge.
3. A fold that states valley or mountain on the drawing itself.
4. *Iron · Pitch · Fit · Corners · Runs 19 · 26 · 18 · 26* in a panel.
5. A parts tree in the vocabulary of pattern pieces, with marks to match.
6. `88 holes · 3.85 mm · KS Blade` captioning a piece the way a maker writes it on card.
7. A drafting ground and grid that previews the printed pattern rather than inverting it.

Items 1, 2, 4 and 6 are the ones that would be hard to fake without the model underneath — which is
the point. **The identity is the product's knowledge made visible.**

---

## 7. Still open

1. **`--density` as a shipped token** (§1.1) — worth it now, or after people have used 14 px?
2. **Warning at `#D9891F`** with the severity glyph (§1.2) — confirm the glyph requirement, since it
   is what makes the hue shift safe.
3. ~~**The page-guide overlay**, off by default (§2.3)~~ — superseded by the better-specified
   [paper reference](2026-09-18-paper-reference-and-typography.md) §1.
4. **F.0 typography first** (§1.6) — one step ahead of interaction, against the strict
   structure-before-styling order.
5. **Draw tools taking the active role's colour** (§4.1) — the strongest identity idea in this
   document and also the most unusual; I would like it challenged before it is built.
