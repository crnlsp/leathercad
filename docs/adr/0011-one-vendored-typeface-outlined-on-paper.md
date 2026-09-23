# 11. One vendored typeface, laid out once, outlined on paper

**Status:** Accepted
**Date:** 2026-09-15

## Context

`CLAUDE.md`, `architecture.md` §1.4 and `testing.md` §8 all require vendored fonts. There are none:
`assets/fonts/` does not exist.

What the code does instead:

- Canvas and SVG draw text in `system-ui, sans-serif`, which is whatever the machine has.
- The PDF writer embeds pdf-lib's standard **Helvetica** and draws the part name above each part,
  the project name in the footer, and the verification labels with it.

So screen and paper already use different typefaces. Worse, the standard PDF fonts are limited to
WinAnsi encoding, which has no Polish-specific letter except `ó`. **Verified:** `page.drawText`
throws on "Przegroda główna" (`ł`), "Pasek zapięcia" (`ę`) and "Łódź" (`Ł`), with *WinAnsi cannot
encode*. `exportPdf` passes the part name and project name straight to it, so a project or part
named with those letters cannot be exported at all.

Phase 4 adds text that has to print: measurement values (4.10), text labels (4.11) and part
captions. Two more constraints shape the answer:

- Laser and CNC users import the SVG or PDF into cutter software, where embedded fonts are the
  least reliable part of the file.
- Display-list text is sized in device pixels. That is right for a tool's rubber-band readout and
  wrong for anything printed at 1:1.

## Decision

1. **One typeface, OFL, vendored with its licence in `assets/fonts/`.** Chosen: **IBM Plex
   Sans**. Its 1, l and I and its 0 and O are distinct at small sizes, it has tabular figures for
   dimensions, and it covers Latin Extended-A, including Polish.
2. **Two kinds of text, never mixed.**
   - **Document text** — measurement values, text labels, part captions, page furniture — is sized
     in **millimetres** and can reach paper.
   - **Overlay text** — rubber-band readouts, snap hints — is sized in **pixels** and never leaves
     the screen.

   They are separate display-item types, so an export cannot receive overlay text.
3. **Layout happens once.** A pure `packages/typography` holds the font's metrics and glyph
   outlines, and lays a string out — advances, kerning, alignment — into positioned glyphs in
   millimetres. Canvas, SVG and PDF all place text from that one layout.
4. **Screen draws the font; paper draws outlines.**
   - The canvas renders document text with the vendored font, loaded as a `FontFace`, at the
     laid-out positions. Small screen text keeps its hinting.
   - SVG and PDF export emit the glyph outlines as filled paths. No font is embedded, every viewer
     and cutter program shows the same shapes, and export snapshots compare numbers.
5. **Glyph data is generated at development time.** A script parses the font, using a development
   dependency such as opentype.js (MIT), and commits the extracted data for a declared character
   set. Nothing parses a font at run time.
6. **Helvetica leaves the PDF writer entirely.**

## Consequences

Built in slice 4.11a ([design](../superpowers/specs/2026-09-16-typography-design.md)), except the
text labels of point 2's second half, which are 4.11b. What shipped: `IBMPlexSans-Regular.woff` and
`OFL.txt` in `assets/fonts/`, taken from the `@ibm/plex-sans` package with its telemetry postinstall
declined; `pnpm fonts:generate` extracting 331 glyphs and 12 910 kerning pairs with `opentype.js`;
`packages/typography`; document and overlay text as separate display items; and a PDF writer that
embeds no font at all. `⌀` is not in the typeface, so a diameter is written `Ø`.

UI Foundations step F.0 (2026-09-23) added `IBMPlexSans-Medium.woff` and
`IBMPlexSans-SemiBold.woff`, from the same package, for the interface's 500 and 600 weights. It is
still one typeface. Glyph extraction and everything on paper still use Regular, so the new files
never reach an export.

- A new package, and new layering edges `render → typography`, `export → typography` and
  `domain → typography` — the last so `validate()` can ask whether a string can be printed at all —
  recorded in the dependency-cruiser rules.
- PDF text is not selectable or searchable. That is acceptable for a cutting template, and the
  printed instructions stay legible.
- A character outside the declared set renders as a visible replacement glyph and raises
  `TEXT_GLYPH_MISSING`. Nothing throws.
- Implementation needed two approvals from the user: obtaining the font files, and adding the
  development dependency. **Both were given on 2026-09-16**, for `@ibm/plex-sans` and `opentype.js`
  respectively.

## Alternatives rejected

- **Standard PDF fonts.** The current defect.
- **Embedding the TTF through `@pdf-lib/fontkit`.** A runtime dependency, SVG would need its own
  embedding, and how cutter software treats embedded fonts varies.
- **System fonts.** Non-deterministic, and ruled out by `testing.md` §8.
- **Outlines on screen too.** One code path fewer, but small text without hinting is hard to read,
  and reading dimensions is most of what the screen is for.
- **Inter.** Excellent, but it separates 1, l and I through OpenType stylistic sets that an outline
  pipeline would have to apply itself. **Noto Sans:** coverage far beyond the need, for much larger
  glyph data.
