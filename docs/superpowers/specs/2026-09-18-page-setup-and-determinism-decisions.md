# Page setup, rendering determinism, and what to do now

**Date:** 2026-09-18
**Status:** The determinism fixes (§1) and the page-setup model (§2.3, roadmap **5.5**) are
**implemented**. The paper reference and the typography rollout are documented, not built.
**Follows:** [paper reference and typography](2026-09-18-paper-reference-and-typography.md)

---

## 1. What was implemented

Three defects, all in the deterministic-rendering category rather than the cosmetic one. Full check
green: 1760 tests, coverage 94.97 % lines / 90.52 % branches on the pure layers.

### 1.1 The renderer named platform fonts in three places, not one

The audit found the ruler. Checking the whole package found **three**, and the other two matter more:

| Site | Was | Drew |
|---|---|---|
| `canvas2d/backend.ts` — overlay text | `system-ui, sans-serif` | **The live dimension while drawing**, part captions, tool previews |
| `canvas2d/grid.ts` — ruler | `ui-monospace, monospace` | Every millimetre label on both rulers |
| `svg/backend.ts` | `system-ui, sans-serif` | The SVG snapshot reference |

So most of the numbers on screen were **not** in the typeface the pattern prints in. The exporters
fill every string from the vendored Plex outlines, so `103.3 × 73.3 mm` was Plex on paper and
whatever the machine had on screen — the same screen-versus-paper incoherence the dash-pattern
finding was about, in typography rather than geometry.

All three now default to the vendored family. `packages/render` names **no** platform font anywhere,
and `render/src/fonts.test.ts` walks every source file in the package and fails if one reappears.

**One golden moved, deliberately** — `svg/__snapshots__/backend.test.ts.snap`, one line:

```diff
- <g font-family="system-ui, sans-serif">
+ <g font-family="'IBM Plex Sans', sans-serif">
```

That line *is* the fix. A rendered reference that names `system-ui` is a different picture on every
machine, which is the thing a snapshot exists to rule out.

### 1.2 U+2212 was missing, and so was Romanian

`declaredCharacters()` covers ASCII, Latin-1 and Latin Extended-A, plus a hand-picked set of
punctuation — which already includes `≈ ≤ ≥`, so someone had thought about mathematical symbols and
missed the one that matters.

Probing the vendored WOFF settled both questions with evidence rather than assumption:

| | In the font | Now in the set |
|---|---|---|
| `−` U+2212 true minus | **yes, advance 600** — the same as every digit | ✅ added |
| `Ș ș Ț ț` Romanian comma-below | **yes** — they sit in Latin Extended-B, past where the range stopped | ✅ added |
| `⌀` U+2300 diameter | **no** — Plex does not draw it | correctly absent; `Ø` is the substitute, and a test pins that so nobody "fixes" it by shipping a notdef box |

Regenerated: **336 glyphs, 13 350 kerning pairs**, up from 331 and 12 910. Verified purely additive —
five glyphs added, none removed, no outline changed.

The minus matters for a reason worth stating: a hyphen is narrower than a figure, so `−12.50` and
`112.50` stop lining up in a column. U+2212 at 600 units is the only character that keeps a *signed*
column tabular.

### 1.3 A character-set audit, so this cannot regress quietly

`packages/typography/src/coverage.test.ts` asserts that everything the application can put on a
drawing is in the set: digits, `. , - − × ° · ′ ″ ≈ ≤ ≥ Ø ² ³`, and the European letters a maker
might name a part with — Polish, Czech, Hungarian, Nordic, **Romanian**, Turkish, Latin-1. Plus that
the minus carries a digit-width advance, and that `⌀`'s absence is recorded rather than overlooked.

A character outside the set still draws a visible box and raises `TEXT_GLYPH_MISSING`, which remains
the right behaviour. The test is what stops a regeneration silently dropping something that then
reaches a printer.

### 1.4 What was deliberately *not* done

**The app does not yet emit U+2212.** The ruler's negative labels come from `toFixed`, which produces
ASCII hyphen-minus, and the tool previews compose `-90.0°` the same way. Adding the glyph closes the
*coverage* gap — a user can type `−` in a part name today and it would have printed as a box — but
*using* it is a formatting change across the ruler, the tool previews and the cursor readout, and it
changes user-visible strings.

That belongs with F.0, as a `formatMm()` / `formatAngle()` helper. It is visible in the screenshot: the
ruler's `-60` now has a hyphen noticeably narrower than its digits.

---

## 2. Page setup — the decision

### 2.1 What the repo says

The gap is real, and the roadmap already anticipates part of it:

- **There is no page setup in the project.** `ProjectSettings` is `gridSpacingMm`,
  `defaultStitchInsetMm`, `defaultIronPitchMm`. `exportPdfFile` never passes a `PageSetup`, so
  `DEFAULT_PAGE_SETUP` applies and **every export in the product is A4 portrait**.
- **`packages/export/src/paper.ts` already has everything else**: `PAPER_SIZES` (A5, A4, A3, Letter,
  Legal), `Orientation`, `Margins`, `contentAreaMm`, and `paperOptionsFitting` — "every paper size and
  orientation that would fit the given extent, largest first, for telling a user what would work when
  their pattern does not fit."
- **Roadmap 6.4 is already "Export dialog: preset, layers, paper, bounds."** Paper is planned; it just
  has no model to write to.

### 2.2 It has four consumers, which is what settles it

A page setup is not a feature of the export dialog. It is a property of the project that four
separate things need to agree on:

| Consumer | Needs it for | State |
|---|---|---|
| **6.4** export dialog | choosing paper | planned |
| **7.1** pagination | `contentAreaMm`, and which parts are oversized | built, hard-coded A4 |
| **7.4** print preview | previewing the same pagination | planned |
| **The paper reference** | the rectangle it draws | proposed |

Four consumers and no source of truth is exactly how two paper settings get invented — one in the
export dialog and one in the view — and then disagree. **The smallest coherent architecture is to
introduce the model once, before any of the four.**

### 2.3 Recommendation

**Introduce a minimal page setup in the project model, as a persistence slice, before 6.4 — and
build nothing else on top of it yet.**

Minimal means: `paper` (a `PaperName`), `orientation`, and nothing more. Margins and the footer stay
as constants until someone asks, because `DEFAULT_MARGINS` and the 62 mm verification footer are
already correct and changing them has print-accuracy consequences.

It lands in Phase 5 rather than Phase 6 because that is where the schema, the migration runner and
the fixture corpus live — 5.2 is already open for exactly this kind of work — and because a migration
is the whole cost of the slice. `PaperName` would move to a shared home so `domain` can name it
without importing `export`, which the layering forbids.

**What it immediately buys, with no new UI:** `exportPdfFile` passes the project's setup, and a maker
can print on A3. That alone is worth the slice.

**What stays out:** the picker, the reference overlay, presets beyond the five that exist, custom
sizes, per-part paper, and anything that touches margins or the footer.

### 2.4 The paper reference, recorded

Per your direction, and unchanged from the evaluation:

- a **workspace aid, not a diagnostic** — it never enters `diagnose()`, because a pattern larger than
  a sheet is not wrong;
- it references the **printable area** (A4 portrait: **190 × 215 mm**), never the nominal sheet;
- **corner ticks**, not a boundary rectangle;
- **off by default**, geometry never clipped or constrained;
- **F.5 owns the visual language only.** The picker, the presets and the contextual suggestion depend
  on §2.3 and wait for it.

---

## 3. Typography — recorded

- **IBM Plex Sans 400/500/600 is the single UI and rendering family.** No second family.
- **Plex Mono is dropped.** Plex Sans digits are already tabular at 600 units, so a mono would add
  texture rather than steadiness — and the same measurement appears in the property panel and on the
  drawing, where it must be the printed face.
- **Numbers are distinguished by weight (500 against 400), size, alignment and a separated unit
  column** — never by another typeface.
- **ADR 0011 stands unamended.** Nothing outside the one vendored typeface was introduced; the
  earlier claim that it needed a sentence added was a consequence of the Plex Mono proposal, which is
  gone. §1.2 *widened the declared character set*, which the ADR already describes as a deliberate,
  regenerated, committed change — so it is the ADR working, not an exception to it.

---

## 4. What to do, in four buckets

### Fix now — done in this change

1. Three platform-font fallbacks in `packages/render`, with an audit test.
2. U+2212 and the Romanian comma-below letters.
3. The character-set audit test.

### Move into the current milestone (the UI Foundations checkpoint)

| | Work | Why now |
|---|---|---|
| **F.0** | Apply the vendored face to the DOM; vendor 500/600; the type scale; `formatMm()` / `formatAngle()` emitting U+2212 | The glyph exists and nothing uses it. The formatter is the other half of the fix |
| **F.5** | The paper reference's **visual language only** — corner ticks, contrast, zoom behaviour | Once the ground is paper-coloured, "where does the page end" is asked immediately, and the answer is a canvas-language decision |
| ~~**Phase 5**~~ ✅ **done (5.5)** | `paper` + `orientation` in `ProjectSettings`, format version 9, `pageSetupFor()` as the one conversion point, `exportPdfFile` passing it | Four consumers, no source of truth. The vocabulary moved down to `domain/src/paper.ts`; the derived half stayed in `export`. Choosing the paper is still 6.4 |

### Stays Phase 5 / Phase 6 / backlog

- The paper picker, presets and the contextual suggestion — **6.4**, on top of the model.
- Margins, footer height, custom paper sizes, per-part paper.
- The print preview (**7.4**) and tiling (**7.2**).
- Screen calibration, which would make "1:1 on screen" literal rather than a nominal-DPI
  approximation.
- `⌀` as a diameter prefix — Plex cannot draw it; `Ø` is the substitute and already works.

### Two leathercraft features this audit exposes

**1. "How many sheets, and does each piece fit?" — answerable today, shown nowhere.**
`paginate()` already returns `pages` and `oversized`, and `paperOptionsFitting` already returns the
paper that *would* work. A maker currently learns all three after the PDF is written. A quiet
`3 sheets · all parts fit` in the status bar — or the honest version of it — turns an after-the-fact
report into something you can act on while designing. It is the smallest feature in this document
and probably the highest value per line: no new computation, no new model, one line of status.

**2. Grain direction — and the architectural reason it is now urgent to *decide*, not to build.**
Leather stretches across the grain, so every pattern piece in a real workshop carries an arrow, and
a piece cut the wrong way round is scrap. It is the most leathercraft-specific concept the model does
not have.

The audit exposes a link nobody had noticed: **`paginate` packs parts to fit the sheet, and the
obvious next optimisation is to rotate a part that would otherwise not fit.** `paperOptionsFitting`
already reasons about orientation. The moment pagination rotates a part, it is silently rotating the
grain — and the printed pattern instructs someone to cut a piece in a direction that will stretch
wrong. So the decision to make now, before 7.2 or any packing improvement, is: **pagination must
never rotate a part until the model knows which way its grain runs.** That is a one-line constraint
today and an expensive retrofit later.

---

## 5. Open

1. ~~The page-setup slice's number and position~~ — landed as **5.5**, ahead of 5.3.
2. **`formatMm()` in F.0** — it changes user-visible strings (`-60` becomes `−60` on the ruler), so it
   is a small visible change that should be seen before it is agreed.
3. **The sheet count in the status bar** — worth doing with the page-setup slice, since it needs the
   setup to be meaningful.
4. **The pagination/grain constraint** — recording it in the roadmap now, so a future packing
   improvement meets it rather than discovering it.
