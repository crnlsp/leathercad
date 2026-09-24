# Paper-size reference, and the typography direction

**Date:** 2026-09-18
**Status:** Part 1's paper reference is **superseded** (2026-09-24) by the Sheets view in
[Design and Sheets](2026-09-24-sheets-workflow-design.md), which shows the real sheets. Otherwise:
reviewed and accepted 2026-09-18. The determinism fixes in §2.7 are **implemented**; the
paper reference and the typography rollout are not. See
[page setup and determinism](2026-09-18-page-setup-and-determinism-decisions.md).
**Extends:** [UI Foundations](2026-09-17-ui-foundations-design.md) ·
[decisions](2026-09-18-ui-foundations-decisions.md)

Both questions were checked against the code before being answered. Three findings changed the
shape of the answers, and they are stated first because everything below rests on them.

| Found | Where | Consequence |
|---|---|---|
| **`paginate` packs parts**, tallest first, into rows — parts do **not** print at their design coordinates | `packages/export/src/paginate.ts` | A page *grid* over the drafting ground would be a lie. A single reference rectangle is the only honest overlay |
| **The printable area is not the paper.** A4 portrait reserves 10 mm margins **and a 62 mm footer** for the verification block, leaving **190 × 215 mm** | `packages/export/src/paper.ts` | An overlay showing the A4 *sheet* would mislead — it must show the content area |
| **Plex Sans digits are already tabular** — every digit has advance 600 in the extracted outlines | `packages/typography/src/generated/plexSans.ts` | The product's central typographic need is already met, identically on screen and on paper. This reverses my Plex Mono recommendation |

And one gap neither question was looking for: **there is no paper setting in the project at all.**
`ProjectSettings` is `gridSpacingMm`, `defaultStitchInsetMm`, `defaultIronPitchMm` — and
`exportPdfFile` never passes a `PageSetup`, so **every export in the product is A4 portrait** and no
maker can choose otherwise.

---

## Part 1 — Optional paper-size reference mode

### 1.1 Does it solve a real problem? Yes, but not the one it looks like

The stated problem is scale awareness on an infinite canvas. I do not think that is the real one:
the app already shows scale constantly — rulers in millimetres, the live dimension while drawing
(`103.3 × 73.3 mm`), width and height in the panel, the cursor readout. A maker is not short of
information that the piece is 312 mm wide.

What they have no way to know is whether **312 mm is a problem**, because that depends entirely on
what they will print on. So the real question is not *how big is this* but **will this fit what I
print on** — and that reframing matters, because:

- it is a **printability** question, which `packages/export` already answers (`paginate` returns
  `oversized`, and `paperOptionsFitting` already computes *which paper and orientation would work*);
- the answer currently arrives **only at export**, after the PDF has been written — 4.12's
  `exportReadiness` and the oversized report are both post-hoc;
- and the honest number is **not the paper size**. A4 portrait gives 190 × 215 mm of usable area
  once margins and the 62 mm verification footer are taken out. A 200 mm-wide part "fits on A4" by
  naive reckoning and does not fit at all.

That last point is the strongest argument for the feature and also the strongest constraint on it:
**a naive A4 rectangle would be worse than nothing**, because it would tell people their part fits
when the exporter will reject it.

Worked example, using the user's own figure. A pattern of **312 × 220 mm**:

| Paper | Content area | Fits? |
|---|---|---|
| A4 portrait | 190 × 215 | no |
| A4 landscape | 277 × 128 | no |
| A3 portrait | 277 × 338 | no — 312 > 277 |
| A3 landscape | 400 × 215 | **no** — 220 > 215 |

Four plausible answers, all wrong, and the one that looks most obviously right (A3 landscape) misses
by 5 mm because of the footer. No maker will work that out by eye. **The app can, and already does.**

### 1.2 Where it belongs — split three ways

It does not belong in one place, and pretending otherwise would either bloat Foundations or defer a
visual decision that Foundations has to make anyway.

| Part | Where | Why |
|---|---|---|
| **The overlay's visual language** — how a page reference is drawn on the drafting ground, its z-order, contrast, and behaviour across the zoom bands | **UI Foundations, F.5** | It is a canvas-language question, it is small (corner ticks and a label), and once the ground is paper-coloured people *will* ask where the page ends. Deciding it later means re-deriving the canvas layering |
| ~~**A page setup in the project**~~ ✅ **built as 5.5** — paper and orientation; margins stayed constants | **Phase 5** | Done: format version 9, `pageSetupFor()` the one conversion point. Export is no longer hard-coded to A4 |
| **The picker, the presets, the contextual suggestion** | **Phase 5**, same slice or the next | Consumes both of the above |

**Ordering constraint:** the picker cannot come before the project has a page setup, because a view
control that does not change what prints is a trap — the user picks A3, exports, and gets A4.

### 1.3 What it draws

**Corner ticks, not a rectangle.** A closed outline reads as a boundary; crop marks read as a
reference, and they are the drafting convention for exactly this. Four L-shaped ticks at the corners
of the **content area**, with the dimensions in the corner:

```
┌ ─                                      ─ ┐
                                                  A4 portrait · 190 × 215 mm
                    (the drawing,
                 unclipped, unchanged)

└ ─                                      ─ ┘
```

Rules:

1. **The content area, never the sheet** (§1.1). The label says which: `A4 portrait · 190 × 215 mm`,
   not `A4 · 210 × 297 mm`.
2. **One reference, not a grid.** `paginate` packs, so a tiled grid would claim a page layout that
   is not how printing works. One rectangle answers the only question a reference can honestly
   answer: *does a piece fit on a sheet.*
3. **It anchors to what you are looking at** — the selected part's bounding-box top-left; with
   nothing selected, the top-left of all content. That makes the comparison direct rather than
   requiring the user to pan their piece over to a fixed rectangle at the origin.
4. **Drawn beneath all geometry**, in `--ground-hundred` — the 100 mm grid's own value. It is grid
   furniture, not a feature.
5. **It disappears when it cannot mean anything**: hidden in the overview band (< 2 px/mm), where the
   ticks would be a few pixels apart.
6. **Off by default**, and the setting is per-user and per-session rather than saved in the document.
   A reference overlay is a view state, and the document already refuses to store view state.

### 1.4 The control, and the suggestion

**The control** lives in the status bar, beside the cursor readout, with the other view state:

```
4 parts · 12 features · 1 selected                    Paper: off ▾        105.00 , 73.33 mm
```

`off · A5 · A4 · A3 · Letter · Legal`, each with portrait/landscape — all five already exist in
`PAPER_SIZES`. Choosing one **also sets the project's page setup**, once that exists: one setting,
two surfaces, so the overlay can never disagree with what the exporter does.

**The suggestion** — and its trigger must be a fact, not a guess. Not "unusually large", which is a
magic number we would be inventing, but:

> **a part exceeds the printable area of the project's current page setup** — which `paginate`
> already computes, and which `paperOptionsFitting` can already answer.

Rendered in the status bar, quietly, with the action attached and the honest number:

```
Pocket is 312 × 220 mm — too big for A4. Fits A3 landscape rotated.   [Show A4]  [Use A3]
```

Dim text, no colour, no icon, no toast, dismissible for the session and per part. Two offers because
the app already knows both answers.

**It is explicitly not a diagnostic.** A pattern legitimately larger than a sheet is not wrong — you
tile it, or take it to a copy shop — and putting it in `diagnose()` would cry wolf on the one channel
the project has been careful to keep trustworthy. The boundary that keeps this from being a second
error path: **it says nothing about the design; it reports a fact about a view and an export
setting.** If that line is ever crossed — if we want "this will not print" to be a design problem —
it must go through `PROBLEM_CODES` and ADR 0013 like everything else, not around them.

### 1.5 Connection to export and printing

1. **One page setup.** The picker writes the project's `PageSetup`; `exportPdf` reads it. Today it
   reads `DEFAULT_PAGE_SETUP` and the maker has no say.
2. **The overlay is the content area**, so what the ticks enclose is exactly what `contentAreaMm`
   gives the paginator. No second calculation, no drift.
3. **The suggestion's options come from `paperOptionsFitting`**, which exists and is already used by
   `describeOversized` at export time. The same sentence, moved earlier.
4. **It is not a print preview.** Because pagination packs, a genuine preview is a different mode
   showing the actual packed pages — a later feature, and it must be named differently so nobody
   reads the reference as a layout.

### 1.6 Downsides, and what answers each

| Risk | Answer |
|---|---|
| Read as a hard boundary | Corner ticks rather than an outline; geometry is never clipped and draws *over* it; the label says "reference"; off by default |
| Visual clutter | One rectangle, not a grid; drawn at grid-furniture contrast; hidden at overview zoom; off unless asked for |
| Mistaken for a print preview | It is not one, and cannot be while pagination packs. Named "paper reference"; a real preview arrives later under its own name |
| Encourages designing to the page | Real, and partly the point — but it is why it stays **off by default** and why nothing constrains geometry |
| Misleading if it showed the sheet | The single most important detail: it shows the **content area**, 190 × 215 on A4, because that is what the exporter enforces |

### 1.7 Recommendation

**Do it, in three parts, and not yet.** Foundations F.5 fixes only how a page reference is drawn.
Phase 5 adds the page setup, the migration and the picker — which also closes the hard-coded-A4 gap,
and that gap is worth a line in the roadmap on its own merits.

**The one thing I would change in your proposal:** show the **printable area**, not the paper size,
and label it as such. `A4 · 210 × 297 mm` is the honest-looking answer and the wrong one.

---

## Part 2 — Typography

### 2.1 Re-examining Plex Sans, without assuming it

The case *against* keeping it is real and worth stating first:

- It is very widely used, especially in developer tooling, and has become a safe "technical" default.
  Ubiquity is the opposite of identity.
- Its voice is corporate-engineering, not workshop.
- Its x-height is moderate, so at 11–12 px it is good but not best in class — Inter and Public Sans
  are measurably more legible at those sizes.

The case *for* is stronger than "it is already there", and rests on three things.

**1. It is the printed face, and printed patterns are the product.** ADR 0011 vendored it,
`packages/typography` ships 332 extracted glyph outlines and 12 910 kerning pairs from it, and every
part name and dimension on a printed pattern is drawn from those outlines. Changing the UI face
either splits screen from paper — the exact incoherence these documents exist to remove — or changes
what every pattern ever printed looks like, and requires regenerating the glyph set.

**2. Its digits are already tabular.** I checked the generated data: every digit from 0 to 9 has an
advance of 600 units. Plex Sans ships lining tabular figures as its *default* figure set. So the one
thing this product needs most from a typeface — **a column of millimetres that does not move while
you type** — is already true, and true identically on screen and on paper, with no feature
substitution and no risk that the outline pipeline drops a variant.

**3. The brief it was designed to** is unusually apt. Plex was commissioned to reconcile the
neutrality of the machine with the humanity of the hand. That is a fair description of a tool where
a maker's judgement meets millimetre precision. This is the softest of the three arguments, but it is
not nothing, and it is the opposite of a trend-following choice.

**Recommendation: keep IBM Plex Sans.**

### 2.2 Reversing my own Plex Mono recommendation

I previously recommended Plex Mono for every number. **The evidence says do not**, and I would
rather correct it now than have it built.

- **The functional benefit is zero.** Plex Sans digits are already fixed-width (§2.1). Mono would add
  typewriter *texture*, not steadiness.
- **It would split the same number into two voices.** A measurement appears in the property panel
  *and* on the drawing — `105.00` in the Height field and `105.00` on the dimension line. The
  dimension prints, so it must be Plex Sans (ADR 0011). If the field were mono, the product would
  show one measurement in two typefaces, two panels apart. That is precisely the incoherence being
  removed elsewhere.
- **It costs a second vendored family** — two more WOFF files and a second thing to keep in step —
  for texture alone.

So: **one family.** Numbers are distinguished by **weight, size, colour and the unit treatment**,
not by a different face.

The only place a monospace has a real claim is the **keycap** (`kbd`), where fixed width genuinely
helps a `⌘` sit beside an `S`. That does not justify vendoring a family; it justifies a boxed
treatment in Plex Sans at `--t-micro`.

### 2.3 If the character must come from somewhere, it is not the typeface

You asked how much personality should come from the typeface versus layout, spacing and iconography.
My answer is deliberate and a little contrarian: **almost none from the typeface, because that is
what precision instruments look like.**

A Mitutoyo caliper, a Starrett rule, an ISO 3098 drawing, a machinist's dial — none of them has a
distinctive typeface. Their lettering is as neutral as it can be made, and *all* of the character
comes from the marks, the graduations and the measures. The things that look like they have a voice
in that world are the ones that are not instruments.

SaaS interfaces work the opposite way: neutral content, expressive type. Reaching for a characterful
face is therefore the move most likely to produce the thing you asked me to avoid.

So the identity budget is spent where it does work:

- **the eleven marks**, each a specimen of the line it names;
- **the numerals' treatment** (§2.5) — the most-read thing in the product;
- **the drafting ground and the three grid tiers**;
- **the geometry language** — slanted slits, inward hatch, fold ticks, the allowance band;
- **layout discipline** — hairlines, 3 px radii, no shadows except dialogs, no letterspaced caps.

### 2.4 The alternative, honestly

If after all that you want more type character, the candidate I would actually put forward is
**Archivo** (Omnibus-Type, OFL): a grotesque drawn from 19th-century American gothics, explicitly
designed for small text and print, with a real industrial lineage and none of the current-fashion
association. It is a legitimate choice, not a straw man.

What it would cost, stated plainly:

- regenerate 332 glyphs and 12 910 kerning pairs, and verify its default figures are tabular — if
  they are not, the printed numerals stop lining up and no CSS setting can fix an outline pipeline;
- **every pattern printed from now on looks different from every pattern printed before**;
- a legibility gain at 11–12 px that I would call marginal, and an identity gain that is real.

What I would **not** consider: Inter or Space Grotesk (the exact defaults you asked to avoid), Söhne
(licensed, and now strongly associated with a particular AI product), any geometric sans, and
anything rounded. And no DIN-lineage face for the *interface* — DIN is drawn for signage at distance,
and its narrow apertures work against you at 12 px.

**My recommendation stands: Plex Sans.** Archivo is the fallback if you dislike Plex on sight, which
is a legitimate reason and worth saying out loud rather than arguing with.

### 2.5 Sizes, weights, and the numeric treatment

**Base 14 px**, which I proposed before and can now justify rather than assert: Plex Sans has a
modest x-height, so 14 px Plex is close to 13 px system-ui in apparent size. Fourteen is not an
increase in visual scale — it is the size at which the vendored face reads the way the current UI
reads today.

**Weights: 400, 500, 600 only.** Not 300 — too thin at 11–12 px, and worse on the dark shell. Not 700
— Plex Bold is heavy enough to look like emphasis where none is meant.

**One detail that a dual-ground design has to get right:** light text on a dark ground appears
heavier than the same weight on a light ground. So the same token renders at 400 in the shell and may
need 500 on the drafting ground to look equal. This is a per-plane weight adjustment, not a second
scale.

**Plex Sans has no true small caps.** Never synthesise them; there is nowhere in this design that
needs them.

**The numeric treatment — where the identity actually lives.** Because there is no second face, the
numbers earn their distinction structurally:

| Rule | Why |
|---|---|
| Measurements set one weight above body — **500 against 400** | A number reads as a measurement without changing face |
| **The unit is a separate element**: 400, `--text-dim`, in a fixed 28 px column | Fixes the clipped `103.38\|m`, and makes `105.00` the figure the eye lands on |
| **`--t-num-lg` 17/500** for the one number a panel is about | The opening width, the pitch — the number you came to the panel for |
| **Proper minus** `−` (U+2212), never a hyphen | Drafting convention; costs nothing |
| Decimal alignment comes free from the 600-unit advance | No hacks needed |

### 2.6 Does a display or accent face have a role?

**One place only: the wordmark.** And even there I would not license a display face — it would appear
once, at 16 px, and cost a whole family.

Better: set the wordmark in Plex Sans 600 with deliberate tracking, and put **one of the eleven marks
beside it**. Then the brand mark is drawn from the same vocabulary as the tool rail, the parts tree
and the printed pattern — which is a stronger identity than any display face, and it is free.

### 2.7 Three concrete defects found while checking

| Defect | Detail |
|---|---|
| ~~**U+2212 is not in the glyph set**~~ ✅ **fixed** | It is in the font at advance 600 — the generator never asked for it. Added, along with Romanian's `Ș ș Ț ț`, which sit past where the declared range stopped. 336 glyphs now, purely additive |
| ~~**The ruler uses a system monospace**~~ ✅ **fixed, and it was three places** | Checking the whole package found the ruler *and* both backends' overlay-text defaults — so the live dimension, the part captions and the ruler were all in a platform font while the same strings print from Plex outlines. `packages/render` now names no platform font, and `fonts.test.ts` holds it there |
| **Plex is loaded and never applied** | The known one. `@font-face` declares it; `body` uses `system-ui` |

### 2.8 The test

> Does the typography feel like a modern precision drafting instrument with its own identity, without
> looking like another AI-generated SaaS interface?

**Yes, on the following grounds** — and the test is worth re-running on a screenshot once F.0 lands:

1. One family, three weights, nine tokens. No fashionable face, no second display face, nothing
   rounded, nothing geometric.
2. Every millimetre in tabular figures that do not move — which no dashboard bothers with, and which
   a drafting instrument cannot do without.
3. Units typographically separated from figures, so the measurement is the thing you read.
4. Sentence case and weight for hierarchy; **no letterspaced uppercase anywhere**, which is the
   single loudest SaaS signal in the current UI.
5. The same typeface on the screen and on the printed pattern, by construction.

The risk this leaves is **blandness rather than trendiness**, and that is the correct risk to take
here: the marks, the ground and the geometry carry the character, and a neutral face is what lets
them.

---

## 3. What this changes in the specs

| Document | Change |
|---|---|
| Foundations §4 | **One family.** Plex Mono is dropped; `--t-num*` are Plex Sans 500. Vendoring reduces to Plex Sans 400/500/600. **ADR 0011 needs no amendment after all** |
| Foundations §4.3 | Numbers are distinguished by weight, size, colour and the unit column — not by face |
| Foundations §5.2 | The page-guide overlay becomes the **paper reference**: corner ticks, content area, anchored to the selection |
| Foundations §14, F.0 | Add: the minus glyph, and retiring the system monospace in `grid.ts` |
| Decisions §2.3 | My page-guide argument is superseded by this better-specified version |
| Roadmap | A new Phase 5 item: **project page setup** — schema, migration, export dialog. Closes the hard-coded-A4 gap |

## 4. Open

1. **Plex Sans, or Archivo** (§2.4). My recommendation is Plex; the alternative is real and the cost
   is stated.
2. **Dropping Plex Mono entirely** (§2.2) — this reverses what I recommended two documents ago, so it
   deserves a second look rather than a nod.
3. **The paper reference in F.5** — visual language now, feature in Phase 5. Or defer both.
4. **Whether "too big to print" should ever become a diagnostic** (§1.4). I say no; it is worth
   someone disagreeing with me before the suggestion is built.
