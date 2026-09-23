# UI Foundations — the LeatherCAD design system

**Date:** 2026-09-17
**Status:** Proposed — for review. Nothing implemented.
**Amended 2026-09-18** by [the decisions record](2026-09-18-ui-foundations-decisions.md): terminology (*drafting
ground*, not *card*), the dash legibility rule, the selection refinements, the rail, and F.0 — and by
[paper reference and typography](2026-09-18-paper-reference-and-typography.md): **one type family, not
two**, and the paper reference in place of the page-guide overlay.
**Follows:** [the UI/UX audit](2026-09-17-ui-ux-audit-and-visual-language.md)
**Gate:** an implementation checkpoint between the Phase 4 audit and Phase 5. Phase 5 features
**consume** this; they do not extend or amend the visual language on their own.

---

## 1. What this document is for

One rule decides every question below:

> **The same operation has the same visual meaning everywhere** — in the tool rail, the parts tree,
> the property panel, the diagnostics list, on the canvas, and in ink on the printed pattern.

That is the *drafted line* as a semantic principle rather than a rendering trick: the appearance may
adapt to size and zoom, but the meaning may not. A stitch line is recognisably a stitch line at 16 px
in a tree row and at 0.15 mm on paper.

And one test decides whether the work succeeded:

> **Remove the wordmark from a screenshot. Is this still obviously software for making leather
> patterns?**

Today the honest answer is no. After this work it must be yes — through visual semantics, never
through leather imagery.

---

## 2. A finding that settles the geometry language

Before designing anything I compared what the screen draws with what the exporter prints. **They
disagree, in a way that breaks the product promise.**

| Role | Screen (`render/displayList.ts`) | Paper (`export/scene.ts`) |
|---|---|---|
| `mark` | **solid** | dotted `[1, 1.5] mm` |
| `construction` | **solid** | dotted `[1, 1] mm` |
| `stitch` | `[4, 3] px` — ratio 1.33 : 1 | `[2, 2] mm` — ratio 1 : 1 |
| `fold` | `[7, 3, 2, 3] px` | `[7, 2, 1.5, 2] mm` |

A marking line is solid on screen and dotted on the pattern. Two roles have different rhythms in the
two media. CLAUDE.md promises the screen previews the paper; here it does not.

### The resolution: width is pixels, dash is millimetres

- **Stroke width stays screen-constant.** A cut line must remain a visible hairline at any zoom. This
  is already the rule and it is right.
- **Dash patterns become true millimetres**, read from one table shared by both media. Then a 2 mm
  dash is 2 mm on screen at 1:1 and 2 mm on paper, and zooming in shows the real rhythm.

This is the single change that makes the canvas an honest preview, and it means **one table defines
every line once** (§8).

**The legibility rule is "true, or none" — never a clamp.** A dash *rhythm* is a code: distorting it
makes a line claim a spacing it does not have. So:

```
render the true mm pattern   when  pxPerMm × smallestSegmentMm ≥ 1.5 px
render solid                 otherwise
```

Self-tuning per role, and the line is then told apart by colour and by the width order. **Sizes may be
floored; rhythms never are** — see the decisions record §2.4 for why the distinction is principled.

One honesty note: there is no screen calibration today — `Viewport.scale` is device pixels per
millimetre, and `docs/printing.md` §8 calibrates the printer. What holds unconditionally is the
*relative* truth: a 2 mm dash is always a fifth of a 10 mm grid square. A literal on-screen 1:1 needs
a screen-calibration step, post-1.0.

### Where the tokens live

CSS custom properties cannot reach a canvas backend, so a palette defined only in `styles.css` will
drift from `packages/render` within one slice.

**One source of truth: `packages/render/src/theme/`.** It exports the palette, the role table and the
metric tokens. `packages/export` already imports `render`, so paper reads the same table.
`apps/desktop` imports it and writes the values onto `:root` as custom properties at startup, so CSS
consumes the same numbers rather than a hand-kept copy.

**Audit test, in 4.12's idiom:** every `LayerRole` has a screen style and a print style; their dash
patterns are the same array; every token named in CSS exists in the theme module. Drift fails the
build rather than waiting for someone to notice a dotted line on paper.

---

## 3. Visual hierarchy

Four planes. **They never borrow from each other.** This is the rule that fixes the four ambers.

| Plane | Contains | Never |
|---|---|---|
| **Shell** | Dark chrome greys; the veg-tan accent for *the user's own current focus* — active tool, focus ring, primary action | Never carries a severity or a geometry meaning |
| **Ground** | The light drafting surface: ground, grid tiers, rulers | Never used for chrome |
| **Geometry** | What the leather is made of: cut, stitch, holes, fold, marking, hardware, measurement, construction | Never uses the accent or a severity colour |
| **State** | Selection, hover, focus, error, warning, info | Never replaces a geometry colour — it is added to it (§8.4) |

Reading order on screen, and the order the layout encodes:

**what I am doing** (rail) → **what I have made** (parts) → **the work** (canvas) → **what is wrong**
(problems) → **the numbers** (properties).

---

## 4. Typography

### 4.1 The faces

**One family: IBM Plex Sans.** It is already vendored, and it is the face `packages/typography`
extracts outlines from — so the chrome, the canvas captions and the printed PDF are one voice by
construction.

**The second family was proposed and dropped** ([why](2026-09-18-paper-reference-and-typography.md)
§2.2). Plex Sans digits are **already tabular** — every digit has an advance of 600 units in the
extracted outlines — so a mono would add texture, not steadiness. And a measurement appears in the
property panel *and* on the drawing; the drawing prints, so it must be Plex Sans, and a mono field
would show one number in two voices.

**Vendoring work.** Today only `IBMPlexSans-Regular.woff` is present and the UI never applies it. Add
Plex Sans **500** and **600** — two files in `assets/fonts/`.

**ADR 0011 needs no amendment**, since nothing outside the one vendored typeface is introduced.

### 4.2 The scale

Base moves **13 → 14 px**. Thirteen is too small for an instrument used for hours, and the current
range — 10, 11, 12, 13, 14 — is five sizes inside 4 px, which is noise rather than hierarchy.

| Token | Size / line | Weight | Face | Tracking | Used for |
|---|---|---|---|---|---|
| `--t-dialog` | 19 / 26 | 600 | Sans | −0.01em | Dialog titles |
| `--t-panel` | 16 / 22 | 600 | Sans | −0.01em | Panel titles |
| `--t-strong` | 14 / 20 | 600 | Sans | 0 | Section headings, feature names, part names |
| `--t-body` | 14 / 20 | 400 | Sans | 0 | Body, refusals, problem messages |
| `--t-label` | 12 / 16 | 500 | Sans | 0 | Field labels, tree rows, chips |
| `--t-micro` | 11 / 15 | 500 | Sans | +0.02em | `kbd`, badge counts, captions |
| `--t-num-lg` | 17 / 22 | 500 | Sans | 0 | The one number a panel is about |
| `--t-num` | 14 / 20 | 500 | Sans | 0 | Every measurement in a field or a list |
| `--t-num-micro` | 11 / 14 | 500 | Sans | 0 | Ruler ticks, status bar, canvas dimensions |

### 4.3 Rules

1. **No uppercase with letter-spacing, anywhere.** It is the loudest generic-dashboard signal in the
   current UI. Headings get sentence case and weight.
2. **A measurement is set one weight above body — 500 against 400** — and never in another face.
   Millimetres, degrees, coordinates, pitch, spacing, diameters, run lengths, ruler ticks, the live
   dimension. Counts that are not measurements — a badge's "2 problems" — stay at body weight.
3. `font-variant-numeric: tabular-nums lining` everywhere numbers appear. Plex Sans is already
   tabular by default; the declaration states the intent and protects against a future face change.
4. **A proper minus** `−` (U+2212), never a hyphen. **It is not in the extracted glyph set today** —
   add it when regenerating, or a negative coordinate on a pattern falls back or raises
   `TEXT_GLYPH_MISSING`.
5. **The unit is part of the number component**, set in `--t-label` weight 400 in `--text-dim`, in a
   **28 px reserved column**. This fixes the clipped `103.38|m` structurally rather than by widening
   one input.
6. Nothing below 11 px. Field labels move 11 → 12.
7. **Weights 400, 500, 600 only.** Not 300 — too thin at 11–12 px, worse on the dark shell. Not 700.
   Light text on a dark ground looks heavier, so the same token may render 400 in the shell and 500
   on the drafting ground.
8. **No small caps.** Plex Sans has none; never synthesise them.
9. Running prose in panels wraps at ~44 ch; problem messages and refusals at ~60 ch.

---

## 5. Colour

### 5.1 Shell — the application

| Token | Value | Used for |
|---|---|---|
| `--shell-900` | `#14161A` | Status bar, drawer well |
| `--shell-800` | `#1B1D21` | Base chrome |
| `--shell-700` | `#22252A` | Panels, toolbar, raised surfaces |
| `--shell-600` | `#2A2E34` | Control rest |
| `--shell-line` | `#32363D` | Hairlines |
| `--text` | `#E6E8EA` | Primary text |
| `--text-dim` | `#8B929B` | Labels, secondary |
| `--text-mute` | `#6B7079` | Disabled, placeholder |

Warm-biased greys, not neutral — they sit under a tan accent and beside a card ground.

### 5.2 Ground — the drafting surface

Warm-neutral off-white. Restrained: no texture, no gradient, no paper fibre, no vignette.

| Token | Value | Used for |
|---|---|---|
| `--ground` | `#F1EEE8` | The canvas ground |
| `--ground-fine` | `#E2DDD3` | 1 mm grid |
| `--ground-major` | `#D2CBBD` | 10 mm grid |
| `--ground-hundred` | `#BEB5A3` | 100 mm grid |
| `--ground-axis` | `#A89E88` | The x = 0 / y = 0 axes |
| `--ink` | `#1D2126` | Cut lines, part names |
| `--ink-dim` | `#6E695E` | Canvas captions, ruler labels |

`--ink` on `--ground` is above 14 : 1. `--ink-dim` on `--ground` is 4.6 : 1.

**The whole canvas viewport is the drafting ground** — not a card or a sheet floating on a
workbench. The model's coordinate space is unbounded, and drawing a page edge would imply a page the
document does not have and make one arbitrary paper size look like part of the model.

A **paper reference** is the one permitted exception, and it is off by default: four corner ticks
marking the **printable area** — not the sheet — anchored to the selected part, drawn beneath the
geometry in the 100 mm grid's own value, and hidden below 2 px/mm. Crop marks read as a reference
where an outline reads as a boundary, and geometry is never clipped by it.

Only the *visual language* belongs in Foundations. The picker, the presets and the contextual
suggestion need a page setup in the project — which does not exist, and which is why every export
today is A4 portrait. See [paper reference and
typography](2026-09-18-paper-reference-and-typography.md) §1.

### 5.3 Accent — two steps, one meaning

The accent must work on both grounds, so it has an on-dark and an on-light value. It means exactly
one thing: **the user's own current focus.**

| Token | Value | Used for |
|---|---|---|
| `--tan` | `#C9A227` | On shell: active tool, focus ring, primary fill |
| `--tan-ink` | `#A8810E` | On the ground: selection halo, anchors, active guides |
| `--on-tan` | `#1D2126` | Text on a tan fill |

### 5.4 State

Severity lives in the **shell** plane. Where it must appear on the canvas it does so as a **marker
glyph**, never by recolouring geometry (§8.5) — so colour is never the only carrier of meaning.

| Token | On shell | On the ground |
|---|---|---|
| `--error` | `#E5675F` | `#C0392F` |
| `--warning` | `#D9891F` | `#B5651A` |
| `--info` | `#6F9FD8` | `#3C6FA8` |

**Warning moves from `#E0A93A` to an orange**, `#D9891F`. It sat one step from the accent, and the two
co-occur constantly. Hardware vacates the amber family entirely (§8), so the orange is free.

**Severity is always a colour *plus a glyph*** — filled triangle for error, hollow for warning, dot
for info — in badges, the problems drawer, the property panel and the canvas marker. That is what
makes the hue shift safe against `--error`, and it is what keeps the distinction alive in greyscale
and for colour-blind readers.

---

## 6. Control styles

### 6.1 Metrics

| Token | Value |
|---|---|
| `--space` | 4 · 8 · 12 · 16 · 24 · 32 |
| `--r-sm` | 3 px — controls, chips, inputs |
| `--r-md` | 5 px — panels, dialogs |
| `--r-pill` | 999 px — badges only |
| `--h-control` | 28 px |
| `--h-control-lg` | 32 px — toolbar primary |
| `--icon` | 16 px in a 28 px hit box; 20 px in the rail's 40 px box |
| `--rail-w` | 52 px |

Three radii replace today's five ad-hoc values (1, 2, 3, 4, 6).

### 6.2 Elevation

Two steps, and only one of them casts a shadow. CAD chrome should be crisp.

- **Flat** — panels, toolbars, the rail, the drawer: `--shell-700` plus a `--shell-line` hairline. No
  shadow.
- **Raised** — dialogs and popovers only: `0 8px 24px rgba(0,0,0,.45)` over a
  `rgba(10,11,13,.55)` scrim. This is what the delete dialog currently lacks; it reads as pasted on.

### 6.3 Motion

`--motion: 120ms ease-out`, applied to `background-color`, `border-color`, `color`, `opacity` **only**.
No transforms, no scale-on-press, no entrance animation. `prefers-reduced-motion` sets it to `0ms`.

A precision tool that bounces is a precision tool you stop trusting. But a control that never
acknowledges a press feels broken, and today nothing in the stylesheet transitions at all.

### 6.4 Button hierarchy

| Variant | Appearance | Rule |
|---|---|---|
| **Primary** | `--tan` fill, `--on-tan` text | **At most one visible per context.** *Export PDF* in the toolbar; the one constructive act in a property panel |
| **Secondary** | `--shell-600` fill, hairline border | The default |
| **Quiet** | Text only, no fill until hover | Row actions, overflow items |
| **Destructive** | Hairline border, `--error` text; `--error` fill only inside a confirm dialog | **Never adjacent to the primary action**, and never full-width in a stack |

Today *Add stitch line* and *Delete* are the same full-width button one above the other.

### 6.5 States, and the one that matters

| State | Treatment |
|---|---|
| Rest | Per variant |
| Hover | Surface one step lighter |
| Active | Surface one step darker, no transform |
| Selected | `--tan` left edge or fill, per control |
| Focus | `2px --tan` ring at `1px` offset, on `:focus-visible` only |
| **Disabled** | 40 % opacity, `cursor: not-allowed`, **and the reason is rendered** |

**`ReasonedButton` is the highest-value component in this spec.** The domain already produces every
refusal — `mirrorRefusal`, `foldMirrorRefusal`, `allowanceRefusal`, `flipRefusal`, `lockRefusal` — and
the panel currently puts the sentence in a native `title` on a **disabled** element, where it is slow,
unstyled, invisible to keyboard users and absent on touch. X1 says no refusal is silent; this is a
whole class of silent refusals.

```
interface ReasonedButtonProps {
  label: string;
  reason: Problem | null;      // null = enabled
  onClick(): void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive';
}
```

Disabled renders the sentence from `describeProblem` as a line beneath the control in `--t-label`
`--text-dim`, or in a real tooltip where space is tight — never only in `title`.

### 6.6 The component set

| Component | Job |
|---|---|
| `Field` | label + control + unit, one implementation — fixes unit clipping everywhere |
| `NumberField` | Tabular figures at weight 500, reserved unit column, commit on Enter/blur |
| **`ReasonedButton`** | Disabled *and says why* |
| `Tooltip` | Real: styled, delayed 400 ms, keyboard-reachable. Retires `title` |
| `FeatureMark` | The role glyph — identical in rail, tree, property header, problems, legend |
| `Badge` | Count + severity (exists, 4.12) |
| `Chip` | The segmented control the *Draw as* strip wants to be |
| `Panel` / `PanelSection` | One heading treatment, one padding rhythm |
| `Dialog` | Raised elevation, scrim, focus trap, Escape |
| `Toolbar` | Groups with a primary slot |
| `Notice` | A refusal shown near the gesture (§7.4) |

---

## 7. Panel and layout structure

### 7.1 The frame

```
┌────┬──────────────┬──────────────────────────────┬─────────────┐
│    │              │  tool options (contextual)   │             │
│ R  │              ├──────────────────────────────┤ Properties  │
│ a  │   Parts      │                              │             │
│ i  │              │       Canvas (ground)        │             │
│ l  │              │                              │             │
│    │              ├──────────────────────────────┤             │
│    │              │  Problems ▲ (drawer)         │             │
├────┴──────────────┴──────────────────────────────┴─────────────┤
│  counts · notice · cursor                                       │
└─────────────────────────────────────────────────────────────────┘
  52/152px   220px              1fr                      288px
```

- **Rail** — its own column, **152 px expanded (default) / 52 px collapsed**, auto-collapsing below
  1200 px. Icon **and** label **and** shortcut when expanded; icon plus a corner shortcut badge when
  collapsed. **Never scrolls, never competes for height** — which was audit finding 3.3. Every button
  the same size and weight: hierarchy comes from grouping, not from guessed frequency (decisions
  record §2.1 and §4).
- **Parts** — the full left column. Per-part *Duplicate/Delete* move to a row overflow, so twelve
  features fit where six do now. **Names must not truncate**; they wrap to a second line or ellipsise
  with the full name in a tooltip.
- **Problems** — a collapsible drawer **under the canvas**, full width, where a list of sentences can
  be read. Collapsed by default to a 28 px handle carrying the 4.12 badge.
- **Properties** — 288 px, with a sticky header: feature mark, name, badges.
- **The tool-options row is always present.** Reserving its height removes the canvas shift at its
  source, and keeps the *Draw as* setting — which carries the leather meaning — on screen instead of
  appearing and vanishing with the tool.

### 7.2 Breakpoints — nothing may disappear

Today at **860 × 640 the parts panel is not rendered at all**, and it is the only route to a locked
feature, because locking removes it from hit-testing. That is a correctness failure.

| Width | Behaviour |
|---|---|
| ≥ 1280 | Full frame as above |
| 1024–1279 | Parts 200, Properties 264 |
| 900–1023 | Properties collapses to a right overlay, toggled from the status bar. **Parts stays** |
| < 900 | Parts also becomes a toggled overlay. **The rail always stays**, and no panel is removed from the DOM |

Minimum supported: **860 × 600**.

### 7.3 Panel rhythm

16 px panel padding · 12 px between sections · 8 px between fields · 88 px label column in Properties
· one hairline between sections, never a box per section.

### 7.4 Where a refusal is said

Three places, by kind:

| Kind | Where |
|---|---|
| **A gesture was refused** (drew a fold with nothing selected) | A `Notice` **near the pointer**, above the canvas, for as long as it is true — plus the status bar. Today it is only in the status bar, 700 px from where the user is looking |
| **A control cannot act** | Inline under the control, via `ReasonedButton` |
| **The design has a problem** | The problems drawer, the property panel, the canvas marker — the 4.12 channel, unchanged |

---

## 8. Feature-type visual language

**The authoritative table.** One row per feature type; every column is the same operation expressed
in a different place. This table *is* the "same meaning everywhere" rule.

### 8.1 The table

| Feature | Colour | Width px / mm | Dash (mm, both media) | Distinguishing mark | Tree swatch |
|---|---|---|---|---|---|
| **Cut edge** (outer) | `--ink` `#1D2126` | 1.75 / 0.25 | solid | The heaviest line in the drawing | solid bar |
| **Cut-out** (inner) | `--ink` `#1D2126` | 1.5 / 0.22 | solid | **Inward hatch**, 45°, 18 % ink — removal, not boundary | hatched bar |
| **Stitch line** | `#2F6690` | 1.25 / 0.15 | `[2, 2]` | — | dashed bar |
| **Stitch holes** | `#2F6690` | 1.25 / 0.15 | — | **Slanted slits** at the iron's angle, true size (§9) | three slits |
| **Fold** | `#2E7D53` | 1.25 / 0.15 | `[7, 2, 1.5, 2]` | **Direction ticks**: valley toward, mountain away | dash-dot bar |
| **Marking** | `#7A7468` | 1 / 0.10 | `[1, 1.5]` | — | dotted bar |
| **Hardware hole** | `#5B4CA8` | 1.5 / 0.20 | solid | Ring with a centre cross | ring |
| **Measurement** | `#8A5A2B` | 1 / 0.10 | solid | Extension lines and arrowheads; the number set like every other measurement | arrow bar |
| **Construction** | `#B6AD9B` | 1 / 0.10 | `[1, 1]` | — | faint bar |

Three things this fixes: `mark` and `construction` stop being solid on screen and dotted on paper;
`stitch` and `fold` get one rhythm in both media; hardware leaves the amber family, so a rivet can
never read as selected.

### 8.2 Cut-out is not a colour difference

An outer edge and a cut-out are opposite ideas — *this is the boundary of the piece* versus *remove
this from inside the piece* — and they currently render identically. The hatch carries the meaning,
so it survives greyscale, photocopying and colour-blindness. **Colour is never the only carrier.**

### 8.3 Derived is a state, not a colour

A derived feature keeps its role colour: what it *is* has not changed, only what you may do to it.
It gains a **link tick** — a small chain mark at the path midpoint, role colour at 60 % — and the tree
row states the relationship in one agreed word.

**Terminology, settled once** (the audit found four spellings — *Follows*, *Mirrored from*,
*Mirrors*, `⇄`):

| Relationship | Word |
|---|---|
| Built from a source | **Follows** *Outline* |
| Mirrored across an axis | **Mirrors** *Cut-out* |
| Mirrored across a fold | **Mirrors** *Cut-out* **across** *Fold* |
| Points at geometry without being built from it | **Measures** *Outline* |

### 8.4 Selection adds; it never replaces

Today selection repaints geometry in amber, so a selected stitch line stops looking like a stitch
line and the user loses the information they selected it to work on.

| State | Treatment |
|---|---|
| Hover | 5 px halo under the line, `--tan-ink` at 18 % |
| Selected | 5 px halo, `--tan-ink` at 45 %; the role colour and dash are untouched |
| Anchors | `--tan-ink` dots, shown on hover in **every** tool, not only Measure |

**Tested against every feature class** (decisions record §1.3). Six pass unchanged; three needed an
answer:

| Class | Treatment |
|---|---|
| **Stitch holes** | The halo follows **the line the holes are placed along**, not each slit — which is also what the feature is |
| **Measurements** | The halo follows **the dimension line only**; extension lines and the number are untouched |
| **Failed geometry** | The halo goes on the **failure marker**, never on the healthy source it points at (§8.5) |

**Selection is expressed differently on the two grounds.** A halo on the drafting ground; a left edge
plus tint in the tree and the property header. Same state, appropriate to the medium — nobody should
put a halo on a list row.

### 8.5 A failure marks the failure, not its source

Today a failed derived feature is drawn in error red **at its source geometry**, so the healthy
outline turns red and the broken stitch line is invisible.

Instead: the source draws normally, and the failure appears as a **severity marker** — a filled
triangle in `--error` — at the diagnostic's location, with a short leader to the geometry.
Red belongs to the marker. The marker is a shape as well as a colour.

### 8.6 The legend

A small collapsible key on the canvas listing the roles present in this document, each drawn as the
canvas draws it. It teaches the language in the place the language is used, and it is the same
artwork as the icon set.

---

## 9. Canvas treatment

### 9.1 Grid

Three tiers, real contrast steps, each dropping out at a zoom where it would become texture.

| Tier | Colour | Shown when |
|---|---|---|
| 1 mm | `--ground-fine` | ≥ 4 px/mm |
| 10 mm | `--ground-major` | ≥ 0.6 px/mm |
| 100 mm | `--ground-hundred` | always |
| Axes | `--ground-axis` | always |

Today one uniform low-contrast mesh produces moiré when zoomed in and vanishes when zoomed out.

### 9.2 Rulers

Tabular figures at `--t-num-micro`, labels on major ticks only, and **a cursor tick that tracks the
pointer on both rulers** — a drafting affordance that costs almost nothing and is missing today.

### 9.3 Zoom bands

Your point 4, made concrete. The **meaning** is constant across bands; the **representation** adapts.

| Band | px / mm | Stitch holes | 1 mm grid | Anchors |
|---|---|---|---|---|
| **Detail** | ≥ 8 | True size, true slant, true blade width | On | On hover |
| **Working** | 2 – 8 | Slanted slits at `max(true size, 3 px)` — slant and colour kept | On above 4 | On hover |
| **Overview** | < 2 | Individual holes **stop being drawn**; the set renders as its stitch line, dashed, in stitch blue | Off | Off |

At every band stitching reads as stitching, in stitch blue, on the stitch line. Nothing changes
meaning; only the level of detail does. **Dashes fall back to solid below 0.6 px/mm** for the same
reason.

This is what replaces today's behaviour, where holes are 2 px screen-constant dots: at the working
zoom they read as a bright blue dotted border louder than the cut edge, and at high zoom they are
specks.

### 9.4 The canvas keeps its place

The canvas currently changes height when the *Draw as* strip appears and disappears — measured
`840 × 682.5` versus `840 × 734.5`, moving the drawing **~26 px, about 8.7 mm**, on every tool change.

**Treated as a correctness defect, not a test inconvenience.** An unexplained 8.7 mm displacement in
a tool whose promise is 1:1 is unacceptable. The fix belongs in `Viewport`: on resize, hold the world
point at the canvas centre fixed. Then the drawing never moves unless the user moves it — and the
compensation arithmetic currently in the E2E suite is deleted rather than adjusted.

### 9.5 Snap feedback says what it caught

Glyph plus a word: `corner · Outline`. Drafting is about knowing what you have hold of.

---

## 10. Icons

### 10.1 Principles

16 px box · 1 px keyline padding · **1.5 px stroke** · round caps and joins · no fill except where a
fill means *solid* or *punched* · optical weight matched to `--t-strong` · **a state changes colour,
never shape**.

States: rest `--text-dim` · hover `--text` · active `--tan` · disabled 40 % **plus a rendered reason**.

### 10.2 Tier 1 — adopted

One existing stroke set (Lucide) for the ~25 generic verbs: eye, eye-off, lock, unlock, trash, copy,
undo, redo, plus, chevron, alert-triangle, download, x, check, more-horizontal.

**No custom replacements for generic actions.** Nobody needs a bespoke trash can.

### 10.3 Tier 2 — the LeatherCAD marks

Eleven marks, each a **specimen of the geometry it names**: the same colour, the same dash rhythm and
the same relative weight the canvas uses.

| Mark | Drawn as |
|---|---|
| **Piece** | A pattern-card outline with one clipped corner — the part-level mark in the tree |
| **Cut edge** | Solid closed shape, heaviest stroke in the set |
| **Cut-out** | Closed shape with the 45° inward hatch |
| **Stitch line** | The `[2, 2]` dash, in stitch blue |
| **Stitch holes** | Three slanted slits at the iron's angle |
| **Fold — valley** | Dash-dot axis with ticks toward the viewer |
| **Fold — mountain** | The same axis, ticks away |
| **Marking** | The `[1, 1.5]` fine dot |
| **Seam allowance** | Two parallel lines with the band between them filled |
| **Mirror across fold** | A shape and its reflection across a dash-dot axis |
| **Hardware hole** | A ring with a centre cross |
| **Measurement** | Extension lines with arrowheads |

Grain direction joins them when the model gains the field (post-1.0).

Each is authored once at 16 px and used at 16 (tree, list), 20 (rail) and 40 (legend, empty states) —
optically adjusted, never scaled blindly.

---

## 11. What LeatherCAD must not become

Normative. Each has a reason, so future work can apply the rule rather than the list.

| Not this | Because |
|---|---|
| **Glassmorphism, blur, translucency** | Precision work needs unambiguous edges. A blurred panel edge over a drawing is a lie about where the drawing ends |
| **AI-style gradients**, purple/blue washes | Gradient is a decorative surface treatment in a product where every surface should be either chrome or material |
| **Giant rounded cards** | A 16 px radius on a tool button reads as a toy. CAD chrome wants tight geometry: 3 px on controls, 5 px on panels |
| **Emoji** | Renders differently per platform, cannot be recoloured, cannot take a state |
| **Excessive animation** | A tool that bounces is a tool you stop trusting. Motion is 120 ms on colour only |
| **Low-contrast grey-on-grey minimalism** | Already the drift. Hierarchy comes from weight, size and position — not from fading things out |
| **Generic SaaS/dashboard styling** | No big-number hero tiles, no letter-spaced uppercase headings, no card-per-section, no accent rail on every block |
| **Decorative leather or paper textures** | Identity must come from semantics. The moment a hide photograph appears behind the grid, the product is a theme |
| **Skeuomorphic material effects** | Bevels, stitching borders, tan gradients — same reason |
| **Colour as the only carrier of meaning** | Patterns get photocopied and printed in grey. Every distinction also has a shape, a dash or a mark |
| **Icon-only controls with no name** | Every icon control has a tooltip with its name and shortcut |
| **Silent disabled controls** | X1. If it cannot act, it says why |
| **Full-width destructive buttons in a stack** | Delete should never be one mis-click below a constructive action |
| **Decorative numbers** | A number on screen is a measurement or it is a count. Nothing is a number for texture |

The target is a **precision workshop instrument**, not a dashboard.

---

## 12. The identity test, as a checklist

With the wordmark removed, a screenshot must show **at least six** of these:

1. A **card-coloured drawing ground** in a dark shell, with a 1/10/100 mm drafting grid.
2. **Millimetres in tabular figures that do not move** — rulers, status bar, property fields, the
   live dimension. One family throughout, and the same face on the printed pattern.
3. **Slanted stitch slits** at the iron's real angle and spacing — not round dots.
4. A **cut edge that is visibly the heaviest line**, with cut-outs hatched inward.
5. A **fold that shows which way it folds**.
6. A **seam allowance drawn as a band**, so the edge visibly derives from the stitching.
7. A parts tree whose rows carry **leathercraft marks**, reading *Outline ▸ Stitch line ▸ Stitch
   holes*.
8. A property panel showing **Iron · Pitch · Fit · Corners · Holes · Spacing · Runs 19 · 26 · 18 · 26**.
9. A dimension drawn like **drafting** — extension lines, arrowheads, the number breaking the line.
10. A canvas **legend** in the language of the drawing.

Items 3, 6, 8 and 10 are the ones no general vector editor would ever show.

---

## 13. What is preserved

Explicitly protected from this work. Changing any of these needs a reason written down.

- **The copy**, word for word. It is the product's voice and the best thing in it.
- **Millimetres everywhere**, and the 1:1 promise. Every visual decision above was checked against it
  — it is what recommends the card ground and true-millimetre dashes.
- **The live dimension while drawing** (`103.3 × 73.3 mm`, `66.3 mm −90.0°`).
- **Single-letter shortcuts, printed on the control.** They move from a text label to a rail badge and
  a tooltip; they do not become hidden.
- **The dependency tree.** The concept is right; only its container changes.
- **The stitch-hole information.** Promoted, never redesigned: it also gains a canvas caption
  (`88 holes · 3.85 mm · KS Blade`) and a legend entry.
- **The refusal model.** The `Problem` channel is untouched; refusals move to where they can be seen.
- **4.12's diagnostic channel** — `diagnose`, badges, `diagnosticTarget`, `exportReadiness`. This spec
  restyles its surfaces and changes none of its model.

---

## 14. The UI Foundations checkpoint

A checkpoint between the audit and Phase 5, in the roadmap's own idiom. **Phase 5 does not begin
until it is done**, and Phase 5 features consume it rather than extending the visual language.

### F.0 — Typography first

Apply the vendored face, vendor Plex Sans 500 and 600, install the scale and the numeric treatment.
One line plus a token file; it touches no container, cannot conflict with F.2, and is the largest
visible change per line of code in the programme — so F.1's new components are authored in the final
type rather than restyled later. (Decisions record §1.6.)

Both determinism defects are **already fixed** (2026-09-18): U+2212 and the Romanian letters are in
the glyph set, and `packages/render` names no platform font. What remains for F.0 is
**`formatMm()` / `formatAngle()` emitting U+2212**, since the ruler and the tool previews still
compose their negatives from `toFixed`, which produces a hyphen.

### F.1 — Systemic interaction

`ReasonedButton`, `Tooltip`, `Notice` near the gesture. Terminology settled to one word per
relationship. Drag versus click–click made consistent, and the header hint replaced by per-tool
guidance that is true. Perimeter/Area corrected — **Length** on an open line, nothing on a hole.

### F.2 — Layout architecture

Icon rail · Parts full height · Problems drawer · Properties with a sticky header. Breakpoints, and
the rule that **no panel is ever removed**. Field/unit structure, which retires the clipped units.

*Structure before styling: F.2 lands before F.4 so we never style a container that is about to move.*

### F.3 — The canvas keeps its place

The viewport fix (§9.4), and the deletion of the E2E compensation arithmetic.

### F.4 — The remaining tokens

`packages/render/src/theme/` as the single source: spacing, radii, elevation, motion, the `--density`
token. `apps/desktop` projects them onto `:root`. The one-sentence ADR 0011 amendment. **The audit
test that screen and paper agree.** (The typography half moved to F.0.)

### F.5 — Colour planes and canvas

The four planes. The card ground and the three grid tiers. Rulers with a cursor tick. Selection as a
halo. The failure marker replacing the red overlay. Zoom bands.

### F.6 — Icons

Tier 1 adopted; the eleven marks authored; `FeatureMark` used in all five places.

### F.7 — Leather-specific treatment

True-size slanted holes. Seam allowance as a band. Fold direction ticks. The derived link tick.
The canvas legend and the part caption. **Then run §12's checklist and record the result.**

### Not in this checkpoint

Alignment and smart guides · fold preview · grain direction · cut list and hide yield · run-boundary
marks · theming and density · a command palette. All post-1.0, as agreed.

---

## 15. Settled at review

All six were reviewed on 2026-09-18 and are recorded, with rationale and trade-offs, in
[the decisions record](2026-09-18-ui-foundations-decisions.md) §1.

| | Decision | Outcome |
|---|---|---|
| 1 | Base size **14 px** | Taken, plus a `--density` token so row heights can compact without re-deriving the scale |
| 2 | **Warning leaves the gold family** | Taken at `#D9891F`, **conditional on severity always carrying a glyph as well as a hue** |
| 3 | **Selection as a halo** | Taken, tested against nine feature classes; hole sets, measurements and failed geometry each needed a specific answer (§8.4) |
| 4 | **Dash patterns in millimetres** | Taken, with **"true, or none"** rather than a clamp (§2) |
| 5 | **The whole viewport is the drafting ground** | Taken; terminology corrected from *card*, and a page-guide overlay designed but **off by default** (§5.2) |
| 6 | **Structure before styling** | Taken, with **typography moved ahead as F.0** (§14) |

What remains open is in the decisions record §7.
