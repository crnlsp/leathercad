# Typography: one typeface, laid out once (slice 4.11a) — design

**Date:** 2026-09-16
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Decisions:** [ADR 0011](../../adr/0011-one-vendored-typeface-outlined-on-paper.md)
**Invariants delivered:** X5 (`domain-model.md` §8.5); `TEXT_GLYPH_MISSING` for E2

---

## Why this is third

Because the export is broken today. pdf-lib's standard fonts are WinAnsi, which has no `ł` or `ę`,
so `page.drawText` **throws** on a part named "Przegroda główna" — a Polish user cannot export their
project at all. Everything else here follows from fixing that properly rather than locally.

Typography is also a project-wide decision, not a measurement feature's private one: 4.10's
dimension values, 4.11b's text labels and today's part captions are all the same problem, and
solving it once is what stops three different answers appearing.

## Scope

**4.11a — this slice.** The foundation, and the live defect:

- the vendored typeface, its licence, and the generated glyph outlines;
- `packages/typography`: metrics, layout in millimetres, outlines;
- document text and overlay text as separate display items;
- the canvas drawing the font at the laid-out positions; SVG and PDF filling the outlines;
- Helvetica out of the PDF writer entirely — **no font is embedded in any export**;
- part captions, the same words and size on screen and on paper;
- `TEXT_GLYPH_MISSING` through the 4.12a diagnostic channel.

**4.11b — next.** Free text labels: a `text-label` feature kind, its editor, the format version
bump and its fixture. Deliberately separate, because it is the only part of 4.11 that persists
anything.

## Acceptance criteria

1. A part named "Przegroda główna" exports to PDF. Before this slice the export threw.
2. No exported PDF embeds a font; every string in it is filled outlines.
3. Each part is captioned above it on the canvas, in the same words the printed sheet uses —
   "Card holder — cut 2".
4. Canvas text is sized in millimetres: it grows as the user zooms in, because it is part of the
   drawing. Tool readouts keep their fixed pixel size.
5. A part named with a character the typeface has no glyph for draws a visible box and is reported
   as `TEXT_GLYPH_MISSING` in the problems panel. Nothing throws.
6. The same string produces the same glyph positions on every machine, in the app and in tests.

## Decisions

### The typeface, and how it gets here

IBM Plex Sans, chosen in ADR 0011. Two approvals were recorded there and both were given:

- **`@ibm/plex-sans` as a devDependency**, from which `IBMPlexSans-Regular.woff` and `OFL.txt` are
  **copied into `assets/fonts/` and committed**. The dependency pins where the file came from; the
  committed file is what the app and the generator actually read, so neither needs node_modules.
  Its `ibmtelemetry` postinstall is **declined** in `pnpm-workspace.yaml`: we need the glyphs, not
  the usage reporting.
- **`opentype.js` as a devDependency**, used only by `packages/typography/tools/generateGlyphs.mjs`.

WOFF rather than WOFF2 or TTF, because one file then serves both uses: opentype.js parses it at
development time and the browser loads it as a `FontFace` at run time.

### What is committed, and what is computed

`pnpm fonts:generate` writes `packages/typography/src/generated/plexSans.ts`: 331 glyphs and 12 910
kerning pairs, in **font units with Y up** — the convention every other coordinate here follows,
where opentype.js hands them over Y down.

The declared set is ASCII, Latin-1 and **Latin Extended-A** — which is what makes Polish, Czech and
Hungarian work — plus the punctuation a dimension needs. `⌀` (U+2300) is **not in the typeface**, so
a diameter is written with `Ø`, which is.

Outlines are stored as `M`/`L`/`Q`/`C`/`Z` commands. Quadratics stay quadratic in the data and
become cubics through the geometry layer's own exact conversion at load, rather than carrying a
second curve kind through every backend.

### Two kinds of text, never mixed

| | Document text | Overlay text |
|---|---|---|
| Sized in | millimetres | pixels |
| Can reach paper | yes | **never** |
| Examples | part captions, dimension values (4.10), labels (4.11b) | rubber-band readouts, snap hints |
| Display item | `document-text`, carrying the layout | `overlay-text`, carrying a string |

They are separate item kinds so that an exporter cannot be handed overlay text by accident — the
type system refuses rather than a convention being remembered.

### Laid out once

`layoutText(text, sizeMm)` produces advances, kerning and a position per glyph. Everything
downstream reads those positions:

- **canvas** draws the vendored font, one `fillText` per glyph, at the laid-out positions, so the
  browser's own measurement can never disagree with the paper's;
- **SVG** and **PDF** fill the same glyphs as outline paths.

A missing glyph becomes the typeface's `.notdef` box — visible, advancing normally, never throwing.

### Captions live in `render`, not `domain`

`describePart(part)` — "Card holder — cut 2" — is presentation: the domain knows a part is cut
twice, not how to say so. It sits in `render/captions.ts`, which `export` imports, so the caption on
screen and the caption on paper are one function and one size. This keeps the rule the diagnostic
channel established: **domain logic never produces user-facing strings.**

### One new layering edge into `domain`

`domain → typography`, for exactly one thing: whether the typeface can render a string. Whether
text will print is a design rule (DR5), and design rules live in `validate()`, so the domain has to
be able to ask. `typography` sits beside `geometry` — pure millimetre maths over committed data —
so the graph stays acyclic and nothing about leatherwork leaks into it.

`TEXT_GLYPH_MISSING` is reported through `diagnose()` like everything else. No second error channel.

## Deliberately not here

- **Text labels as features**, and the format version bump they need. Slice 4.11b.
- **Bold, italic, any second weight.** One face until something needs another.
- **Text selectable in the PDF.** Outlines are not searchable; for a cutting template that is the
  right trade, and ADR 0011 already recorded it.
- **Captions inside `boundsMm`.** A caption sits in the gap above its piece; pagination still packs
  geometry only, as it did before.

## Tests

- **Coverage of the set**: every character of "Przegroda główna", "Pasek zapięcia", "Łódź" and the
  dimension punctuation resolves to a glyph.
- **Layout**: advances, kerning (AV closes by exactly the typeface's 41 units), linear scaling with
  size, width equals the last advance, and determinism.
- **Outlines**: a letter with a counter gives two closed contours; a capital reaches the typeface's
  cap height; a descender goes below the baseline; a space draws nothing; glyphs land where they
  were placed. `Ł` overhangs its advance to the left — found by a property test that was wrong, and
  kept as a pinned fact.
- **Backends**: the canvas draws one `fillText` per glyph and sizes document text by the zoom; the
  SVG backend emits filled paths and no `<text>`.
- **Export**: a part named in Polish exports, four more Polish names export, no page has anything in
  its font dictionary, and a longer caption makes a longer file.
- **Rule**: `TEXT_GLYPH_MISSING` for an unprintable part name, silence for a Polish one.
- **End to end**: naming a part "Przegroda główna" in the app and exporting produces a one-page PDF
  with no error.
